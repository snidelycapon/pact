import * as vscode from "vscode";
import type { PactClient, InboxEntry } from "../pact-client.js";
import { getWebviewHtml } from "./base-webview.js";
import { createLogger, type Logger } from "../logger.js";

/**
 * Sidebar webview that renders the inbox as a sortable/filterable table
 * using TanStack Table (via the pact-inbox-table Lit component).
 */
export class InboxWebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "pact.inboxTable";

  private view?: vscode.WebviewView;
  private log: Logger;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private client: PactClient,
  ) {
    this.log = createLogger("InboxTable");
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
      ],
    };

    webviewView.webview.onDidReceiveMessage(async (msg) => {
      switch (msg.type) {
        case "fetchInbox":
          await this.sendInboxData();
          break;
        case "selectRequest":
          vscode.commands.executeCommand("pact.selectRequest", msg.requestId);
          break;
      }
    });

    webviewView.webview.html = getWebviewHtml(
      webviewView.webview,
      this.extensionUri,
      { element: "pact-inbox-table", title: "PACT Inbox" },
    );
  }

  /** Push updated inbox data to the table. */
  updateWithEntries(entries: InboxEntry[]): void {
    if (!this.view) return;
    this.view.webview.postMessage({ type: "inboxData", data: entries });
  }

  setClient(client: PactClient): void {
    this.client = client;
  }

  private async sendInboxData(): Promise<void> {
    try {
      const entries = await this.client.inbox();
      this.updateWithEntries(entries);
    } catch (err) {
      this.log.error("Failed to fetch inbox data", err);
    }
  }
}
