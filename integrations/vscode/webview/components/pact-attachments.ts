import { LitElement, html, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { vscode } from "./vscode-api.js";

interface AttachmentPath {
  filename: string;
  description: string;
  path: string;
}

const IMAGE_EXTS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".ico",
]);
const TEXT_EXTS = new Set([
  ".txt", ".md", ".json", ".yaml", ".yml", ".toml", ".xml", ".csv",
  ".ts", ".js", ".py", ".sh", ".css", ".html", ".sql", ".patch", ".diff",
  ".log", ".env", ".cfg", ".ini", ".conf",
]);

function getExt(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot >= 0 ? filename.slice(dot).toLowerCase() : "";
}

function getFileIcon(filename: string): string {
  const ext = getExt(filename);
  if (IMAGE_EXTS.has(ext)) return "\u{1F5BC}"; // 🖼
  if (TEXT_EXTS.has(ext)) return "\u{1F4C4}"; // 📄
  if (ext === ".pdf") return "\u{1F4D1}"; // 📑
  if (ext === ".zip" || ext === ".tar" || ext === ".gz") return "\u{1F4E6}"; // 📦
  return "\u{1F4CE}"; // 📎
}

/**
 * Renders attachment list with file type icons and open-in-editor action.
 */
@customElement("pact-attachments")
export class PactAttachments extends LitElement {
  @property({ type: Array })
  attachments: AttachmentPath[] = [];

  protected override createRenderRoot() {
    return this;
  }

  protected override render() {
    if (!this.attachments || this.attachments.length === 0) return nothing;

    return html`
      <details open>
        <summary>Attachments (${this.attachments.length})</summary>
        <div>
          ${this.attachments.map((a) => this.renderAttachment(a))}
        </div>
      </details>
    `;
  }

  private renderAttachment(a: AttachmentPath) {
    const icon = getFileIcon(a.filename);
    const ext = getExt(a.filename);
    const isImage = IMAGE_EXTS.has(ext);

    return html`
      <div class="attachment">
        <span class="attachment-icon">${icon}</span>
        <span
          class="attachment-name"
          title="${a.path}"
          @click=${() => this.openFile(a.path)}
          style="cursor: pointer; color: var(--vscode-textLink-foreground); text-decoration: underline;"
        >
          ${a.filename}
        </span>
        ${a.description
          ? html`<span class="attachment-desc">&mdash; ${a.description}</span>`
          : nothing}
      </div>

      ${isImage
        ? html`
            <div class="attachment-preview">
              <img
                src="${a.path}"
                alt="${a.filename}"
                style="max-width: 100%; max-height: 200px; border-radius: 4px; margin: 4px 0 8px;"
                @error=${(e: Event) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            </div>
          `
        : nothing}
    `;
  }

  private openFile(path: string) {
    vscode?.postMessage({ type: "openFile", path });
  }
}
