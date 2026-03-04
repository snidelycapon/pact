import { LitElement, html, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { marked } from "marked";

// Configure marked for safe output
marked.use({
  breaks: true,
  gfm: true,
});

/** Simple heuristic: does this string look like it contains markdown? */
function looksLikeMarkdown(s: string): boolean {
  return /[*_#`\[\]!>|]/.test(s) || /\n[-*] /.test(s) || /\n\d+\. /.test(s);
}

/**
 * Renders a Record<string, unknown> as key-value fields with smart formatting.
 * - Strings: plain text or rendered markdown (when markdown-like)
 * - Arrays: bullet list
 * - Objects: JSON code block
 * - Booleans/numbers: inline
 */
@customElement("pact-bundle-fields")
export class PactBundleFields extends LitElement {
  @property({ type: Object })
  fields: Record<string, unknown> = {};

  // No shadow DOM — inherits VSCode styles
  protected override createRenderRoot() {
    return this;
  }

  protected override render() {
    if (!this.fields || Object.keys(this.fields).length === 0) {
      return nothing;
    }

    return html`
      ${Object.entries(this.fields).map(([key, value]) => this.renderField(key, value))}
    `;
  }

  private renderField(key: string, value: unknown) {
    const label = key
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());

    return html`
      <div class="field">
        <div class="field-key">${label}</div>
        <div class="field-value">${this.renderValue(value)}</div>
      </div>
    `;
  }

  private renderValue(value: unknown): unknown {
    if (value === null || value === undefined) {
      return html`<span style="opacity: 0.5">—</span>`;
    }

    if (typeof value === "string") {
      // Check for URLs
      if (/^https?:\/\//.test(value)) {
        return html`<a href="${value}" style="color: var(--vscode-textLink-foreground)">${value}</a>`;
      }
      // Multi-line or markdown-like strings get rendered as markdown
      if (value.includes("\n") || looksLikeMarkdown(value)) {
        const rendered = marked.parse(value) as string;
        return html`<div class="markdown-content">${unsafeHTML(rendered)}</div>`;
      }
      return html`${value}`;
    }

    if (typeof value === "boolean") {
      return html`<span>${value ? "Yes" : "No"}</span>`;
    }

    if (typeof value === "number") {
      return html`<span>${value}</span>`;
    }

    if (Array.isArray(value)) {
      if (value.length === 0) return html`<span style="opacity: 0.5">—</span>`;
      // Simple arrays (strings/numbers) as bullet list
      if (value.every((v) => typeof v === "string" || typeof v === "number")) {
        return html`
          <ul style="margin: 2px 0; padding-left: 18px">
            ${value.map((v) => html`<li>${v}</li>`)}
          </ul>
        `;
      }
      // Complex arrays as JSON
      return html`<pre>${JSON.stringify(value, null, 2)}</pre>`;
    }

    if (typeof value === "object") {
      return html`<pre>${JSON.stringify(value, null, 2)}</pre>`;
    }

    return html`${String(value)}`;
  }
}
