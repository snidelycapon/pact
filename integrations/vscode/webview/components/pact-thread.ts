import { LitElement, html, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import "./pact-bundle-fields.js";

interface ThreadEntry {
  type: "request" | "response";
  data: Record<string, unknown>;
  timestamp: string;
}

/**
 * Renders thread history as a vertical timeline.
 * Each entry shows type (request/response), timestamp, and bundle fields.
 */
@customElement("pact-thread")
export class PactThread extends LitElement {
  @property({ type: Array })
  entries: ThreadEntry[] = [];

  protected override createRenderRoot() {
    return this;
  }

  protected override render() {
    if (!this.entries || this.entries.length === 0) return nothing;

    return html`
      <details>
        <summary>Thread History (${this.entries.length})</summary>
        <div class="thread-timeline">
          ${this.entries.map((entry, i) => this.renderEntry(entry, i))}
        </div>
      </details>
    `;
  }

  private renderEntry(entry: ThreadEntry, index: number) {
    const isRequest = entry.type === "request";
    const icon = isRequest ? "&#x2709;" : "&#x21A9;"; // ✉ or ↩
    const label = isRequest ? "Request" : "Response";
    const time = entry.timestamp
      ? new Date(entry.timestamp).toLocaleString()
      : "";

    // Extract display fields from data
    const displayData = { ...entry.data } as Record<string, unknown>;
    // Remove internal fields for cleaner display
    delete displayData.request_id;
    delete displayData.thread_id;
    delete displayData.status;

    return html`
      <div class="thread-entry">
        <div class="thread-entry-header">
          <span class="thread-entry-icon">${icon}</span>
          <span class="thread-entry-label badge badge--${isRequest ? "active" : "completed"}">
            ${label} ${index + 1}
          </span>
          ${time
            ? html`<span class="thread-entry-time">${time}</span>`
            : nothing}
        </div>

        ${entry.data.subject
          ? html`<div class="thread-entry-subject">${entry.data.subject}</div>`
          : nothing}

        ${Object.keys(displayData).length > 0
          ? html`
              <pact-bundle-fields
                .fields=${displayData}
              ></pact-bundle-fields>
            `
          : nothing}
      </div>
    `;
  }
}
