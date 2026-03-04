/**
 * Shared VSCode webview API instance.
 *
 * acquireVsCodeApi() can only be called ONCE per webview.
 * All components must import from here instead of calling it directly.
 */
// @ts-expect-error — injected by VSCode webview runtime
export const vscode: ReturnType<typeof acquireVsCodeApi> | null =
  // @ts-expect-error — injected by VSCode webview runtime
  typeof acquireVsCodeApi === "function" ? acquireVsCodeApi() : null;
