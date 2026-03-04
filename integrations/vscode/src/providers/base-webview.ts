import * as vscode from "vscode";
import { getNonce } from "../utils.js";

export interface WebviewHtmlOptions {
  /** Custom element tag to render, e.g. "pact-detail" */
  element?: string;
  /** ID attribute for the element */
  elementId?: string;
  /** Inline script to run after DOMContentLoaded */
  initScript?: string;
  /** Page title */
  title?: string;
}

/**
 * Generate the HTML shell for a webview with proper CSP, theme CSS, and
 * the bundled webview script.
 *
 * Centralises the boilerplate that was duplicated across
 * DetailWebviewProvider and ComposeWebviewPanel.
 */
export function getWebviewHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  options: WebviewHtmlOptions = {},
): string {
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "dist", "webview.js"),
  );
  const styleUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "webview", "styles", "theme.css"),
  );
  const nonce = getNonce();
  const cacheBust = Date.now();

  const title = options.title ?? "PACT";
  const body = options.element
    ? `<${options.element} id="${options.elementId ?? "app"}"></${options.element}>`
    : "";
  const initScript = options.initScript
    ? `<script nonce="${nonce}">
    window.addEventListener('DOMContentLoaded', () => {
      ${options.initScript}
    });
  </script>`
    : "";

  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <link rel="stylesheet" href="${styleUri}?v=${cacheBust}">
  <title>${title}</title>
</head>
<body>
  ${body}
  <script nonce="${nonce}" type="module" src="${scriptUri}?v=${cacheBust}"></script>
  ${initScript}
</body>
</html>`;
}

/**
 * Standard empty state HTML for webview views.
 */
export function getEmptyHtml(message: string): string {
  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      font-family: var(--vscode-font-family);
      padding: 16px;
      text-align: center;
    }
    .empty { opacity: 0.6; margin-top: 32px; }
  </style>
</head>
<body>
  <div class="empty"><p>${message}</p></div>
</body>
</html>`;
}

/**
 * Standard error state HTML for webview views.
 */
export function getErrorHtml(message: string): string {
  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      color: var(--vscode-errorForeground);
      background: var(--vscode-editor-background);
      font-family: var(--vscode-font-family);
      padding: 16px;
    }
  </style>
</head>
<body>
  <p>Error: ${message}</p>
</body>
</html>`;
}
