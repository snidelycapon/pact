import * as vscode from "vscode";
import * as crypto from "crypto";
import type { PactClient, InboxEntry } from "./pact-client.js";

export interface PollResult {
  entries: InboxEntry[];
  /** True if the data changed since last poll. */
  changed: boolean;
}

/**
 * Background poller that periodically calls pact_do inbox
 * and computes content hashes for change detection.
 *
 * Adapted from Craft Agents' pact-poller.ts but simplified:
 * no session creation — just fires an event when data changes.
 */
export class Poller implements vscode.Disposable {
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastHash = "";
  private _entries: InboxEntry[] = [];
  private _polling = false;
  private _prefetching = false;

  // Eager-loaded caches — populated in background after each inbox poll
  private detailCache = new Map<string, unknown>();
  private threadCache = new Map<string, unknown[]>();
  private definitionCache = new Map<string, unknown>();

  private readonly _onDidChange = new vscode.EventEmitter<InboxEntry[]>();
  readonly onDidChange = this._onDidChange.event;

  private readonly _onError = new vscode.EventEmitter<Error>();
  readonly onError = this._onError.event;

  constructor(
    private client: PactClient,
    private intervalMs: number,
  ) {}

  get entries(): InboxEntry[] {
    return this._entries;
  }

  /** Start polling. Performs an immediate first poll. */
  start(): void {
    if (this.timer) return;
    this.poll(); // immediate first poll
    this.timer = setInterval(() => this.poll(), this.intervalMs);
  }

  /** Stop polling. */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Trigger an immediate poll (e.g. manual refresh). */
  async poll(): Promise<void> {
    if (this._polling) return; // skip if already in-flight
    this._polling = true;

    try {
      const entries = await this.client.inbox();
      const hash = this.computeHash(entries);

      if (hash !== this.lastHash) {
        this.lastHash = hash;
        this._entries = entries;
        this._onDidChange.fire(entries);
      }

      // Eagerly prefetch full details in background so clicks are instant
      this.prefetchDetails(entries).catch(() => {});
    } catch (err) {
      this._onError.fire(
        err instanceof Error ? err : new Error(String(err)),
      );
    } finally {
      this._polling = false;
    }
  }

  /** Update interval (e.g. when settings change). */
  setInterval(ms: number): void {
    this.intervalMs = ms;
    if (this.timer) {
      this.stop();
      this.start();
    }
  }

  /** Update the MCP client reference (e.g. after reconnect). */
  setClient(client: PactClient): void {
    this.client = client;
  }

  dispose(): void {
    this.stop();
    this._onDidChange.dispose();
    this._onError.dispose();
  }

  /** Get a cached check_status result. */
  getCachedDetail(requestId: string): unknown | undefined {
    return this.detailCache.get(requestId);
  }

  /** Get cached thread entries. */
  getCachedThread(threadId: string): unknown[] | undefined {
    return this.threadCache.get(threadId);
  }

  /** Get a cached pact definition. */
  getCachedDefinition(requestType: string): unknown | undefined {
    return this.definitionCache.get(requestType);
  }

  /** Remove a cached detail (e.g. after responding, so next show fetches fresh). */
  invalidateDetail(requestId: string): void {
    this.detailCache.delete(requestId);
  }

  private async prefetchDetails(entries: InboxEntry[]): Promise<void> {
    if (this._prefetching) return;
    this._prefetching = true;

    try {
      // Prune entries no longer in inbox
      const currentIds = new Set(entries.map((e) => e.request_id));
      for (const id of this.detailCache.keys()) {
        if (!currentIds.has(id)) this.detailCache.delete(id);
      }

      // Clear definition cache so definitions are always re-fetched fresh
      this.definitionCache.clear();

      // Phase 1: check_status for every entry
      // The inbox call already did a git pull, so the redundant pull
      // inside each check_status may produce a stale-data warning.
      // Strip it — the data is as fresh as the inbox sync allows.
      const results = await Promise.allSettled(
        entries.map(async (entry) => {
          const detail = await this.client.checkStatus(entry.request_id);
          if (detail && typeof detail === "object" && "warning" in detail) {
            delete (detail as Record<string, unknown>).warning;
          }
          this.detailCache.set(entry.request_id, detail);
          return detail;
        }),
      );

      // Collect thread IDs and request types from successful results
      const threadIds = new Set<string>();
      const requestTypes = new Set<string>();

      for (const result of results) {
        if (result.status === "fulfilled") {
          const req = (result.value as { request?: { thread_id?: string; request_type?: string } })?.request;
          if (req?.thread_id) threadIds.add(req.thread_id);
          if (req?.request_type) requestTypes.add(req.request_type);
        }
      }

      // Phase 2: threads + definitions in parallel
      await Promise.allSettled([
        ...Array.from(threadIds).map(async (id) => {
          try {
            const result = (await this.client.viewThread(id)) as {
              entries?: unknown[];
            };
            if (result.entries) this.threadCache.set(id, result.entries);
          } catch {
            // thread fetch failed — not critical
          }
        }),
        ...Array.from(requestTypes).map(async (type) => {
            try {
              const result = (await this.client.send({
                request_type: type,
              })) as Record<string, unknown>;
              if (result.mode === "compose") {
                this.definitionCache.set(type, {
                  name: result.request_type ?? type,
                  description: result.description,
                  when_to_use: result.when_to_use,
                  context_bundle: result.context_bundle,
                  response_bundle: result.response_bundle,
                  scope: result.scope,
                  multi_round: result.multi_round,
                });
              }
            } catch {
              // definition fetch failed — not critical
            }
          }),
      ]);
    } finally {
      this._prefetching = false;
    }
  }

  private computeHash(entries: InboxEntry[]): string {
    const data = JSON.stringify(
      entries.map((e) => ({
        id: e.request_id,
        type: e.request_type,
        sender: e.sender,
        summary: e.summary,
        subject: e.subject,
        amendment_count: e.amendment_count,
        attachment_count: e.attachment_count,
      })),
    );
    return crypto.createHash("sha256").update(data).digest("hex").slice(0, 12);
  }
}
