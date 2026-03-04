import { LitElement, html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { vscode } from "./vscode-api.js";
import {
  createTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  type Table,
  type TableState,
  type ColumnDef,
  type SortingState,
  type Row,
} from "@tanstack/table-core";

interface InboxRow {
  request_id: string;
  short_id: string;
  request_type: string;
  sender: string;
  subject?: string;
  summary: string;
  created_at: string;
  attachment_count: number;
  amendment_count: number;
  pact_description?: string;
  group_ref?: string;
}

type FilterPreset = "all" | "recent" | "attachments";

const COLUMNS: ColumnDef<InboxRow, unknown>[] = [
  {
    id: "request_type",
    accessorKey: "request_type",
    header: "Type",
    size: 100,
  },
  {
    id: "subject",
    accessorFn: (row) => row.subject || row.summary,
    header: "Subject",
    size: 250,
  },
  {
    id: "sender",
    accessorKey: "sender",
    header: "From",
    size: 100,
  },
  {
    id: "created_at",
    accessorKey: "created_at",
    header: "Received",
    size: 120,
    sortingFn: "datetime",
  },
  {
    id: "attachments",
    accessorKey: "attachment_count",
    header: "📎",
    size: 40,
  },
];

/**
 * TanStack-powered sortable/filterable inbox table.
 *
 * Replaces the native tree view with a richer webview table that supports:
 * - Multi-column sorting (click headers)
 * - Global text search
 * - Filter presets
 * - Row click → select request
 */
@customElement("pact-inbox-table")
export class PactInboxTable extends LitElement {
  @state() private rows: InboxRow[] = [];
  @state() private sorting: SortingState = [{ id: "created_at", desc: true }];
  @state() private globalFilter = "";
  @state() private activePreset: FilterPreset = "all";
  @state() private selectedId: string | null = null;
  @state() private loading = true;

  private table: Table<InboxRow> | null = null;
  /** Full table state — seeded from initialState on first build so that
   *  features like columnPinning/visibility have their defaults. */
  private _internalState: Partial<TableState> = {};

  protected override createRenderRoot() {
    return this;
  }

  private handleMessage = (e: MessageEvent) => {
    const msg = e.data;
    if (msg.type === "inboxData") {
      this.rows = msg.data ?? [];
      this.loading = false;
      try {
        this.rebuildTable();
      } catch (err) {
        console.error("[pact-inbox-table] rebuildTable failed:", err);
      }
    }
  };

  override connectedCallback() {
    super.connectedCallback();
    window.addEventListener("message", this.handleMessage);
    vscode?.postMessage({ type: "fetchInbox" });

    // Restore persisted state from localStorage
    try {
      const saved = localStorage.getItem("pact-inbox-sorting");
      if (saved) this.sorting = JSON.parse(saved);
    } catch { /* ignore */ }
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("message", this.handleMessage);
  }

  private rebuildTable() {
    const filteredRows = this.applyPresetFilter(this.rows);

    this.table = createTable({
      data: filteredRows,
      columns: COLUMNS,
      state: {
        ...this._internalState,
        sorting: this.sorting,
        globalFilter: this.globalFilter,
      } as TableState,
      onStateChange: (updater) => {
        this._internalState = typeof updater === "function"
          ? updater({ ...this._internalState, sorting: this.sorting, globalFilter: this.globalFilter } as TableState)
          : updater;
      },
      renderFallbackValue: null,
      onSortingChange: (updater) => {
        this.sorting =
          typeof updater === "function" ? updater(this.sorting) : updater;
        // Persist
        try { localStorage.setItem("pact-inbox-sorting", JSON.stringify(this.sorting)); } catch { /* */ }
        this.rebuildTable();
        this.requestUpdate();
      },
      onGlobalFilterChange: (updater) => {
        this.globalFilter =
          typeof updater === "function" ? updater(this.globalFilter) : updater;
        this.rebuildTable();
        this.requestUpdate();
      },
      getCoreRowModel: getCoreRowModel(),
      getSortedRowModel: getSortedRowModel(),
      getFilteredRowModel: getFilteredRowModel(),
      globalFilterFn: "includesString",
    });

    // Seed _internalState from the table's initialState on first build
    // so features like columnPinning get their defaults ({ left: [], right: [] })
    if (Object.keys(this._internalState).length === 0) {
      this._internalState = { ...this.table.initialState };
      // Rebuild once more now that state is complete
      this.table.setOptions((prev) => ({
        ...prev,
        state: {
          ...this._internalState,
          sorting: this.sorting,
          globalFilter: this.globalFilter,
        } as TableState,
      }));
    }
  }

  private applyPresetFilter(rows: InboxRow[]): InboxRow[] {
    switch (this.activePreset) {
      case "recent": {
        const cutoff = Date.now() - 24 * 60 * 60 * 1000;
        return rows.filter((r) => new Date(r.created_at).getTime() > cutoff);
      }
      case "attachments":
        return rows.filter((r) => r.attachment_count > 0);
      default:
        return rows;
    }
  }

  protected override render() {
    if (this.loading) {
      return html`<p style="text-align: center; opacity: 0.6">Loading inbox...</p>`;
    }

    if (this.rows.length === 0) {
      return html`
        <div class="dashboard-empty">
          <div style="font-size: 24px; margin-bottom: 8px;">&#x1F4ED;</div>
          <p>No pending requests.</p>
        </div>
      `;
    }

    return html`
      <!-- Toolbar -->
      <div class="inbox-toolbar">
        <input
          type="text"
          class="inbox-search"
          placeholder="Search inbox..."
          .value=${this.globalFilter}
          @input=${(e: Event) => {
            this.globalFilter = (e.target as HTMLInputElement).value;
            this.rebuildTable();
          }}
        />
        <div class="inbox-presets">
          ${this.renderPresetBtn("all", "All")}
          ${this.renderPresetBtn("recent", "Today")}
          ${this.renderPresetBtn("attachments", "📎")}
        </div>
      </div>

      <!-- Table -->
      <div class="inbox-table-wrap">
        <table class="inbox-table">
          <thead>
            <tr>
              ${this.table?.getHeaderGroups().map((hg) =>
                hg.headers.map((header) => {
                  const sorted = header.column.getIsSorted();
                  const sortIndicator =
                    sorted === "asc" ? " ↑" : sorted === "desc" ? " ↓" : "";
                  return html`
                    <th
                      style="width: ${header.getSize()}px"
                      class="${header.column.getCanSort() ? 'sortable' : ''}"
                      @click=${() => header.column.getToggleSortingHandler()?.({} as MouseEvent)}
                    >
                      ${typeof header.column.columnDef.header === "string"
                        ? header.column.columnDef.header
                        : header.id}${sortIndicator}
                    </th>
                  `;
                }),
              )}
            </tr>
          </thead>
          <tbody>
            ${this.table?.getRowModel().rows.map((row) => this.renderRow(row))}
          </tbody>
        </table>
      </div>

      <div class="inbox-footer">
        ${this.table?.getRowModel().rows.length ?? 0} of ${this.rows.length} requests
      </div>
    `;
  }

  private renderRow(row: Row<InboxRow>) {
    const data = row.original;
    const isSelected = this.selectedId === data.request_id;
    const created = this.formatTime(data.created_at);

    return html`
      <tr
        class="${isSelected ? "selected" : ""}"
        @click=${() => this.selectRow(data.request_id)}
      >
        <td>
          <span class="badge badge--active" style="font-size: 10px; padding: 1px 6px;">
            ${data.request_type}
          </span>
        </td>
        <td class="inbox-subject">
          ${data.subject || data.summary}
          ${data.amendment_count > 0
            ? html`<span class="inbox-amended" title="${data.amendment_count} amendment(s)">+${data.amendment_count}</span>`
            : nothing}
        </td>
        <td>${data.sender}</td>
        <td title="${data.created_at}">${created}</td>
        <td>${data.attachment_count > 0 ? data.attachment_count : ""}</td>
      </tr>
    `;
  }

  private renderPresetBtn(preset: FilterPreset, label: string) {
    return html`
      <button
        class="inbox-preset ${this.activePreset === preset ? "inbox-preset--active" : ""}"
        @click=${() => {
          this.activePreset = preset;
          this.rebuildTable();
        }}
      >${label}</button>
    `;
  }

  private selectRow(requestId: string) {
    this.selectedId = requestId;
    vscode?.postMessage({ type: "selectRequest", requestId });
  }

  private formatTime(iso: string): string {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();

    if (diff < 60_000) return "just now";
    if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
    if (diff < 604800_000) return `${Math.floor(diff / 86400_000)}d ago`;
    return d.toLocaleDateString();
  }
}
