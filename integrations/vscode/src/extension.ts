import * as vscode from "vscode";
import { getConfig, isConfigured, onConfigChange, setExtensionPath } from "./config.js";
import { PactClient, type InboxEntry } from "./pact-client.js";
import { Poller } from "./poller.js";
import { InboxTreeProvider } from "./providers/inbox-tree.js";
import { DetailWebviewProvider } from "./providers/detail-webview.js";
import { ComposeWebviewPanel } from "./providers/compose-webview.js";
import { CatalogTreeProvider } from "./providers/catalog-tree.js";
import { DashboardWebviewProvider } from "./providers/dashboard-webview.js";
import { InboxWebviewProvider } from "./providers/inbox-webview.js";
import { registerMcpProvider } from "./mcp-provider.js";
import { DraftWatcher, type ResponseDraft, type SendDraft } from "./draft-watcher.js";
import { createLogger, disposeLogger } from "./logger.js";

const log = createLogger("Extension");

let client: PactClient | undefined;
let poller: Poller | undefined;
let draftWatcher: DraftWatcher | undefined;
let knownRequestIds: Set<string> | null = null; // null = first poll (no notifications)

export function activate(context: vscode.ExtensionContext): void {
  setExtensionPath(context.extensionUri.fsPath);
  log.info("Activating PACT extension");

  const inboxTree = new InboxTreeProvider();
  const config = getConfig();
  const configured = isConfigured();

  // Set context for welcome view
  vscode.commands.executeCommand(
    "setContext",
    "pact.configured",
    configured,
  );

  // Register tree view
  const treeView = vscode.window.createTreeView("pact.inbox", {
    treeDataProvider: inboxTree,
    showCollapseAll: true,
  });
  context.subscriptions.push(treeView);

  // Catalog tree view
  const catalogTree = new CatalogTreeProvider();
  context.subscriptions.push(
    vscode.window.createTreeView("pact.catalog", {
      treeDataProvider: catalogTree,
      showCollapseAll: true,
    }),
  );

  // Status bar with quick menu
  const statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  );
  statusBar.command = "pact.showMenu";
  statusBar.text = "$(mail) PACT";
  statusBar.tooltip = "PACT — click for quick menu";
  if (configured) {
    statusBar.show();
  }
  context.subscriptions.push(statusBar);

  // Compose panel (shared instance, reused across invocations)
  let composePanel: ComposeWebviewPanel | undefined;

  // Detail webview
  const detailProvider = new DetailWebviewProvider(
    context.extensionUri,
    client ?? new PactClient(config), // placeholder if not configured
  );
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      DetailWebviewProvider.viewType,
      detailProvider,
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
  );

  // Dashboard webview
  const dashboardProvider = new DashboardWebviewProvider(
    context.extensionUri,
    client ?? new PactClient(config),
  );
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      DashboardWebviewProvider.viewType,
      dashboardProvider,
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
  );

  // Inbox table webview
  const inboxWebviewProvider = new InboxWebviewProvider(
    context.extensionUri,
    client ?? new PactClient(config),
  );
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      InboxWebviewProvider.viewType,
      inboxWebviewProvider,
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
  );

  // Create client + poller if configured
  if (configured) {
    client = new PactClient(config);
    detailProvider.setClient(client);
    dashboardProvider.setClient(client);
    inboxWebviewProvider.setClient(client);
    catalogTree.setClient(client);
    catalogTree.refresh();

    poller = new Poller(client, config.pollInterval * 1000);
    detailProvider.setPoller(poller);

    poller.onDidChange((entries) => {
      inboxTree.update(entries);

      // Update tree view badge
      treeView.badge = entries.length > 0
        ? { value: entries.length, tooltip: `${entries.length} pending request(s)` }
        : undefined;

      // Update status bar count + color
      updateStatusBar(statusBar, entries.length);

      // Push data to dashboard and inbox webview
      dashboardProvider.updateWithEntries(entries);
      inboxWebviewProvider.updateWithEntries(entries);

      // Detect new requests and notify (skip first poll)
      notifyNewRequests(entries);
    });

    poller.onError((err) => {
      log.error(`Poll error: ${err.message}`);
      statusBar.backgroundColor = new vscode.ThemeColor(
        "statusBarItem.errorBackground",
      );
    });

    poller.start();

    // Draft watcher — picks up drafts written by AI agents
    draftWatcher = new DraftWatcher(config.repoPath, config.draftMaxAgeDays);

    draftWatcher.onResponseDraft(async (draft: ResponseDraft) => {
      let label = draft.requestId;
      try {
        if (client) {
          const status = (await client.checkStatus(draft.requestId)) as {
            request?: { subject?: string };
          };
          if (status.request?.subject) label = status.request.subject;
        }
      } catch { /* use requestId as label */ }

      const action = await vscode.window.showInformationMessage(
        `Draft response for "${label}" from AI${draft.note ? ` — ${draft.note}` : ""}`,
        "Review",
        "Discard",
      );

      if (action === "Review") {
        vscode.commands.executeCommand("setContext", "pact.hasSelectedRequest", true);
        await detailProvider.showRequestWithDraft(draft.requestId, {
          responseBundle: draft.responseBundle,
          note: draft.note,
        });
      }

      // Clean up the draft file regardless of action
      draftWatcher?.cleanup(draft.filePath);
    });

    draftWatcher.onSendDraft(async (draft: SendDraft) => {
      const label = draft.subject || draft.requestType;

      const action = await vscode.window.showInformationMessage(
        `Draft request "${label}" (${draft.requestType}) from AI${draft.note ? ` — ${draft.note}` : ""}`,
        "Review",
        "Discard",
      );

      if (action === "Review" && client) {
        if (!composePanel) {
          composePanel = new ComposeWebviewPanel(context.extensionUri, client);
        }
        composePanel.setClient(client);
        await composePanel.openWithDraft(draft);
      }

      draftWatcher?.cleanup(draft.filePath);
    });

    draftWatcher.start();
  }

  // --- Commands ---

  // Quick menu (status bar click)
  context.subscriptions.push(
    vscode.commands.registerCommand("pact.showMenu", async () => {
      const items: vscode.QuickPickItem[] = [
        { label: "$(refresh) Refresh Inbox", description: "Check for new requests" },
        { label: "$(mail) Send Request", description: "Compose a new pact request" },
        { label: "$(inbox) Open Inbox", description: "Focus the inbox view" },
        { label: "$(list-unordered) Manage Subscriptions", description: "Subscribe/unsubscribe from groups" },
        { label: "$(gear) Configure", description: "Open PACT settings" },
      ];

      const pick = await vscode.window.showQuickPick(items, {
        placeHolder: "PACT Quick Actions",
      });
      if (!pick) return;

      if (pick.label.includes("Refresh")) {
        vscode.commands.executeCommand("pact.refresh");
      } else if (pick.label.includes("Send")) {
        vscode.commands.executeCommand("pact.send");
      } else if (pick.label.includes("Inbox")) {
        vscode.commands.executeCommand("pact.inbox.focus");
      } else if (pick.label.includes("Subscriptions")) {
        vscode.commands.executeCommand("pact.subscribe");
      } else if (pick.label.includes("Configure")) {
        vscode.commands.executeCommand("pact.configure");
      }
    }),
  );

  // Select request (from tree click)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "pact.selectRequest",
      async (requestId: string) => {
        vscode.commands.executeCommand(
          "setContext",
          "pact.hasSelectedRequest",
          true,
        );
        await detailProvider.showRequest(requestId);
      },
    ),
  );

  // Manual refresh
  context.subscriptions.push(
    vscode.commands.registerCommand("pact.refresh", async () => {
      if (poller) {
        await poller.poll();
      } else {
        vscode.window.showWarningMessage(
          "PACT is not configured. Run 'PACT: Configure' first.",
        );
      }
    }),
  );

  // Send request (opens compose webview panel)
  context.subscriptions.push(
    vscode.commands.registerCommand("pact.send", async () => {
      if (!client) {
        vscode.window.showWarningMessage("PACT is not configured.");
        return;
      }

      if (!composePanel) {
        composePanel = new ComposeWebviewPanel(context.extensionUri, client);
      }
      composePanel.setClient(client);
      await composePanel.open();
    }),
  );

  // Send with pre-selected type (from catalog tree click)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "pact.sendType",
      async (typeName: string) => {
        if (!client) {
          vscode.window.showWarningMessage("PACT is not configured.");
          return;
        }
        if (!composePanel) {
          composePanel = new ComposeWebviewPanel(context.extensionUri, client);
        }
        composePanel.setClient(client);
        await composePanel.open(typeName);
      },
    ),
  );

  // Refresh catalog
  context.subscriptions.push(
    vscode.commands.registerCommand("pact.refreshCatalog", () => {
      catalogTree.refresh();
    }),
  );

  // Respond (from context menu)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "pact.respond",
      async (item?: { requestId?: string } | string) => {
        const requestId =
          typeof item === "string"
            ? item
            : item?.requestId;
        if (!requestId) return;
        await detailProvider.showRequest(requestId);
      },
    ),
  );

  // Copy request ID to clipboard
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "pact.copyId",
      async (requestIdOrItem?: string | { requestId?: string }) => {
        const requestId =
          typeof requestIdOrItem === "string"
            ? requestIdOrItem
            : requestIdOrItem?.requestId;
        if (!requestId) return;

        await vscode.env.clipboard.writeText(requestId);
        vscode.window.showInformationMessage(
          `Copied request ID: ${requestId}`,
        );
      },
    ),
  );

  // Copy context bundle to clipboard
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "pact.copyContext",
      async (requestIdOrItem?: string | { requestId?: string }) => {
        const requestId =
          typeof requestIdOrItem === "string"
            ? requestIdOrItem
            : requestIdOrItem?.requestId;
        if (!requestId || !client) return;

        try {
          const status = (await client.checkStatus(requestId)) as {
            request?: {
              request_type?: string;
              subject?: string;
              context_bundle?: Record<string, unknown>;
            };
          };

          const req = status.request;
          const bundle = req?.context_bundle;

          if (!bundle || Object.keys(bundle).length === 0) {
            vscode.window.showInformationMessage(
              "This request has no context bundle.",
            );
            return;
          }

          const text = JSON.stringify(bundle, null, 2);
          await vscode.env.clipboard.writeText(text);
          vscode.window.showInformationMessage(
            "Context bundle copied to clipboard.",
          );
        } catch (err) {
          vscode.window.showErrorMessage(
            `Failed to copy context: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      },
    ),
  );

  // Manage subscriptions
  context.subscriptions.push(
    vscode.commands.registerCommand("pact.subscribe", async () => {
      if (!client) {
        vscode.window.showWarningMessage("PACT is not configured.");
        return;
      }

      const action = await vscode.window.showQuickPick(
        [
          { label: "View current subscriptions", action: "list" },
          { label: "Subscribe to a group", action: "subscribe" },
          { label: "Unsubscribe from a group", action: "unsubscribe" },
        ],
        { placeHolder: "Manage subscriptions" },
      );
      if (!action) return;

      try {
        if (action.action === "list") {
          const result = await client.subscribe();
          const data = result as { subscriptions?: string[] };
          if (data.subscriptions && data.subscriptions.length > 0) {
            vscode.window.showInformationMessage(
              `Subscriptions: ${data.subscriptions.join(", ")}`,
            );
          } else {
            vscode.window.showInformationMessage(
              "No active subscriptions.",
            );
          }
        } else {
          const groupId = await vscode.window.showInputBox({
            prompt: `Group ID to ${action.action === "subscribe" ? "subscribe to" : "unsubscribe from"}`,
            placeHolder: "e.g. backend-team",
          });
          if (!groupId) return;

          if (action.action === "subscribe") {
            await client.subscribe(groupId);
            vscode.window.showInformationMessage(
              `Subscribed to ${groupId}.`,
            );
          } else {
            await client.unsubscribe(groupId);
            vscode.window.showInformationMessage(
              `Unsubscribed from ${groupId}.`,
            );
          }
          poller?.poll();
        }
      } catch (err) {
        vscode.window.showErrorMessage(
          `Subscription error: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }),
  );

  // Configure
  context.subscriptions.push(
    vscode.commands.registerCommand("pact.configure", () => {
      vscode.commands.executeCommand(
        "workbench.action.openSettings",
        "@ext:pact-dev.vscode-pact",
      );
    }),
  );

  // --- Config change handler ---
  context.subscriptions.push(
    onConfigChange(async () => {
      const newConfig = getConfig();
      const nowConfigured = isConfigured();

      vscode.commands.executeCommand(
        "setContext",
        "pact.configured",
        nowConfigured,
      );

      if (nowConfigured) {
        statusBar.show();

        if (client) {
          await client.reconnect(newConfig);
        } else {
          client = new PactClient(newConfig);
        }

        detailProvider.setClient(client);
        dashboardProvider.setClient(client);
        inboxWebviewProvider.setClient(client);
        catalogTree.setClient(client);
        catalogTree.refresh();

        if (poller) {
          poller.setClient(client);
          poller.setInterval(newConfig.pollInterval * 1000);
        } else {
          poller = new Poller(client, newConfig.pollInterval * 1000);
          detailProvider.setPoller(poller);
          poller.onDidChange((entries) => {
            inboxTree.update(entries);
            treeView.badge = entries.length > 0
              ? { value: entries.length, tooltip: `${entries.length} pending request(s)` }
              : undefined;
            updateStatusBar(statusBar, entries.length);
            dashboardProvider.updateWithEntries(entries);
            inboxWebviewProvider.updateWithEntries(entries);
            notifyNewRequests(entries);
          });
          poller.start();
        }

        poller.poll();

        // Restart draft watcher with new repo path
        if (draftWatcher) {
          draftWatcher.restart(newConfig.repoPath, newConfig.draftMaxAgeDays);
        }
      } else {
        poller?.stop();
        draftWatcher?.dispose();
        draftWatcher = undefined;
      }
    }),
  );

  // MCP Server Definition Provider
  registerMcpProvider(context);

  // Cleanup
  context.subscriptions.push({
    dispose() {
      poller?.dispose();
      draftWatcher?.dispose();
      client?.disconnect();
      inboxTree.dispose();
      disposeLogger();
    },
  });
}

export function deactivate(): void {
  poller?.dispose();
  draftWatcher?.dispose();
  client?.disconnect();
  disposeLogger();
}

// --- Helpers ---

function updateStatusBar(
  statusBar: vscode.StatusBarItem,
  count: number,
): void {
  if (count > 0) {
    statusBar.text = `$(mail) PACT: ${count}`;
    statusBar.tooltip = `${count} pending request(s) — click for menu`;
    statusBar.backgroundColor = new vscode.ThemeColor(
      "statusBarItem.warningBackground",
    );
  } else {
    statusBar.text = "$(mail) PACT";
    statusBar.tooltip = "PACT — click for quick menu";
    statusBar.backgroundColor = undefined;
  }
  statusBar.show();
}

function notifyNewRequests(entries: InboxEntry[]): void {
  const currentIds = new Set(entries.map((e) => e.request_id));

  // First poll — seed the set, don't notify
  if (knownRequestIds === null) {
    knownRequestIds = currentIds;
    return;
  }

  // Find IDs that weren't in the previous set
  const newEntries = entries.filter((e) => !knownRequestIds!.has(e.request_id));
  knownRequestIds = currentIds;

  if (newEntries.length === 0) return;

  if (newEntries.length === 1) {
    const e = newEntries[0];
    const label = e.subject || e.summary;
    vscode.window
      .showInformationMessage(
        `New PACT request from ${e.sender}: ${label}`,
        "View",
      )
      .then((action) => {
        if (action === "View") {
          vscode.commands.executeCommand("pact.selectRequest", e.request_id);
        }
      });
  } else {
    vscode.window
      .showInformationMessage(
        `${newEntries.length} new PACT requests received`,
        "Open Inbox",
      )
      .then((action) => {
        if (action === "Open Inbox") {
          vscode.commands.executeCommand("pact.inbox.focus");
        }
      });
  }
}
