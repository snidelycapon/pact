import * as vscode from "vscode";
import { getConfig, isConfigured } from "./config.js";

/**
 * Registers the PACT MCP server as an MCP Server Definition Provider.
 *
 * This allows Copilot, Claude Code (in VSCode), and other MCP-aware tools
 * to discover and use pact_discover + pact_do automatically.
 *
 * Uses vscode.lm.registerMcpServerDefinitionProvider if available
 * (VSCode 1.100+).
 */
export function registerMcpProvider(
  context: vscode.ExtensionContext,
): void {
  // Guard: the API may not exist in older VSCode versions or forks
  if (!vscode.lm?.registerMcpServerDefinitionProvider) {
    return;
  }

  const provider: vscode.McpServerDefinitionProvider = {
    provideMcpServerDefinitions(
      _token: vscode.CancellationToken,
    ): vscode.McpServerDefinition[] {
      if (!isConfigured()) return [];

      const config = getConfig();
      return [
        new vscode.McpStdioServerDefinition(
          "PACT",
          "node",
          [config.serverPath],
          {
            PACT_REPO: config.repoPath,
            PACT_USER: config.userId,
            PACT_DISPLAY_NAME: config.displayName,
            PACT_LOG_LEVEL: "info",
          },
        ),
      ];
    },
  };

  context.subscriptions.push(
    vscode.lm.registerMcpServerDefinitionProvider("pact", provider),
  );
}
