import * as vscode from "vscode";
import type { PactClient } from "../pact-client.js";

type TreeItem = ScopeGroup | PactTypeItem;

interface CatalogEntry {
  name: string;
  description?: string;
  when_to_use?: string[];
  scope?: string;
}

const SCOPE_ORDER = ["global", "org", "repo", "team"] as const;

const SCOPE_ICONS: Record<string, vscode.ThemeIcon> = {
  global: new vscode.ThemeIcon("globe"),
  org: new vscode.ThemeIcon("organization"),
  repo: new vscode.ThemeIcon("repo"),
  team: new vscode.ThemeIcon("people"),
};

/**
 * TreeDataProvider that shows available pact types grouped by scope.
 *
 * Structure:
 *   ▸ global (3)
 *     📋 ask — Ask a question
 *     📋 share — Share information
 *   ▸ team (2)
 *     📋 check-in--weekly — Weekly status check-in
 */
export class CatalogTreeProvider
  implements vscode.TreeDataProvider<TreeItem>
{
  private _onDidChangeTreeData = new vscode.EventEmitter<
    TreeItem | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private entries: CatalogEntry[] = [];
  private scopeEntries = new Map<string, CatalogEntry[]>();
  private client: PactClient | undefined;

  setClient(client: PactClient): void {
    this.client = client;
  }

  async refresh(): Promise<void> {
    if (!this.client) return;

    try {
      const result = (await this.client.discover({ format: "full" })) as {
        pacts?: CatalogEntry[];
      };
      this.entries = result.pacts ?? [];

      // Group by scope
      this.scopeEntries = new Map();
      for (const entry of this.entries) {
        const scope = entry.scope || "global";
        if (!this.scopeEntries.has(scope)) {
          this.scopeEntries.set(scope, []);
        }
        this.scopeEntries.get(scope)!.push(entry);
      }

      this._onDidChangeTreeData.fire();
    } catch (err) {
      console.error("[PACT] Catalog fetch error:", err);
    }
  }

  getTreeItem(element: TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TreeItem): TreeItem[] {
    if (!element) {
      // Root: if only one scope, skip grouping and show items directly
      const scopeIndex = (s: string) => {
        const i = SCOPE_ORDER.indexOf(s as (typeof SCOPE_ORDER)[number]);
        return i === -1 ? 99 : i;
      };
      const scopes = [...this.scopeEntries.keys()].sort(
        (a, b) => scopeIndex(a) - scopeIndex(b),
      );

      if (scopes.length === 0) return [];
      if (scopes.length === 1) {
        return (this.scopeEntries.get(scopes[0]) ?? []).map(
          (e) => new PactTypeItem(e),
        );
      }

      return scopes.map(
        (s) => new ScopeGroup(s, this.scopeEntries.get(s)!),
      );
    }

    if (element instanceof ScopeGroup) {
      return element.entries.map((e) => new PactTypeItem(e));
    }

    return [];
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
  }
}

class ScopeGroup extends vscode.TreeItem {
  constructor(
    public readonly scope: string,
    public readonly entries: CatalogEntry[],
  ) {
    const label = `${scope} (${entries.length})`;
    super(label, vscode.TreeItemCollapsibleState.Expanded);
    this.iconPath = SCOPE_ICONS[scope] ?? new vscode.ThemeIcon("folder");
    this.contextValue = `catalog-scope-${scope}`;
  }
}

class PactTypeItem extends vscode.TreeItem {
  constructor(public readonly entry: CatalogEntry) {
    super(entry.name, vscode.TreeItemCollapsibleState.None);

    this.description = entry.description || "";
    this.tooltip = this.buildTooltip(entry);
    this.iconPath = new vscode.ThemeIcon("note");
    this.contextValue = "catalog-pact-type";

    // Clicking a pact type opens compose with it pre-selected
    this.command = {
      command: "pact.sendType",
      title: "Send this pact type",
      arguments: [entry.name],
    };
  }

  private buildTooltip(entry: CatalogEntry): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.appendMarkdown(`**${entry.name}**\n\n`);
    if (entry.description) {
      md.appendMarkdown(`${entry.description}\n\n`);
    }
    if (entry.scope) {
      md.appendMarkdown(`Scope: ${entry.scope}\n\n`);
    }
    if (entry.when_to_use && entry.when_to_use.length > 0) {
      md.appendMarkdown("**When to use:**\n");
      for (const w of entry.when_to_use) {
        md.appendMarkdown(`- ${w}\n`);
      }
    }
    return md;
  }
}
