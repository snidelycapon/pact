import { LitElement, html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import "./pact-bundle-fields.js";
import { vscode } from "./vscode-api.js";

interface CatalogEntry {
  name: string;
  description?: string;
  when_to_use?: string[];
  scope?: string;
}

interface ComposeSchema {
  mode: "compose";
  request_type: string;
  description?: string;
  when_to_use?: string[];
  context_bundle?: Record<string, unknown>;
  response_bundle?: Record<string, unknown>;
  subject_hint?: string;
  defaults?: Record<string, unknown>;
  multi_round?: boolean;
  attachments?: unknown[];
}

type Phase = "catalog" | "form";

/**
 * Two-phase compose flow:
 * 1. "catalog" — browse and select a pact type
 * 2. "form" — fill recipient, subject, context_bundle fields, and send
 */
@customElement("pact-compose")
export class PactCompose extends LitElement {
  @state() private phase: Phase = "catalog";
  @state() private catalog: CatalogEntry[] = [];
  @state() private loading = false;
  @state() private error = "";
  @state() private selectedType = "";
  @state() private schema: ComposeSchema | null = null;

  // Form fields
  @state() private recipient = "";
  @state() private subject = "";
  @state() private deadline = "";
  @state() private groupRef = "";
  @state() private contextFields: Record<string, string> = {};
  @state() private submitting = false;
  @state() private draftNote = "";

  protected override createRenderRoot() {
    return this;
  }

  private handleMessage = (e: MessageEvent) => {
    const msg = e.data;
    switch (msg.type) {
      case "catalog":
        this.catalog = msg.data?.pacts || [];
        this.loading = false;
        break;
      case "schema":
        this.schema = msg.data;
        this.phase = "form";
        this.loading = false;
        // Pre-fill defaults if available
        if (this.schema?.defaults) {
          for (const [k, v] of Object.entries(this.schema.defaults)) {
            this.contextFields = {
              ...this.contextFields,
              [k]: String(v),
            };
          }
        }
        break;
      case "prefill":
        this.recipient = msg.recipient || "";
        this.subject = msg.subject || "";
        this.deadline = msg.deadline || "";
        if (msg.contextBundle) {
          const fields: Record<string, string> = {};
          for (const [k, v] of Object.entries(msg.contextBundle as Record<string, unknown>)) {
            fields[k] = String(v ?? "");
          }
          this.contextFields = fields;
        }
        if (msg.note) {
          this.draftNote = msg.note;
        }
        break;
      case "error":
        this.error = msg.message;
        this.loading = false;
        this.submitting = false;
        break;
    }
  };

  override connectedCallback() {
    super.connectedCallback();
    window.addEventListener("message", this.handleMessage);

    // Request catalog on mount
    this.loading = true;
    vscode?.postMessage({ type: "fetchCatalog" });
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("message", this.handleMessage);
  }

  protected override render() {
    if (this.error) {
      return html`
        <div class="warning-banner">${this.error}</div>
        <button class="btn btn--secondary" @click=${() => (this.error = "")}>
          Dismiss
        </button>
      `;
    }

    if (this.loading) {
      return html`<p style="text-align: center; opacity: 0.6">Loading...</p>`;
    }

    return this.phase === "catalog"
      ? this.renderCatalog()
      : this.renderForm();
  }

  // --- Phase 1: Catalog ---

  private renderCatalog() {
    return html`
      <div class="compose-header">
        <h2>New PACT Request</h2>
        <p>Select a pact type to get started.</p>
      </div>

      ${this.catalog.length === 0
        ? html`<p style="opacity: 0.6">No pact types found in the catalog.</p>`
        : this.catalog.map((entry) => this.renderCatalogItem(entry))}
    `;
  }

  private renderCatalogItem(entry: CatalogEntry) {
    const selected = this.selectedType === entry.name;
    return html`
      <div
        class="catalog-item ${selected ? "catalog-item--selected" : ""}"
        @click=${() => this.selectPactType(entry.name)}
      >
        <div class="catalog-item-name">${entry.name}</div>
        ${entry.description
          ? html`<div class="catalog-item-desc">${entry.description}</div>`
          : nothing}
        ${entry.scope
          ? html`<span class="badge badge--active" style="margin-top: 4px; font-size: 9px;">${entry.scope}</span>`
          : nothing}
      </div>
    `;
  }

  private selectPactType(name: string) {
    this.selectedType = name;
    this.loading = true;
    vscode?.postMessage({ type: "fetchSchema", requestType: name });
  }

  // --- Phase 2: Form ---

  private renderForm() {
    if (!this.schema) return nothing;

    const hasContextSpec =
      this.schema.context_bundle &&
      Object.keys(this.schema.context_bundle).length > 0;

    return html`
      <div class="compose-header">
        <h2>${this.schema.request_type}</h2>
        ${this.schema.description
          ? html`<p>${this.schema.description}</p>`
          : nothing}
      </div>

      ${this.draftNote
        ? html`
            <div class="draft-banner">
              <strong>Drafted by AI</strong> &mdash; <em>${this.draftNote}</em>
            </div>
          `
        : nothing}

      <button
        class="btn btn--secondary"
        style="margin-bottom: 12px"
        @click=${() => {
          this.phase = "catalog";
          this.schema = null;
          this.contextFields = {};
          this.draftNote = "";
        }}
      >
        &larr; Back to catalog
      </button>

      ${this.schema.when_to_use
        ? html`
            <details>
              <summary>When to use</summary>
              <div>
                <ul style="margin: 2px 0; padding-left: 18px">
                  ${this.schema.when_to_use.map(
                    (w) => html`<li>${w}</li>`,
                  )}
                </ul>
              </div>
            </details>
          `
        : nothing}

      <!-- Recipient -->
      <div class="form-group">
        <label for="compose-recipient">
          Recipient <span style="color: var(--vscode-errorForeground)">*</span>
        </label>
        <div class="field-hint">User ID or group name. Comma-separate for multiple.</div>
        <input
          type="text"
          id="compose-recipient"
          placeholder="e.g. alice, backend-team"
          .value=${this.recipient}
          @input=${(e: Event) =>
            (this.recipient = (e.target as HTMLInputElement).value)}
        />
      </div>

      <!-- Subject -->
      <div class="form-group">
        <label for="compose-subject">
          Subject <span style="color: var(--vscode-errorForeground)">*</span>
        </label>
        ${this.schema.subject_hint
          ? html`<div class="field-hint">${this.schema.subject_hint}</div>`
          : nothing}
        <input
          type="text"
          id="compose-subject"
          placeholder="Brief summary"
          .value=${this.subject}
          @input=${(e: Event) =>
            (this.subject = (e.target as HTMLInputElement).value)}
        />
      </div>

      <!-- Context Bundle Fields -->
      ${hasContextSpec
        ? html`
            <div class="section-header">Context</div>
            ${Object.entries(this.schema.context_bundle!).map(
              ([key, spec]) => this.renderContextField(key, spec),
            )}
          `
        : html`
            <div class="form-group">
              <label for="compose-context">Context (JSON)</label>
              <div class="field-hint">Freeform context bundle.</div>
              <textarea
                id="compose-context"
                rows="4"
                placeholder='{}'
                @input=${(e: Event) => {
                  try {
                    this.contextFields = JSON.parse(
                      (e.target as HTMLTextAreaElement).value,
                    );
                  } catch {
                    /* keep typing */
                  }
                }}
              ></textarea>
            </div>
          `}

      <!-- Deadline (optional) -->
      <div class="form-group">
        <label for="compose-deadline">Deadline (optional)</label>
        <input
          type="datetime-local"
          id="compose-deadline"
          .value=${this.deadline}
          @input=${(e: Event) =>
            (this.deadline = (e.target as HTMLInputElement).value)}
        />
      </div>

      <!-- Send -->
      <div class="actions" style="margin-top: 16px">
        <button
          class="btn"
          ?disabled=${this.submitting || !this.recipient || !this.subject}
          @click=${this.handleSend}
        >
          ${this.submitting ? "Sending..." : "Send Request"}
        </button>
      </div>
    `;
  }

  private renderContextField(key: string, spec: unknown) {
    const fieldSpec =
      typeof spec === "string" ? { description: spec } : (spec as Record<string, unknown>);
    const label = key
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
    const description = fieldSpec.description as string | undefined;
    const required = fieldSpec.required as boolean | undefined;
    const fieldType = fieldSpec.type as string | undefined;
    const enumValues = fieldSpec.enum as string[] | undefined;
    const currentValue = this.contextFields[key] ?? "";

    // Enum → select
    if (enumValues && enumValues.length > 0) {
      return html`
        <div class="form-group">
          <label>
            ${label}
            ${required ? html`<span style="color: var(--vscode-errorForeground)">*</span>` : nothing}
          </label>
          ${description ? html`<div class="field-hint">${description}</div>` : nothing}
          <select
            class="form-select"
            .value=${currentValue}
            @change=${(e: Event) =>
              this.setContextField(key, (e.target as HTMLSelectElement).value)}
          >
            <option value="">Select...</option>
            ${enumValues.map(
              (opt) =>
                html`<option value="${opt}" ?selected=${currentValue === opt}>${opt}</option>`,
            )}
          </select>
        </div>
      `;
    }

    // Long text
    const isLong =
      fieldType === "text" ||
      fieldType === "markdown" ||
      (description?.toLowerCase().includes("detailed") ?? false);

    if (isLong) {
      return html`
        <div class="form-group">
          <label>
            ${label}
            ${required ? html`<span style="color: var(--vscode-errorForeground)">*</span>` : nothing}
          </label>
          ${description ? html`<div class="field-hint">${description}</div>` : nothing}
          <textarea
            rows="3"
            .value=${currentValue}
            @input=${(e: Event) =>
              this.setContextField(key, (e.target as HTMLTextAreaElement).value)}
          ></textarea>
        </div>
      `;
    }

    // Default → input
    return html`
      <div class="form-group">
        <label>
          ${label}
          ${required ? html`<span style="color: var(--vscode-errorForeground)">*</span>` : nothing}
        </label>
        ${description ? html`<div class="field-hint">${description}</div>` : nothing}
        <input
          type="text"
          .value=${currentValue}
          placeholder=${description || ""}
          @input=${(e: Event) =>
            this.setContextField(key, (e.target as HTMLInputElement).value)}
        />
      </div>
    `;
  }

  private setContextField(key: string, value: string) {
    this.contextFields = { ...this.contextFields, [key]: value };
  }

  private handleSend() {
    if (!this.recipient || !this.subject) return;

    // Build context bundle with type coercion
    const contextBundle: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(this.contextFields)) {
      if (value === "") continue;

      // Simple type coercion based on spec
      const spec = this.schema?.context_bundle?.[key];
      const fieldType =
        typeof spec === "object" ? (spec as Record<string, unknown>).type : undefined;

      if (fieldType === "boolean") {
        contextBundle[key] = value === "true";
      } else if (fieldType === "number") {
        contextBundle[key] = Number(value);
      } else {
        contextBundle[key] = value;
      }
    }

    this.submitting = true;
    vscode?.postMessage({
      type: "send",
      requestType: this.schema!.request_type,
      recipient: this.recipient,
      subject: this.subject,
      contextBundle,
      deadline: this.deadline
        ? new Date(this.deadline).toISOString()
        : undefined,
      groupRef: this.groupRef || undefined,
    });
  }
}
