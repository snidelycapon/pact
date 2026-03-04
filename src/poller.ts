/**
 * Universal poller for PACT inbox changes.
 *
 * Reuses handlePactInbox directly (no MCP round-trips) to scan the
 * repo for pending requests addressed to the current user. Tracks
 * state across polls to detect new and removed requests.
 *
 * Consumers (CLI, Craft Agent, VSCode) call poll() for one-shot
 * checks or start()/stop() for continuous watch mode.
 *
 * Note: each poll() triggers a git pull via handlePactInbox. In watch
 * mode this means one pull per interval. Consumers with their own sync
 * mechanism (e.g. Craft Agent) may want to inject a no-op GitPort.pull
 * to avoid redundant fetches.
 */

import { handlePactInbox } from "./tools/pact-inbox.ts";
import type { FilePort, GitPort, ConfigPort } from "./ports.ts";
import type {
  InboxEntry,
  InboxThreadGroup,
  InboxResult,
} from "./tools/pact-inbox.ts";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface PollerConfig {
  userId: string;
  repoPath: string;
  git: GitPort;
  config: ConfigPort;
  file: FilePort;
}

export interface PollDiff {
  /** Full inbox result from this poll cycle. */
  current: InboxResult;
  /** Entries that appeared since the last poll. */
  newEntries: Array<InboxEntry | InboxThreadGroup>;
  /** Request IDs that disappeared since the last poll. */
  removedIds: string[];
  /** True on the very first poll (no prior state to diff against). */
  isFirstPoll: boolean;
}

// ---------------------------------------------------------------------------
// PactPoller
// ---------------------------------------------------------------------------

export class PactPoller {
  private knownIds = new Set<string>();
  private firstPoll = true;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private config: PollerConfig) {}

  /** One-shot poll. Returns the inbox and diff from previous state. */
  async poll(): Promise<PollDiff> {
    const result = await handlePactInbox({}, this.config);

    const currentIds = new Set<string>();
    for (const r of result.requests) {
      currentIds.add(entryId(r));
    }

    const isFirstPoll = this.firstPoll;
    this.firstPoll = false;

    const newEntries = result.requests.filter(
      (r) => !this.knownIds.has(entryId(r)),
    );

    const removedIds = [...this.knownIds].filter((id) => !currentIds.has(id));

    this.knownIds = currentIds;

    return { current: result, newEntries, removedIds, isFirstPoll };
  }

  /** Start watch mode. Calls onPoll after each iteration. */
  start(
    intervalMs: number,
    onPoll: (diff: PollDiff) => void,
    onError: (err: Error) => void,
  ): void {
    this.stop();

    const doPoll = () => {
      this.poll()
        .then(onPoll)
        .catch((err) =>
          onError(err instanceof Error ? err : new Error(String(err))),
        );
    };

    doPoll();
    this.timer = setInterval(doPoll, intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function entryId(entry: InboxEntry | InboxThreadGroup): string {
  return "is_thread_group" in entry
    ? entry.latest_request_id
    : entry.request_id;
}
