/**
 * MCP server factory for GARP.
 *
 * Creates an McpServer instance with all GARP tools registered. Used by:
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
import { handleGarpRequest } from "./tools/garp-request.ts";
import type { GarpRequestParams } from "./tools/garp-request.ts";
import { handleGarpInbox } from "./tools/garp-inbox.ts";
import { handleGarpRespond } from "./tools/garp-respond.ts";
import type { GarpRespondParams } from "./tools/garp-respond.ts";
import { handleGarpStatus } from "./tools/garp-status.ts";
import type { GarpStatusParams } from "./tools/garp-status.ts";
import { handleGarpThread } from "./tools/garp-thread.ts";
import type { GarpThreadParams } from "./tools/garp-thread.ts";
import { handleGarpCancel } from "./tools/garp-cancel.ts";
import type { GarpCancelParams } from "./tools/garp-cancel.ts";
import { handleGarpAmend } from "./tools/garp-amend.ts";
import type { GarpAmendParams } from "./tools/garp-amend.ts";
import { handleGarpSkills } from "./tools/garp-skills.ts";
import type { GarpSkillsParams } from "./tools/garp-skills.ts";
import { handleGarpDiscover } from "./tools/garp-discover.ts";
import type { GarpDiscoverParams } from "./tools/garp-discover.ts";
import { handleGarpDo } from "./tools/garp-do.ts";

export interface McpServerConfig {
  repoPath: string;
  userId: string;
}

/**
 * Creates and returns an McpServer with all 10 GARP tools registered.
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

  // -- garp_request --
  server.tool(
    "garp_request",
    "Submit a structured request to a team member",
    {
      request_type: z.string().describe("The type of request (must match a skill directory)"),
      recipient: z.string().describe("The user_id of the recipient"),
      context_bundle: z.record(z.string(), z.any()).describe("Flexible context payload"),
      deadline: z.string().optional().describe("Optional ISO 8601 deadline"),
      thread_id: z.string().optional().describe("Optional thread ID to group related requests into a conversation"),
      attachments: z.array(z.object({
        filename: z.string().describe("Filename for the attachment"),
        description: z.string().describe("What this file is and what it's for"),
        content: z.string().describe("File content as text"),
      })).optional().describe("Optional file attachments to include with the request"),
    },
    async (params) => {
      ensureAdapters();
      const start = Date.now();
      log("info", "tool invocation start", { tool: "garp_request" });
      try {
        const result = await handleGarpRequest(params as GarpRequestParams, {
          userId: config.userId,
          repoPath: config.repoPath,
          git: git!,
          config: configAdapter!,
          file: file!,
        });
        log("info", "tool invocation complete", { tool: "garp_request", request_id: result.request_id, duration_ms: Date.now() - start });
        return formatResult(result);
      } catch (err) {
        log("error", "tool invocation failed", { tool: "garp_request", error: err instanceof Error ? err.message : String(err), duration_ms: Date.now() - start });
        return formatError(err);
      }
    },
  );

  // -- garp_inbox --
  server.tool(
    "garp_inbox",
    "Check your inbox for pending requests",
    {},
    async () => {
      ensureAdapters();
      const start = Date.now();
      log("info", "tool invocation start", { tool: "garp_inbox" });
      try {
        const result = await handleGarpInbox({}, {
          userId: config.userId,
          repoPath: config.repoPath,
          git: git!,
          file: file!,
        });
        log("info", "tool invocation complete", { tool: "garp_inbox", count: result.requests.length, duration_ms: Date.now() - start });
        return formatResult(result);
      } catch (err) {
        log("error", "tool invocation failed", { tool: "garp_inbox", error: err instanceof Error ? err.message : String(err), duration_ms: Date.now() - start });
        return formatError(err);
      }
    },
  );

  // -- garp_respond --
  server.tool(
    "garp_respond",
    "Respond to a pending request",
    {
      request_id: z.string().describe("The ID of the request to respond to"),
      response_bundle: z.record(z.string(), z.any()).describe("Flexible response payload"),
    },
    async (params) => {
      ensureAdapters();
      const start = Date.now();
      log("info", "tool invocation start", { tool: "garp_respond", request_id: params.request_id });
      try {
        const result = await handleGarpRespond(params as GarpRespondParams, {
          userId: config.userId,
          repoPath: config.repoPath,
          git: git!,
          config: configAdapter!,
          file: file!,
        });
        log("info", "tool invocation complete", { tool: "garp_respond", request_id: params.request_id, duration_ms: Date.now() - start });
        return formatResult(result);
      } catch (err) {
        log("error", "tool invocation failed", { tool: "garp_respond", request_id: params.request_id, error: err instanceof Error ? err.message : String(err), duration_ms: Date.now() - start });
        return formatError(err);
      }
    },
  );

  // -- garp_status --
  server.tool(
    "garp_status",
    "Check the status of a request",
    {
      request_id: z.string().describe("The ID of the request to check"),
    },
    async (params) => {
      ensureAdapters();
      const start = Date.now();
      log("info", "tool invocation start", { tool: "garp_status", request_id: params.request_id });
      try {
        const result = await handleGarpStatus(params as GarpStatusParams, {
          userId: config.userId,
          repoPath: config.repoPath,
          git: git!,
          file: file!,
        });
        log("info", "tool invocation complete", { tool: "garp_status", request_id: params.request_id, status: result.status, duration_ms: Date.now() - start });
        return formatResult(result);
      } catch (err) {
        log("error", "tool invocation failed", { tool: "garp_status", request_id: params.request_id, error: err instanceof Error ? err.message : String(err), duration_ms: Date.now() - start });
        return formatError(err);
      }
    },
  );

  // -- garp_thread --
  server.tool(
    "garp_thread",
    "View the full history of a request thread",
    {
      thread_id: z.string().describe("The thread ID to retrieve history for"),
    },
    async (params) => {
      ensureAdapters();
      const start = Date.now();
      log("info", "tool invocation start", { tool: "garp_thread", thread_id: params.thread_id });
      try {
        const result = await handleGarpThread(params as GarpThreadParams, {
          userId: config.userId,
          repoPath: config.repoPath,
          git: git!,
          file: file!,
        });
        log("info", "tool invocation complete", { tool: "garp_thread", thread_id: params.thread_id, round_count: result.summary.round_count, duration_ms: Date.now() - start });
        return formatResult(result);
      } catch (err) {
        log("error", "tool invocation failed", { tool: "garp_thread", thread_id: params.thread_id, error: err instanceof Error ? err.message : String(err), duration_ms: Date.now() - start });
        return formatError(err);
      }
    },
  );

  // -- garp_amend --
  server.tool(
    "garp_amend",
    "Amend a pending request you sent",
    {
      request_id: z.string().describe("The ID of the request to amend"),
      fields: z.record(z.string(), z.any()).describe("Fields to add or update in the amendment"),
      note: z.string().optional().describe("Optional note explaining the amendment"),
    },
    async (params) => {
      ensureAdapters();
      const start = Date.now();
      log("info", "tool invocation start", { tool: "garp_amend", request_id: params.request_id });
      try {
        const result = await handleGarpAmend(params as GarpAmendParams, {
          userId: config.userId,
          repoPath: config.repoPath,
          git: git!,
          file: file!,
        });
        log("info", "tool invocation complete", { tool: "garp_amend", request_id: params.request_id, amendment_count: result.amendment_count, duration_ms: Date.now() - start });
        return formatResult(result);
      } catch (err) {
        log("error", "tool invocation failed", { tool: "garp_amend", request_id: params.request_id, error: err instanceof Error ? err.message : String(err), duration_ms: Date.now() - start });
        return formatError(err);
      }
    },
  );

  // -- garp_cancel --
  server.tool(
    "garp_cancel",
    "Cancel a pending request you sent",
    {
      request_id: z.string().describe("The ID of the request to cancel"),
      reason: z.string().optional().describe("Optional reason for cancellation"),
    },
    async (params) => {
      ensureAdapters();
      const start = Date.now();
      log("info", "tool invocation start", { tool: "garp_cancel", request_id: params.request_id });
      try {
        const result = await handleGarpCancel(params as GarpCancelParams, {
          userId: config.userId,
          repoPath: config.repoPath,
          git: git!,
          file: file!,
        });
        log("info", "tool invocation complete", { tool: "garp_cancel", request_id: params.request_id, duration_ms: Date.now() - start });
        return formatResult(result);
      } catch (err) {
        log("error", "tool invocation failed", { tool: "garp_cancel", request_id: params.request_id, error: err instanceof Error ? err.message : String(err), duration_ms: Date.now() - start });
        return formatError(err);
      }
    },
  );

  // -- garp_skills --
  server.tool(
    "garp_skills",
    "List available request types with descriptions and field information",
    {
      query: z.string().optional().describe("Optional keyword to filter skills by name, description, or when to use"),
    },
    async (params) => {
      ensureAdapters();
      const start = Date.now();
      log("info", "tool invocation start", { tool: "garp_skills" });
      try {
        const result = await handleGarpSkills(params as GarpSkillsParams, {
          repoPath: config.repoPath,
          git: git!,
          file: file!,
        });
        log("info", "tool invocation complete", { tool: "garp_skills", skill_count: result.skills.length, duration_ms: Date.now() - start });
        return formatResult(result);
      } catch (err) {
        log("error", "tool invocation failed", { tool: "garp_skills", error: err instanceof Error ? err.message : String(err), duration_ms: Date.now() - start });
        return formatError(err);
      }
    },
  );

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
