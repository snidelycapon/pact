import { LitElement, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";

interface BundleFieldSpec {
  type?: string;
  description?: string;
  enum?: string[];
}

/**
 * The response_bundle schema as returned by the pact protocol.
 * { required: string[], fields: Record<string, BundleFieldSpec> }
 */
interface ResponseBundleSchema {
  required?: string[];
  fields?: Record<string, BundleFieldSpec | string>;
}

/**
 * Dynamic respond form that generates input fields from the pact definition's
 * response_bundle spec. Falls back to a freeform JSON textarea if no spec
 * is available.
 *
 * Fires a `pact-respond` CustomEvent with { requestId, responseBundle, note }.
 */
@customElement("pact-respond-form")
export class PactRespondForm extends LitElement {
  @property({ type: String })
  requestId = "";

  /**
   * response_bundle schema from the pact definition.
   * Expected shape: { required?: string[], fields?: Record<string, BundleFieldSpec> }
   * Falls back to freeform if null or has no fields.
   */
  @property({ type: Object })
  responseSpec: ResponseBundleSchema | null = null;

  /** Pre-fill values from an AI draft (optional). */
  @property({ type: Object })
  initialValues: Record<string, unknown> | null = null;

  /** Pact type name for context. */
  @property({ type: String })
  pactName = "";

  /** Pact type description for context. */
  @property({ type: String })
  pactDescription = "";

  @state()
  private fieldValues: Record<string, string> = {};

  @state()
  private freeformText = "";

  @state()
  private noteText = "";

  @state()
  private initialized = false;

  @state()
  private submitting = false;

  @state()
  private validationErrors: Record<string, string> = {};

  protected override createRenderRoot() {
    return this;
  }

  /** Extract the fields map from the schema, handling both wrapped and flat formats. */
  private get schemaFields(): Record<string, BundleFieldSpec | string> | null {
    if (!this.responseSpec) return null;
    // Native format: { required, fields }
    if (this.responseSpec.fields && typeof this.responseSpec.fields === "object") {
      return this.responseSpec.fields;
    }
    return null;
  }

  /** Extract the required field names from the schema. */
  private get requiredFields(): Set<string> {
    if (!this.responseSpec) return new Set();
    if (Array.isArray(this.responseSpec.required)) {
      return new Set(this.responseSpec.required);
    }
    return new Set();
  }

  protected override willUpdate(changed: Map<string, unknown>) {
    if (changed.has("initialValues") && this.initialValues && !this.initialized) {
      this.initialized = true;
      const fields = this.schemaFields;

      if (fields && Object.keys(fields).length > 0) {
        const values: Record<string, string> = {};
        for (const [key, val] of Object.entries(this.initialValues)) {
          values[key] = String(val ?? "");
        }
        this.fieldValues = values;
      } else {
        this.freeformText = JSON.stringify(this.initialValues, null, 2);
      }
    }
  }

  protected override render() {
    const fields = this.schemaFields;
    const hasFields = fields && Object.keys(fields).length > 0;

    return html`
      <div class="section-header">Compose Response</div>

      ${this.pactName
        ? html`
            <div style="margin-bottom: 12px">
              <div style="font-weight: 500; font-size: 12px; margin-bottom: 2px">${this.pactName}</div>
              ${this.pactDescription
                ? html`<div class="field-hint">${this.pactDescription}</div>`
                : nothing}
            </div>
          `
        : nothing}

      ${hasFields ? this.renderSchemaFields(fields!) : this.renderFreeform()}

      <div class="form-group" style="margin-top: 4px">
        <label for="respond-note">Note (optional)</label>
        <div class="field-hint">
          Add context about your response — visible alongside the response.
        </div>
        <input
          type="text"
          id="respond-note"
          placeholder="e.g. Approved with minor suggestions"
          .value=${this.noteText}
          @input=${(e: Event) =>
            (this.noteText = (e.target as HTMLInputElement).value)}
        />
      </div>

      <div class="actions">
        <button
          class="btn"
          ?disabled=${this.submitting}
          @click=${this.handleSubmit}
        >
          ${this.submitting ? "Sending..." : "Send Response"}
        </button>
      </div>
    `;
  }

  private renderSchemaFields(fields: Record<string, BundleFieldSpec | string>) {
    const required = this.requiredFields;
    return html`
      ${Object.entries(fields).map(([key, spec]) => {
        const fieldSpec = this.normalizeSpec(spec);
        const isRequired = required.has(key);
        return this.renderField(key, fieldSpec, isRequired);
      })}
    `;
  }

  private renderField(key: string, spec: BundleFieldSpec, isRequired: boolean) {
    const label = key
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
    const currentValue = this.fieldValues[key] ?? "";
    const error = this.validationErrors[key];
    const errorClass = error ? " form-group--error" : "";

    // Enum fields → select
    if (spec.enum && spec.enum.length > 0) {
      return html`
        <div class="form-group${errorClass}">
          <label for="field-${key}">
            ${label}
            ${isRequired ? html`<span style="color: var(--vscode-errorForeground)">*</span>` : nothing}
          </label>
          ${spec.description
            ? html`<div class="field-hint">${spec.description}</div>`
            : nothing}
          <select
            id="field-${key}"
            class="form-select"
            .value=${currentValue}
            @change=${(e: Event) =>
              this.setField(key, (e.target as HTMLSelectElement).value)}
          >
            <option value="">Select...</option>
            ${spec.enum.map(
              (opt) =>
                html`<option value="${opt}" ?selected=${currentValue === opt}>
                  ${opt}
                </option>`,
            )}
          </select>
          ${error ? html`<div class="field-error">${error}</div>` : nothing}
        </div>
      `;
    }

    // Boolean fields → checkbox
    if (spec.type === "boolean") {
      return html`
        <div class="form-group form-group--checkbox${errorClass}">
          <label>
            <input
              type="checkbox"
              ?checked=${currentValue === "true"}
              @change=${(e: Event) =>
                this.setField(
                  key,
                  (e.target as HTMLInputElement).checked ? "true" : "false",
                )}
            />
            ${label}
            ${isRequired ? html`<span style="color: var(--vscode-errorForeground)">*</span>` : nothing}
          </label>
          ${spec.description
            ? html`<div class="field-hint">${spec.description}</div>`
            : nothing}
          ${error ? html`<div class="field-error">${error}</div>` : nothing}
        </div>
      `;
    }

    // Text/long fields → textarea
    const isLong =
      spec.type === "text" ||
      spec.type === "markdown" ||
      spec.type === "string" ||
      (spec.description?.toLowerCase().includes("detailed") ?? false);

    if (isLong) {
      return html`
        <div class="form-group${errorClass}">
          <label for="field-${key}">
            ${label}
            ${isRequired ? html`<span style="color: var(--vscode-errorForeground)">*</span>` : nothing}
          </label>
          ${spec.description
            ? html`<div class="field-hint">${spec.description}</div>`
            : nothing}
          <textarea
            id="field-${key}"
            rows="4"
            .value=${currentValue}
            @input=${(e: Event) =>
              this.setField(key, (e.target as HTMLTextAreaElement).value)}
          ></textarea>
          ${error ? html`<div class="field-error">${error}</div>` : nothing}
        </div>
      `;
    }

    // Default → text input
    return html`
      <div class="form-group${errorClass}">
        <label for="field-${key}">
          ${label}
          ${isRequired ? html`<span style="color: var(--vscode-errorForeground)">*</span>` : nothing}
        </label>
        ${spec.description
          ? html`<div class="field-hint">${spec.description}</div>`
          : nothing}
        <input
          type="text"
          id="field-${key}"
          .value=${currentValue}
          placeholder=${spec.description || ""}
          @input=${(e: Event) =>
            this.setField(key, (e.target as HTMLInputElement).value)}
        />
        ${error ? html`<div class="field-error">${error}</div>` : nothing}
      </div>
    `;
  }

  private renderFreeform() {
    return html`
      <div class="form-group">
        <label for="respond-freeform">Response (JSON or plain text)</label>
        <div class="field-hint">
          No response schema found for this pact type. Enter JSON for
          structured responses or plain text.
        </div>
        <textarea
          id="respond-freeform"
          rows="6"
          placeholder='{"summary": "...", "approved": true}'
          .value=${this.freeformText}
          @input=${(e: Event) =>
            (this.freeformText = (e.target as HTMLTextAreaElement).value)}
        ></textarea>
      </div>
    `;
  }

  private normalizeSpec(spec: BundleFieldSpec | string): BundleFieldSpec {
    if (typeof spec === "string") {
      return { description: spec };
    }
    return spec;
  }

  private setField(key: string, value: string) {
    this.fieldValues = { ...this.fieldValues, [key]: value };
    if (this.validationErrors[key]) {
      const { [key]: _, ...rest } = this.validationErrors;
      this.validationErrors = rest;
    }
  }

  private validate(): boolean {
    const fields = this.schemaFields;
    if (!fields || Object.keys(fields).length === 0) {
      return true; // freeform mode — no validation
    }

    const required = this.requiredFields;
    const errors: Record<string, string> = {};
    for (const key of required) {
      const value = this.fieldValues[key];
      if (value === undefined || value === "") {
        const label = key
          .replace(/_/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase());
        errors[key] = `${label} is required`;
      }
    }

    this.validationErrors = errors;
    return Object.keys(errors).length === 0;
  }

  private handleSubmit() {
    if (!this.validate()) return;

    let responseBundle: Record<string, unknown>;
    const fields = this.schemaFields;

    if (fields && Object.keys(fields).length > 0) {
      responseBundle = {};
      for (const [key, spec] of Object.entries(fields)) {
        const fieldSpec = this.normalizeSpec(spec);
        const value = this.fieldValues[key];
        if (value !== undefined && value !== "") {
          if (fieldSpec.type === "boolean") {
            responseBundle[key] = value === "true";
          } else if (fieldSpec.type === "number") {
            responseBundle[key] = Number(value);
          } else {
            responseBundle[key] = value;
          }
        }
      }
    } else {
      try {
        responseBundle = JSON.parse(this.freeformText);
      } catch {
        responseBundle = { response: this.freeformText };
      }
    }

    this.submitting = true;
    this.dispatchEvent(
      new CustomEvent("pact-respond", {
        detail: {
          requestId: this.requestId,
          responseBundle,
          note: this.noteText || undefined,
        },
        bubbles: true,
        composed: true,
      }),
    );
  }
}
