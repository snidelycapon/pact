/**
 * MCP server factory for GARP.
 *
 * Creates an McpServer instance with the 2 collapsed GARP tools registered:
 *   - garp_discover: skill + team discovery
 *   - garp_do: unified action dispatch (send, respond, cancel, amend, check_status, inbox, view_thread)
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
import { handleGarpDiscover } from "./tools/garp-discover.ts";
import type { GarpDiscoverParams } from "./tools/garp-discover.ts";
import { handleGarpDo } from "./tools/garp-do.ts";

export interface McpServerConfig {
  repoPath: string;
  userId: string;
}

/**
 * Creates and returns an McpServer with the 2 collapsed GARP tools registered.
 * Adapters are created lazily on first tool call.
 */
export function createMcpServer(config: McpServerConfig): McpServer {
  if (!config.repoPath) throw new Error("repoPath is required");
  if (!config.userId) throw new Error("userId is required");

  const server = new McpServer({ name: "GARP", version: "1.0.0" });

  // Lazily-initialized adapters (git validates directory at construction)
  let git: GitAdapter | undefined;
  let configAdapter: ConfigAdapter | undefined;
  let file: FileAdapter | undefined;

  function ensureAdapters() {
    if (!git) {
      git = new GitAdapter(config.repoPath);
      configAdapter = new ConfigAdapter(config.repoPath);
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

  // -- garp_discover --
  server.tool(
    "garp_discover",
    "Discover available request types, team members, and their capabilities",
    {
      query: z.string().optional().describe("Optional keyword to filter by name, description, or usage"),
    },
    async (params) => {
      ensureAdapters();
      const start = Date.now();
      log("info", "tool invocation start", { tool: "garp_discover" });
      try {
        const result = await handleGarpDiscover(params as GarpDiscoverParams, {
          userId: config.userId,
          repoPath: config.repoPath,
          git: git!,
          config: configAdapter!,
          file: file!,
        });
        log("info", "tool invocation complete", { tool: "garp_discover", skill_count: result.skills.length, duration_ms: Date.now() - start });
        return formatResult(result);
      } catch (err) {
        log("error", "tool invocation failed", { tool: "garp_discover", error: err instanceof Error ? err.message : String(err), duration_ms: Date.now() - start });
        return formatError(err);
      }
    },
  );

  // -- garp_do --
  server.tool(
    "garp_do",
    "Perform an action (send, respond, cancel, amend, check_status, inbox, view_thread)",
    {
      action: z.string().describe("The action to perform: send, respond, cancel, amend, check_status, inbox, view_thread"),
      request_type: z.string().optional().describe("The type of request (for send action)"),
      recipient: z.string().optional().describe("The user_id of the recipient (for send action)"),
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
      log("info", "tool invocation start", { tool: "garp_do", action: params.action });
      try {
        const result = await handleGarpDo(params as Record<string, unknown>, {
          userId: config.userId,
          repoPath: config.repoPath,
          git: git!,
          config: configAdapter!,
          file: file!,
        });
        log("info", "tool invocation complete", { tool: "garp_do", action: params.action, duration_ms: Date.now() - start });
        return formatResult(result);
      } catch (err) {
        log("error", "tool invocation failed", { tool: "garp_do", action: params.action, error: err instanceof Error ? err.message : String(err), duration_ms: Date.now() - start });
        return formatError(err);
      }
    },
  );

  return server;
}
