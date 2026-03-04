import { LitElement, html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";

interface ToastItem {
  id: number;
  message: string;
  variant: "info" | "success" | "error";
}

let nextId = 0;

/**
 * In-webview toast notification container.
 *
 * Usage:
 *   document.querySelector('pact-toast')?.show('Saved!', 'success');
 *
 * Or from anywhere in the webview:
 *   window.dispatchEvent(new CustomEvent('pact-toast', {
 *     detail: { message: 'Copied!', variant: 'success' }
 *   }));
 */
@customElement("pact-toast")
export class PactToast extends LitElement {
  @state()
  private toasts: ToastItem[] = [];

  protected override createRenderRoot() {
    return this;
  }

  private handleToastEvent = (e: Event) => {
    const { message, variant } = (e as CustomEvent).detail;
    this.show(message, variant);
  };

  override connectedCallback() {
    super.connectedCallback();
    window.addEventListener("pact-toast", this.handleToastEvent);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("pact-toast", this.handleToastEvent);
  }

  show(message: string, variant: "info" | "success" | "error" = "info") {
    const id = nextId++;
    this.toasts = [...this.toasts, { id, message, variant }];

    setTimeout(() => {
      this.toasts = this.toasts.filter((t) => t.id !== id);
    }, 4000);
  }

  protected override render() {
    if (this.toasts.length === 0) return nothing;

    return html`
      <div class="toast-container">
        ${this.toasts.map(
          (t) => html`
            <div class="toast toast--${t.variant}" @click=${() => this.dismiss(t.id)}>
              ${t.message}
            </div>
          `,
        )}
      </div>
    `;
  }

  private dismiss(id: number) {
    this.toasts = this.toasts.filter((t) => t.id !== id);
  }
}

/** Helper to fire a toast event from anywhere. */
export function showToast(
  message: string,
  variant: "info" | "success" | "error" = "info",
) {
  window.dispatchEvent(
    new CustomEvent("pact-toast", { detail: { message, variant } }),
  );
}
