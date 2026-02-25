/**
 * MCP server factory for PACT.
 *
 * Creates an McpServer instance with the 2 collapsed PACT tools registered:
 *   - pact_discover: pact catalog discovery
 *   - pact_do: unified action dispatch (send, respond, cancel, amend, check_status, inbox, view_thread, subscribe)
 *
 * Used by:
 * - src/index.ts (production: connects to StdioServerTransport)
 * - tests (connects via InMemoryTransport)
 *
 * Both share the same handler functions from src/tools/.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { GitAdapter } from "./adapters/git-adapter.ts";
import { ConfigAdapter } from "./adapters/config-adapter.ts";
import { FileAdapter } from "./adapters/file-adapter.ts";
import { log } from "./logger.ts";
import { handlePactDiscover } from "./tools/pact-discover.ts";
import type { PactDiscoverParams } from "./tools/pact-discover.ts";
import { handlePactDo } from "./tools/pact-do.ts";
import type { UserConfig } from "./schemas.ts";

export interface McpServerConfig {
  repoPath: string;
  userId: string;
  displayName: string;
  subscriptions: string[];
  configPath?: string;
}

/**
 * Creates and returns an McpServer with the 2 collapsed PACT tools registered.
 * Adapters are created lazily on first tool call.
 */
export function createMcpServer(config: McpServerConfig): McpServer {
  if (!config.repoPath) throw new Error("repoPath is required");
  if (!config.userId) throw new Error("userId is required");

  const server = new McpServer({ name: "PACT", version: "1.0.0" });

  const userConfig: UserConfig = {
    user_id: config.userId,
    display_name: config.displayName,
    subscriptions: config.subscriptions,
  };

  // Lazily-initialized adapters (git validates directory at construction)
  let git: GitAdapter | undefined;
  let configAdapter: ConfigAdapter | undefined;
  let file: FileAdapter | undefined;

  function ensureAdapters() {
    if (!git) {
      git = new GitAdapter(config.repoPath);
      configAdapter = new ConfigAdapter(userConfig, config.configPath);
      file = new FileAdapter(config.repoPath);
    }
  }

  function formatResult(data: unknown): { content: Array<{ type: "text"; text: string }> } {
    return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
  }

  function formatError(err: unknown): { content: Array<{ type: "text"; text: string }>; isError: true } {
    const message = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text" as const, text: message }], isError: true };
  }

  // -- pact_discover --
  server.tool(
    "pact_discover",
    "Discover available request types and their capabilities",
    {
      query: z.string().optional().describe("Optional keyword to filter by name, description, or usage"),
      format: z.enum(["full", "compressed"]).optional().describe("Output format: 'full' (default) returns structured objects, 'compressed' returns pipe-delimited entries"),
      scope: z.string().optional().describe("Filter pacts by scope (e.g. 'global', 'team', 'repo')"),
    },
    async (params) => {
      ensureAdapters();
      const start = Date.now();
      log("info", "tool invocation start", { tool: "pact_discover" });
      try {
        const result = await handlePactDiscover(params as PactDiscoverParams, {
          userId: config.userId,
          repoPath: config.repoPath,
          git: git!,
          file: file!,
        });
        log("info", "tool invocation complete", { tool: "pact_discover", pact_count: result.pacts?.length ?? 0, duration_ms: Date.now() - start });
        return formatResult(result);
      } catch (err) {
        log("error", "tool invocation failed", { tool: "pact_discover", error: err instanceof Error ? err.message : String(err), duration_ms: Date.now() - start });
        return formatError(err);
      }
    },
  );

  // -- pact_do --
  server.tool(
    "pact_do",
    "Perform an action (send, respond, cancel, amend, check_status, inbox, view_thread, subscribe)",
    {
      action: z.string().describe("The action to perform: send, respond, cancel, amend, check_status, inbox, view_thread, subscribe"),
      request_type: z.string().optional().describe("The type of request (for send action)"),
      recipient: z.string().optional().describe("The user_id of the recipient (for send action, single-recipient backward compat)"),
      recipients: z.array(z.string()).optional().describe("Array of user_id strings (for send action, group addressing)"),
      group_ref: z.string().optional().describe("Optional group reference label (for send action, e.g. '+backend-team')"),
      context_bundle: z.record(z.string(), z.any()).optional().describe("Flexible context payload (for send action)"),
      request_id: z.string().optional().describe("The request ID (for respond, cancel, amend, check_status actions)"),
      response_bundle: z.record(z.string(), z.any()).optional().describe("Flexible response payload (for respond action)"),
      thread_id: z.string().optional().describe("Thread ID (for send or view_thread actions)"),
      deadline: z.string().optional().describe("Optional ISO 8601 deadline (for send action)"),
      attachments: z.array(z.object({
        filename: z.string().describe("Filename for the attachment"),
        description: z.string().describe("What this file is and what it's for"),
        content: z.string().describe("File content as text"),
      })).optional().describe("Optional file attachments (for send action)"),
      fields: z.record(z.string(), z.any()).optional().describe("Fields to add or update (for amend action)"),
      note: z.string().optional().describe("Optional note (for amend action)"),
      reason: z.string().optional().describe("Optional reason (for cancel action)"),
    },
    async (params) => {
      ensureAdapters();
      const start = Date.now();
      log("info", "tool invocation start", { tool: "pact_do", action: params.action });
      try {
        const result = await handlePactDo(params as Record<string, unknown>, {
          userId: config.userId,
          repoPath: config.repoPath,
          git: git!,
          config: configAdapter!,
          file: file!,
        });
        log("info", "tool invocation complete", { tool: "pact_do", action: params.action, duration_ms: Date.now() - start });
        return formatResult(result);
      } catch (err) {
        log("error", "tool invocation failed", { tool: "pact_do", action: params.action, error: err instanceof Error ? err.message : String(err), duration_ms: Date.now() - start });
        return formatError(err);
      }
    },
  );

  return server;
}
