import * as vscode from "vscode";
import type { PactClient } from "../pact-client.js";
import type { Poller } from "../poller.js";
import { safeJsonForScript } from "../utils.js";
import { getWebviewHtml, getEmptyHtml, getErrorHtml } from "./base-webview.js";
import { createLogger, type Logger } from "../logger.js";

interface CheckStatusResult {
  status: string;
  request: {
    request_id: string;
    thread_id?: string;
    request_type: string;
    subject?: string;
    sender: { user_id: string; display_name?: string };
    context_bundle?: Record<string, unknown>;
    [key: string]: unknown;
  };
  response?: Record<string, unknown>;
  responses?: Array<Record<string, unknown>>;
  attachment_paths?: Array<{
    filename: string;
    description: string;
    path: string;
  }>;
  warning?: string;
}

/**
 * WebviewViewProvider for the request detail panel in the sidebar.
 *
 * Fetches enriched data:
 * 1. check_status — envelope, response(s), attachments
 * 2. view_thread — thread history (if thread_id exists)
 * 3. pact_discover — pact definition (for respond form field generation)
 *
 * Uses request sequencing to discard stale responses when the user
 * clicks between requests quickly.
 */
export class DetailWebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "pact.detail";

  private view?: vscode.WebviewView;
  private currentRequestId?: string;
  private loadSequence = 0;
  private log: Logger;
  private poller?: Poller;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private client: PactClient,
  ) {
    this.log = createLogger("Detail");
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionUri, "dist"),
        vscode.Uri.joinPath(this.extensionUri, "webview"),
        vscode.Uri.joinPath(this.extensionUri, "resources"),
      ],
    };

    // Handle messages from webview
    webviewView.webview.onDidReceiveMessage(async (msg) => {
      switch (msg.type) {
        case "respond":
          await this.handleRespond(msg.requestId, msg.responseBundle, msg.note);
          break;
        case "edit":
          await this.handleEdit(msg.requestId, msg.moveTo, msg.note);
          break;
        case "copyId":
          vscode.commands.executeCommand("pact.copyId", msg.requestId);
          break;
        case "copyContext":
          vscode.commands.executeCommand("pact.copyContext", msg.requestId);
          break;
        case "openFile":
          if (msg.path) {
            const uri = vscode.Uri.file(msg.path);
            vscode.commands.executeCommand("vscode.open", uri);
          }
          break;
      }
    });

    // Show empty state initially
    this.view.webview.html = getEmptyHtml(
      "Select a request from the inbox to view details.",
    );
  }

  /** Show a specific request's details with full enrichment. */
  async showRequest(requestId: string): Promise<void> {
    this.currentRequestId = requestId;
    const seq = ++this.loadSequence;
    if (!this.view) return;

    this.log.debug(`Loading request ${requestId} (seq=${seq})`);

    try {
      // Try cache first, fall back to fetch
      const checkStatus = (this.poller?.getCachedDetail(requestId) ??
        (await this.client.checkStatus(requestId))) as CheckStatusResult;

      if (seq !== this.loadSequence) return;

      // Try cached supplementary data
      const cachedThread = checkStatus.request.thread_id
        ? this.poller?.getCachedThread(checkStatus.request.thread_id)
        : undefined;
      const cachedDefinition = this.poller?.getCachedDefinition(
        checkStatus.request.request_type,
      );

      let thread: unknown[] | undefined = cachedThread;
      let definition: unknown | undefined = cachedDefinition;

      // Fetch any missing supplementary data
      const needThread = checkStatus.request.thread_id && !cachedThread;
      const needDefinition = !cachedDefinition;

      if (needThread || needDefinition) {
        const [fetchedThread, fetchedDef] = await Promise.all([
          needThread
            ? this.fetchThread(checkStatus.request.thread_id)
            : undefined,
          needDefinition
            ? this.fetchDefinition(checkStatus.request.request_type)
            : undefined,
        ]);
        if (seq !== this.loadSequence) return;
        if (fetchedThread) thread = fetchedThread;
        if (fetchedDef) definition = fetchedDef;
      }

      const payload = { checkStatus, thread, definition };
      this.renderRequest(payload);
    } catch (err) {
      if (seq !== this.loadSequence) return;
      const msg = err instanceof Error ? err.message : String(err);
      this.log.error(`Failed to load request ${requestId}: ${msg}`);
      if (this.view) {
        this.view.webview.html = getErrorHtml(msg);
      }
    }
  }

  /** Show a request with an AI-drafted response pre-filled in the respond form. */
  async showRequestWithDraft(
    requestId: string,
    draft: { responseBundle: Record<string, unknown>; note?: string },
  ): Promise<void> {
    this.currentRequestId = requestId;
    const seq = ++this.loadSequence;
    if (!this.view) return;

    try {
      const checkStatus = (this.poller?.getCachedDetail(requestId) ??
        (await this.client.checkStatus(requestId))) as CheckStatusResult;

      if (seq !== this.loadSequence) return;

      const cachedThread = checkStatus.request.thread_id
        ? this.poller?.getCachedThread(checkStatus.request.thread_id)
        : undefined;
      const cachedDefinition = this.poller?.getCachedDefinition(
        checkStatus.request.request_type,
      );

      let thread: unknown[] | undefined = cachedThread;
      let definition: unknown | undefined = cachedDefinition;

      const needThread = checkStatus.request.thread_id && !cachedThread;
      const needDefinition = !cachedDefinition;

      if (needThread || needDefinition) {
        const [fetchedThread, fetchedDef] = await Promise.all([
          needThread
            ? this.fetchThread(checkStatus.request.thread_id)
            : undefined,
          needDefinition
            ? this.fetchDefinition(checkStatus.request.request_type)
            : undefined,
        ]);
        if (seq !== this.loadSequence) return;
        if (fetchedThread) thread = fetchedThread;
        if (fetchedDef) definition = fetchedDef;
      }

      const payload = { checkStatus, thread, definition, draft };
      this.renderRequest(payload);
    } catch (err) {
      if (seq !== this.loadSequence) return;
      const msg = err instanceof Error ? err.message : String(err);
      this.log.error(`Failed to load draft for ${requestId}: ${msg}`);
      if (this.view) {
        this.view.webview.html = getErrorHtml(msg);
      }
    }
  }

  setClient(client: PactClient): void {
    this.client = client;
  }

  setPoller(poller: Poller): void {
    this.poller = poller;
  }

  private async fetchThread(
    threadId?: string,
  ): Promise<unknown[] | undefined> {
    if (!threadId) return undefined;
    try {
      const result = (await this.client.viewThread(threadId)) as {
        entries?: unknown[];
      };
      return result.entries;
    } catch {
      return undefined;
    }
  }

  private async fetchDefinition(
    requestType: string,
  ): Promise<unknown | undefined> {
    try {
      const result = (await this.client.send({
        request_type: requestType,
      })) as Record<string, unknown>;
      if (result.mode === "compose") {
        return {
          name: result.request_type ?? requestType,
          description: result.description,
          when_to_use: result.when_to_use,
          context_bundle: result.context_bundle,
          response_bundle: result.response_bundle,
          scope: result.scope,
          multi_round: result.multi_round,
        };
      }
    } catch {
      // definition not found — not critical
    }
    return undefined;
  }

  private async handleRespond(
    requestId: string,
    responseBundle: Record<string, unknown>,
    note?: string,
  ): Promise<void> {
    try {
      await this.client.respond(requestId, responseBundle, note);
      this.log.info(`Response sent for ${requestId}`);
      // Invalidate cache so the detail refresh fetches fresh data
      this.poller?.invalidateDetail(requestId);
      // Send toast to webview instead of system notification
      this.view?.webview.postMessage({
        type: "toast",
        message: "Response sent successfully.",
        variant: "success",
      });
      await this.showRequest(requestId);
      vscode.commands.executeCommand("pact.refresh");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log.errorNotify(`Failed to respond: ${msg}`);
    }
  }

  private async handleEdit(
    requestId: string,
    moveTo: "pending" | "active" | "completed" | "cancelled",
    note?: string,
  ): Promise<void> {
    try {
      await this.client.edit({ request_id: requestId, move_to: moveTo, note });
      this.log.info(`Status changed to ${moveTo} for ${requestId}`);
      this.poller?.invalidateDetail(requestId);
      this.view?.webview.postMessage({
        type: "toast",
        message: `Moved to ${moveTo}.`,
        variant: "success",
      });
      await this.showRequest(requestId);
      vscode.commands.executeCommand("pact.refresh");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log.errorNotify(`Failed to change status: ${msg}`);
    }
  }

  private renderRequest(data: unknown): void {
    if (!this.view) return;

    this.view.webview.html = getWebviewHtml(
      this.view.webview,
      this.extensionUri,
      {
        element: "pact-detail",
        elementId: "detail",
        title: "Request Detail",
        initScript: `
          const detail = document.getElementById('detail');
          if (detail) {
            detail.data = ${safeJsonForScript(data)};
          }
        `,
      },
    );
  }
}
