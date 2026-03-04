import * as vscode from "vscode";
import type { PactClient, InboxEntry } from "../pact-client.js";
import { getWebviewHtml, getEmptyHtml } from "./base-webview.js";
import { createLogger, type Logger } from "../logger.js";

/**
 * Sidebar webview showing an at-a-glance dashboard of inbox state:
 * summary cards, type/sender breakdowns, and recent items.
 */
export class DashboardWebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "pact.dashboard";

  private view?: vscode.WebviewView;
  private log: Logger;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private client: PactClient,
  ) {
    this.log = createLogger("Dashboard");
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
        case "fetchDashboard":
          await this.sendDashboardData();
          break;
        case "selectRequest":
          vscode.commands.executeCommand("pact.selectRequest", msg.requestId);
          break;
      }
    });

    webviewView.webview.html = getWebviewHtml(
      webviewView.webview,
      this.extensionUri,
      { element: "pact-dashboard", title: "PACT Dashboard" },
    );
  }

  /** Push updated inbox data to the dashboard. */
  updateWithEntries(entries: InboxEntry[]): void {
    if (!this.view) return;

    const summary = this.buildSummary(entries);
    this.view.webview.postMessage({ type: "dashboardData", data: summary });
  }

  setClient(client: PactClient): void {
    this.client = client;
  }

  private async sendDashboardData(): Promise<void> {
    try {
      const entries = await this.client.inbox();
      this.updateWithEntries(entries);
    } catch (err) {
      this.log.error("Failed to fetch dashboard data", err);
    }
  }

  private buildSummary(entries: InboxEntry[]) {
    const byType: Record<string, number> = {};
    const bySender: Record<string, number> = {};

    for (const e of entries) {
      byType[e.request_type] = (byType[e.request_type] || 0) + 1;
      bySender[e.sender] = (bySender[e.sender] || 0) + 1;
    }

    // Most recent 5
    const recent = [...entries]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5)
      .map((e) => ({
        request_id: e.request_id,
        subject: e.subject,
        summary: e.summary,
        request_type: e.request_type,
        sender: e.sender,
        created_at: e.created_at,
      }));

    return { total: entries.length, byType, bySender, recent };
  }
}
