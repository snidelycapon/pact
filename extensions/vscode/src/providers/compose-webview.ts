import * as vscode from "vscode";
import type { PactClient } from "../pact-client.js";
import { getWebviewHtml } from "./base-webview.js";
import { createLogger, type Logger } from "../logger.js";

/**
 * Opens a WebviewPanel for composing and sending a new PACT request.
 *
 * Two-phase flow:
 * 1. Browse catalog → select a pact type
 * 2. Fill recipient, subject, context_bundle fields → send
 *
 * The panel is shown in the editor area (not sidebar) for more room.
 */
export class ComposeWebviewPanel {
  private panel?: vscode.WebviewPanel;
  private log: Logger;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private client: PactClient,
  ) {
    this.log = createLogger("Compose");
  }

  private pendingType?: string;
  private pendingDraft?: {
    requestType: string;
    recipient?: string;
    recipients?: string[];
    subject?: string;
    contextBundle?: Record<string, unknown>;
    deadline?: string;
    note?: string;
  };

  async open(preselectedType?: string): Promise<void> {
    this.pendingType = preselectedType;

    // Reuse existing panel if it exists
    if (this.panel) {
      this.panel.reveal();
      if (preselectedType) {
        this.handleFetchSchema(preselectedType);
      }
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      "pact.compose",
      "PACT: New Request",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.extensionUri, "dist"),
          vscode.Uri.joinPath(this.extensionUri, "webview"),
        ],
      },
    );

    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });

    this.panel.webview.onDidReceiveMessage(async (msg) => {
      switch (msg.type) {
        case "fetchCatalog":
          await this.handleFetchCatalog();
          break;
        case "fetchSchema":
          await this.handleFetchSchema(msg.requestType);
          break;
        case "send":
          await this.handleSend(msg);
          break;
      }
    });

    this.panel.webview.html = getWebviewHtml(
      this.panel.webview,
      this.extensionUri,
      { element: "pact-compose", elementId: "compose", title: "PACT: New Request" },
    );

    // If a type was pre-selected (from catalog tree), skip to schema fetch
    if (this.pendingType) {
      this.handleFetchSchema(this.pendingType);
      this.pendingType = undefined;
    }
  }

  /** Open the compose panel with pre-filled draft data from an AI agent. */
  async openWithDraft(draft: {
    requestType: string;
    recipient?: string;
    recipients?: string[];
    subject?: string;
    contextBundle?: Record<string, unknown>;
    deadline?: string;
    note?: string;
  }): Promise<void> {
    this.pendingDraft = draft;
    await this.open(draft.requestType);
  }

  setClient(client: PactClient): void {
    this.client = client;
  }

  private async handleFetchCatalog(): Promise<void> {
    try {
      const catalog = await this.client.discover({ format: "full" });
      this.postMessage({ type: "catalog", data: catalog });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log.error(`Catalog fetch failed: ${msg}`);
      this.postMessage({ type: "error", message: `Failed to fetch catalog: ${msg}` });
    }
  }

  private async handleFetchSchema(requestType: string): Promise<void> {
    try {
      const schema = await this.client.send({ request_type: requestType });
      this.postMessage({ type: "schema", data: schema });

      // If there's a pending draft, send the prefill data after the schema
      if (this.pendingDraft) {
        const draft = this.pendingDraft;
        this.pendingDraft = undefined;

        // Small delay to let the webview process the schema first
        setTimeout(() => {
          const recipient = draft.recipients
            ? draft.recipients.join(", ")
            : draft.recipient ?? "";
          this.postMessage({
            type: "prefill",
            recipient,
            subject: draft.subject ?? "",
            contextBundle: draft.contextBundle ?? {},
            deadline: draft.deadline ?? "",
            note: draft.note,
          });
        }, 100);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log.error(`Schema fetch failed for ${requestType}: ${msg}`);
      this.postMessage({ type: "error", message: `Failed to fetch schema: ${msg}` });
    }
  }

  private async handleSend(msg: {
    requestType: string;
    recipient: string;
    subject: string;
    contextBundle: Record<string, unknown>;
    deadline?: string;
    groupRef?: string;
  }): Promise<void> {
    try {
      // Parse recipients (comma-separated → array)
      const recipientStr = msg.recipient.trim();
      const hasMultiple = recipientStr.includes(",");

      const sendParams: Record<string, unknown> = {
        action: "send",
        request_type: msg.requestType,
        subject: msg.subject,
        context_bundle: msg.contextBundle,
      };

      if (hasMultiple) {
        sendParams.recipients = recipientStr
          .split(",")
          .map((r) => r.trim())
          .filter(Boolean);
      } else {
        sendParams.recipient = recipientStr;
      }

      if (msg.deadline) sendParams.deadline = msg.deadline;
      if (msg.groupRef) sendParams.group_ref = msg.groupRef;

      await this.client.do(sendParams);

      this.log.info(`Request sent to ${recipientStr}`);
      vscode.window.showInformationMessage(
        `Request sent to ${recipientStr}.`,
      );
      this.panel?.dispose();
      vscode.commands.executeCommand("pact.refresh");
    } catch (err) {
      const msg2 = err instanceof Error ? err.message : String(err);
      this.log.error(`Send failed: ${msg2}`);
      this.postMessage({ type: "error", message: `Send failed: ${msg2}` });
    }
  }

  private postMessage(msg: unknown): void {
    this.panel?.webview.postMessage(msg);
  }
}
