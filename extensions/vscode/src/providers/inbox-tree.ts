import * as vscode from "vscode";
import type { InboxEntry } from "../pact-client.js";

type TreeItem = StatusGroup | RequestItem;

const STATUS_ORDER = ["pending", "active", "completed", "cancelled"] as const;
type Status = (typeof STATUS_ORDER)[number];

const STATUS_ICONS: Record<Status, vscode.ThemeIcon> = {
  pending: new vscode.ThemeIcon(
    "inbox",
    new vscode.ThemeColor("charts.yellow"),
  ),
  active: new vscode.ThemeIcon(
    "sync~spin",
    new vscode.ThemeColor("charts.blue"),
  ),
  completed: new vscode.ThemeIcon(
    "check",
    new vscode.ThemeColor("charts.green"),
  ),
  cancelled: new vscode.ThemeIcon(
    "close",
    new vscode.ThemeColor("charts.red"),
  ),
};

const REQUEST_ICONS: Record<Status, vscode.ThemeIcon> = {
  pending: new vscode.ThemeIcon("mail"),
  active: new vscode.ThemeIcon("play-circle"),
  completed: new vscode.ThemeIcon("check-all"),
  cancelled: new vscode.ThemeIcon("circle-slash"),
};

/**
 * TreeDataProvider that shows inbox entries grouped by status.
 *
 * Structure:
 *   ▸ Pending (3)
 *     📩 PR #247 review — alice
 *     📩 Weekly check-in — bot
 *   ▸ Active (1)
 *     🔄 DB migration — cory
 *   ▸ Completed (5)
 *     ...
 */
export class InboxTreeProvider
  implements vscode.TreeDataProvider<TreeItem>
{
  private _onDidChangeTreeData = new vscode.EventEmitter<
    TreeItem | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private entries: InboxEntry[] = [];
  private statusEntries: Map<Status, InboxEntry[]> = new Map();

  update(entries: InboxEntry[]): void {
    this.entries = entries;

    // Group by status — inbox only returns pending, but we keep the
    // structure ready for when check_status enriches them
    this.statusEntries = new Map();
    for (const status of STATUS_ORDER) {
      this.statusEntries.set(status, []);
    }

    for (const entry of entries) {
      // Inbox entries are always pending, but future enrichment may add status
      const status: Status = "pending";
      this.statusEntries.get(status)!.push(entry);
    }

    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TreeItem): TreeItem[] {
    if (!element) {
      // Root: show status groups that have entries
      return STATUS_ORDER.filter(
        (s) => (this.statusEntries.get(s)?.length ?? 0) > 0,
      ).map((s) => new StatusGroup(s, this.statusEntries.get(s)!));
    }

    if (element instanceof StatusGroup) {
      return element.entries.map(
        (e) => new RequestItem(e, element.status),
      );
    }

    return [];
  }

  /** Get the raw entry for a request item. */
  getEntry(requestId: string): InboxEntry | undefined {
    return this.entries.find((e) => e.request_id === requestId);
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
  }
}

class StatusGroup extends vscode.TreeItem {
  constructor(
    public readonly status: Status,
    public readonly entries: InboxEntry[],
  ) {
    super(
      `${status.charAt(0).toUpperCase() + status.slice(1)} (${entries.length})`,
      vscode.TreeItemCollapsibleState.Expanded,
    );
    this.iconPath = STATUS_ICONS[status];
    this.contextValue = `status-group-${status}`;
  }
}

export class RequestItem extends vscode.TreeItem {
  public readonly requestId: string;

  constructor(
    public readonly entry: InboxEntry,
    status: Status,
  ) {
    const label = entry.subject || entry.summary;
    super(label, vscode.TreeItemCollapsibleState.None);

    this.requestId = entry.request_id;
    this.description = `${entry.request_type} · ${entry.sender}`;
    this.tooltip = this.buildTooltip(entry);
    this.iconPath = REQUEST_ICONS[status];
    this.contextValue = `${status}-request`;

    // Clicking a request selects it (shows detail webview)
    this.command = {
      command: "pact.selectRequest",
      title: "Select Request",
      arguments: [entry.request_id],
    };
  }

  private buildTooltip(entry: InboxEntry): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.appendMarkdown(`**${entry.request_type}**\n\n`);
    if (entry.subject) {
      md.appendMarkdown(`${entry.subject}\n\n`);
    }
    md.appendMarkdown(`From: ${entry.sender}\n\n`);
    md.appendMarkdown(
      `Created: ${new Date(entry.created_at).toLocaleString()}\n\n`,
    );
    if (entry.attachment_count > 0) {
      md.appendMarkdown(
        `Attachments: ${entry.attachment_count}\n\n`,
      );
    }
    if (entry.pact_description) {
      md.appendMarkdown(`---\n\n${entry.pact_description}`);
    }
    return md;
  }
}
