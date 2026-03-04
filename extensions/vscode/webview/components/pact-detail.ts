import { LitElement, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import "./pact-bundle-fields.js";
import "./pact-thread.js";
import "./pact-attachments.js";
import "./pact-respond-form.js";
import "./pact-toast.js";
import { showToast } from "./pact-toast.js";
import { vscode } from "./vscode-api.js";

/**
 * Shape returned by check_status action.
 * `request` is the full envelope from the JSON file on disk.
 */
export interface CheckStatusResult {
  status: string;
  request: RequestEnvelope;
  response?: Record<string, unknown>;
  responses?: Array<Record<string, unknown>>;
  attachment_paths?: AttachmentPath[];
  warning?: string;
}

export interface RequestEnvelope {
  request_id: string;
  thread_id?: string;
  request_type: string;
  subject?: string;
  sender: { user_id: string; display_name?: string };
  recipient?: string;
  recipients?: Array<{ user_id: string; display_name?: string }>;
  group_ref?: string;
  status?: string;
  created_at: string;
  deadline?: string;
  context_bundle?: Record<string, unknown>;
  cancel_reason?: string;
  amendments?: Array<{
    fields: Record<string, unknown>;
    note?: string;
    amended_at: string;
  }>;
}

export interface AttachmentPath {
  filename: string;
  description: string;
  path: string;
}

export interface ThreadEntry {
  type: "request" | "response";
  data: Record<string, unknown>;
  timestamp: string;
}

export interface PactDefinition {
  name: string;
  description?: string;
  when_to_use?: string[];
  context_bundle?: Record<string, unknown>;
  response_bundle?: Record<string, unknown>;
  scope?: string;
  multi_round?: boolean;
}

/** Draft data passed from the extension host when an AI agent stages a response. */
export interface DraftData {
  responseBundle: Record<string, unknown>;
  note?: string;
}

/** Full data payload passed from the extension host to this component. */
export interface DetailPayload {
  checkStatus: CheckStatusResult;
  thread?: ThreadEntry[];
  definition?: PactDefinition;
  draft?: DraftData;
}

@customElement("pact-detail")
export class PactDetail extends LitElement {
  @property({ type: Object })
  data: DetailPayload | null = null;

  @state()
  private showRespondForm = false;

  // No shadow DOM — inherits VSCode's CSS variables
  protected override createRenderRoot() {
    return this;
  }

  private handleMessage = (e: MessageEvent) => {
    const msg = e.data;
    if (msg.type === "toast") {
      showToast(msg.message, msg.variant ?? "info");
    }
  };

  override connectedCallback() {
    super.connectedCallback();
    window.addEventListener("message", this.handleMessage);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("message", this.handleMessage);
  }

  protected override updated(changed: Map<string, unknown>) {
    // Auto-open respond form when a draft is present
    if (changed.has("data") && this.data?.draft) {
      this.showRespondForm = true;
    }
  }

  protected override render() {
    if (!this.data) {
      return html`<div class="empty"><p>No request selected.</p></div>`;
    }

    const cs = this.data.checkStatus;
    const req = cs.request;
    const senderName =
      req.sender?.display_name || req.sender?.user_id || "unknown";
    const status = cs.status || req.status || "pending";
    const created = req.created_at
      ? new Date(req.created_at).toLocaleString()
      : "";

    const recipientsList = this.formatRecipients(req);

    return html`
      <pact-toast></pact-toast>

      <!-- Header -->
      <div class="request-header">
        <div class="request-meta">
          <span class="badge badge--${status}">${status}</span>
          <span>${req.request_type}</span>
        </div>
        <h2>${req.subject || req.request_type}</h2>
        <div class="request-meta">
          <span>from <strong>${senderName}</strong></span>
          ${recipientsList
            ? html`<span>to ${recipientsList}</span>`
            : nothing}
          ${created ? html`<span title="${req.created_at}">${created}</span>` : nothing}
        </div>
      </div>

      ${cs.warning
        ? html`<div class="warning-banner">${cs.warning}</div>`
        : nothing}

      <!-- Context Bundle -->
      ${req.context_bundle && Object.keys(req.context_bundle).length > 0
        ? html`
            <div class="section-header">Context</div>
            <pact-bundle-fields
              .fields=${req.context_bundle}
            ></pact-bundle-fields>
          `
        : nothing}

      <!-- Deadline -->
      ${req.deadline
        ? html`
            <div class="field">
              <div class="field-key">Deadline</div>
              <div class="field-value deadline-value">
                ${new Date(req.deadline).toLocaleString()}
                ${this.isOverdue(req.deadline)
                  ? html`<span class="badge badge--cancelled">overdue</span>`
                  : nothing}
              </div>
            </div>
          `
        : nothing}

      <!-- Attachments -->
      ${cs.attachment_paths && cs.attachment_paths.length > 0
        ? html`
            <pact-attachments
              .attachments=${cs.attachment_paths}
            ></pact-attachments>
          `
        : nothing}

      <!-- Response(s) -->
      ${cs.response
        ? html`
            <details open>
              <summary>Response</summary>
              <div>
                <pact-bundle-fields
                  .fields=${cs.response}
                ></pact-bundle-fields>
              </div>
            </details>
          `
        : nothing}
      ${cs.responses && cs.responses.length > 0
        ? html`
            <details open>
              <summary>Responses (${cs.responses.length})</summary>
              <div>
                ${cs.responses.map(
                  (r, i) => html`
                    <div class="thread-entry">
                      <div class="field-key">Response ${i + 1}</div>
                      <pact-bundle-fields .fields=${r}></pact-bundle-fields>
                    </div>
                  `,
                )}
              </div>
            </details>
          `
        : nothing}

      <!-- Amendments -->
      ${req.amendments && req.amendments.length > 0
        ? html`
            <details>
              <summary>Amendments (${req.amendments.length})</summary>
              <div>
                ${req.amendments.map(
                  (a) => html`
                    <div class="thread-entry">
                      <div class="field-key">
                        ${new Date(a.amended_at).toLocaleString()}
                        ${a.note ? html` &mdash; <em>${a.note}</em>` : ""}
                      </div>
                      <pact-bundle-fields
                        .fields=${a.fields}
                      ></pact-bundle-fields>
                    </div>
                  `,
                )}
              </div>
            </details>
          `
        : nothing}

      <!-- Thread History -->
      ${this.data.thread && this.data.thread.length > 0
        ? html`
            <pact-thread .entries=${this.data.thread}></pact-thread>
          `
        : nothing}

      <!-- Pact Definition -->
      ${this.data.definition
        ? html`
            <details>
              <summary>Pact Definition: ${this.data.definition.name}</summary>
              <div>
                ${this.data.definition.description
                  ? html`<p>${this.data.definition.description}</p>`
                  : nothing}
                ${this.data.definition.when_to_use
                  ? html`
                      <div class="field-key">When to use</div>
                      <ul style="margin: 2px 0; padding-left: 18px">
                        ${this.data.definition.when_to_use.map(
                          (w) => html`<li>${w}</li>`,
                        )}
                      </ul>
                    `
                  : nothing}
                ${this.data.definition.response_bundle
                  ? html`
                      <div class="field-key" style="margin-top: 8px">
                        Expected Response Fields
                      </div>
                      <pact-bundle-fields
                        .fields=${this.data.definition.response_bundle}
                      ></pact-bundle-fields>
                    `
                  : nothing}
              </div>
            </details>
          `
        : nothing}

      <!-- Cancel reason -->
      ${req.cancel_reason
        ? html`
            <div class="field">
              <div class="field-key">Cancel Reason</div>
              <div class="field-value">${req.cancel_reason}</div>
            </div>
          `
        : nothing}

      <!-- Actions -->
      <div class="actions">
        ${status === "pending" || status === "active"
          ? html`
              <button
                class="btn"
                @click=${() => (this.showRespondForm = !this.showRespondForm)}
              >
                ${this.showRespondForm ? "Cancel" : "Respond"}
              </button>
            `
          : nothing}
        ${status === "pending"
          ? html`<button class="btn btn--secondary" @click=${() => this.handleEdit("active")}>Mark Active</button>`
          : nothing}
        ${status === "pending" || status === "active"
          ? html`<button class="btn btn--secondary" @click=${() => this.handleEdit("completed")}>Mark Complete</button>`
          : nothing}
        ${status !== "cancelled"
          ? html`<button class="btn btn--secondary btn--danger" @click=${() => this.handleEdit("cancelled")}>Cancel</button>`
          : nothing}
        <button class="btn btn--secondary" @click=${this.handleCopyId}>
          Copy ID
        </button>
        ${req.context_bundle && Object.keys(req.context_bundle).length > 0
          ? html`
              <button class="btn btn--secondary" @click=${this.handleCopyContext}>
                Copy Context
              </button>
            `
          : nothing}
      </div>

      <!-- Respond Form -->
      ${this.showRespondForm
        ? html`
            ${this.data.draft
              ? html`
                  <div class="draft-banner">
                    <strong>Drafted by AI</strong>
                    ${this.data.draft.note
                      ? html` &mdash; <em>${this.data.draft.note}</em>`
                      : nothing}
                    <a href="#" style="margin-left: 8px" @click=${this.discardDraft}>Discard</a>
                  </div>
                `
              : nothing}
            <pact-respond-form
              .requestId=${req.request_id}
              .responseSpec=${this.data.definition?.response_bundle ?? null}
              .initialValues=${this.data.draft?.responseBundle ?? null}
              .pactName=${this.data.definition?.name ?? ""}
              .pactDescription=${this.data.definition?.description ?? ""}
              @pact-respond=${this.onRespondSubmit}
            ></pact-respond-form>
          `
        : nothing}
    `;
  }

  private formatRecipients(req: RequestEnvelope): string {
    if (req.recipients && req.recipients.length > 0) {
      return req.recipients
        .map((r) => r.display_name || r.user_id)
        .join(", ");
    }
    if (req.recipient) return req.recipient;
    return "";
  }

  private isOverdue(deadline: string): boolean {
    return new Date(deadline) < new Date();
  }

  private onRespondSubmit(e: CustomEvent) {
    const { requestId, responseBundle, note } = e.detail;
    vscode?.postMessage({ type: "respond", requestId, responseBundle, note });
    this.showRespondForm = false;
  }

  private discardDraft(e: Event) {
    e.preventDefault();
    if (this.data) {
      this.data = { ...this.data, draft: undefined };
    }
    this.showRespondForm = false;
  }

  private handleEdit(moveTo: string) {
    if (!this.data) return;
    vscode?.postMessage({
      type: "edit",
      requestId: this.data.checkStatus.request.request_id,
      moveTo,
    });
  }

  private handleCopyId() {
    if (!this.data) return;
    vscode?.postMessage({
      type: "copyId",
      requestId: this.data.checkStatus.request.request_id,
    });
  }

  private handleCopyContext() {
    if (!this.data) return;
    vscode?.postMessage({
      type: "copyContext",
      requestId: this.data.checkStatus.request.request_id,
    });
  }
}
