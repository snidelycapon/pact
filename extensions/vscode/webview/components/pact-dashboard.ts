import { LitElement, html, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { vscode } from "./vscode-api.js";

interface InboxSummary {
  total: number;
  byType: Record<string, number>;
  bySender: Record<string, number>;
  recent: Array<{
    request_id: string;
    subject?: string;
    summary: string;
    request_type: string;
    sender: string;
    created_at: string;
  }>;
}

/**
 * Dashboard view showing inbox summary with cards and breakdowns.
 */
@customElement("pact-dashboard")
export class PactDashboard extends LitElement {
  @property({ type: Object })
  data: InboxSummary | null = null;

  protected override createRenderRoot() {
    return this;
  }

  private handleMessage = (e: MessageEvent) => {
    const msg = e.data;
    if (msg.type === "dashboardData") {
      this.data = msg.data;
    }
  };

  override connectedCallback() {
    super.connectedCallback();
    window.addEventListener("message", this.handleMessage);
    vscode?.postMessage({ type: "fetchDashboard" });
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("message", this.handleMessage);
  }

  protected override render() {
    if (!this.data) {
      return html`<p style="text-align: center; opacity: 0.6">Loading...</p>`;
    }

    if (this.data.total === 0) {
      return html`
        <div class="dashboard-empty">
          <div style="font-size: 24px; margin-bottom: 8px;">&#x2705;</div>
          <p>Inbox zero — no pending requests.</p>
        </div>
      `;
    }

    return html`
      <!-- Summary Cards -->
      <div class="dashboard-cards">
        <div class="dashboard-card dashboard-card--primary">
          <div class="dashboard-card-value">${this.data.total}</div>
          <div class="dashboard-card-label">Pending</div>
        </div>
        <div class="dashboard-card">
          <div class="dashboard-card-value">${Object.keys(this.data.byType).length}</div>
          <div class="dashboard-card-label">Types</div>
        </div>
        <div class="dashboard-card">
          <div class="dashboard-card-value">${Object.keys(this.data.bySender).length}</div>
          <div class="dashboard-card-label">Senders</div>
        </div>
      </div>

      <!-- By Type -->
      ${Object.keys(this.data.byType).length > 0
        ? html`
            <div class="section-header">By Type</div>
            <div class="dashboard-breakdown">
              ${Object.entries(this.data.byType)
                .sort(([, a], [, b]) => b - a)
                .map(
                  ([type, count]) => html`
                    <div class="dashboard-breakdown-row">
                      <span class="dashboard-breakdown-label">${type}</span>
                      <span class="dashboard-breakdown-bar">
                        <span
                          class="dashboard-breakdown-fill"
                          style="width: ${(count / this.data!.total) * 100}%"
                        ></span>
                      </span>
                      <span class="dashboard-breakdown-count">${count}</span>
                    </div>
                  `,
                )}
            </div>
          `
        : nothing}

      <!-- By Sender -->
      ${Object.keys(this.data.bySender).length > 1
        ? html`
            <div class="section-header">By Sender</div>
            <div class="dashboard-breakdown">
              ${Object.entries(this.data.bySender)
                .sort(([, a], [, b]) => b - a)
                .map(
                  ([sender, count]) => html`
                    <div class="dashboard-breakdown-row">
                      <span class="dashboard-breakdown-label">${sender}</span>
                      <span class="dashboard-breakdown-bar">
                        <span
                          class="dashboard-breakdown-fill"
                          style="width: ${(count / this.data!.total) * 100}%"
                        ></span>
                      </span>
                      <span class="dashboard-breakdown-count">${count}</span>
                    </div>
                  `,
                )}
            </div>
          `
        : nothing}

      <!-- Recent Items -->
      ${this.data.recent.length > 0
        ? html`
            <div class="section-header">Recent</div>
            ${this.data.recent.map(
              (item) => html`
                <div
                  class="dashboard-recent-item"
                  @click=${() => this.selectRequest(item.request_id)}
                >
                  <div class="dashboard-recent-title">
                    ${item.subject || item.summary}
                  </div>
                  <div class="dashboard-recent-meta">
                    ${item.request_type} &middot; ${item.sender}
                  </div>
                </div>
              `,
            )}
          `
        : nothing}
    `;
  }

  private selectRequest(requestId: string) {
    vscode?.postMessage({ type: "selectRequest", requestId });
  }
}
