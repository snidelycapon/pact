/**
 * MCP server factory for PACT.
 *
 * Creates an McpServer instance with the 2 collapsed PACT tools registered:
 *   - pact_discover: pact catalog discovery
 *   - pact_do: unified action dispatch (send, respond, cancel, amend, check_status, inbox, view_thread, subscribe, unsubscribe)
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

export interface McpServerConfig {
  repoPath: string;
  userId: string;
  displayName: string;
}

/**
 * Server-level instructions returned during the MCP initialize handshake.
 * Distilled from docs/agent-primer.md — the canonical agent onboarding text.
 * Any MCP client that connects receives this automatically.
 */
const PACT_INSTRUCTIONS = `## PACT — Async Coordination

You have access to PACT, a git-backed protocol for async requests between humans and agents. **You are the engine.** PACT is a dumb pipe — it stores, delivers, and presents. It does not enforce, validate, route, or coordinate. You read pact definitions, decide behavior, compose bundles, and coordinate with others.

### Tools

**\`pact_discover\`** — Browse available pact types.
- Returns a catalog of pact definitions (name, description, when_to_use, required fields).
- Each pact definition tells you what \`context_bundle\` and \`response_bundle\` fields to use. Read them carefully.
- Optional params: \`query\` (keyword filter), \`scope\` (e.g. "global"), \`format\` ("compressed" for token savings).

**\`pact_do\`** — Perform an action. Pass \`action\` plus action-specific fields:

| Action | Purpose | Key fields |
|--------|---------|------------|
| \`send\` | Send a request | \`request_type\`, \`recipient\` or \`recipients[]\`, \`context_bundle\`, optional: \`deadline\`, \`thread_id\`, \`group_ref\`, \`attachments[]\`. Omit \`context_bundle\` to get the pact schema back (compose mode). |
| \`inbox\` | Check your inbox | *(none)* |
| \`respond\` | Respond to a request | \`request_id\`, \`response_bundle\` |
| \`check_status\` | Check a sent request | \`request_id\` |
| \`view_thread\` | View conversation history | \`thread_id\` |
| \`amend\` | Update a pending request | \`request_id\`, \`fields\`, optional: \`note\` |
| \`cancel\` | Cancel a pending request | \`request_id\`, optional: \`reason\` |
| \`subscribe\` | Subscribe to a group inbox | \`recipient\` (the group ID, e.g. \`backend-team\`). Omit to list current subscriptions. |
| \`unsubscribe\` | Unsubscribe from a group inbox | \`recipient\` (the group ID to remove). Omit to list current subscriptions. |

### Workflow

1. **Discover** — Call \`pact_discover\` to see what pact types are available.
2. **Pick a pact** — Read the pact's \`when_to_use\` and field definitions. Choose the right one.
3. **Compose (optional)** — If you need the full pact schema, call \`pact_do\` with \`action: "send"\` and \`request_type\` but omit \`context_bundle\`. PACT returns the pact's fields, defaults, and response structure so you can construct the bundle correctly.
4. **Send** — Address any user or group by their ID string. Compose \`context_bundle\` per the pact, then \`pact_do\` with \`action: "send"\`.
5. **Check inbox** — Periodically call \`pact_do\` with \`action: "inbox"\`. You see requests addressed to your user ID or any inbox you're subscribed to.
6. **Respond** — Read the request, compose \`response_bundle\` per the pact definition, then \`pact_do\` with \`action: "respond"\`.

### Addressing & Subscriptions

- **Send to anyone.** Address requests to any ID string — a person (\`cory\`), a role (\`on-call\`), a group (\`backend-team\`). PACT delivers without validation.
- **IDs are normalized.** Lowercase, hyphens-for-spaces. \`Cory\` → \`cory\`, \`Backend Team\` → \`backend-team\`.
- **Your inbox = your user ID + subscriptions.** Your primary inbox is your \`PACT_USER\`. You can subscribe to additional inboxes (e.g. \`backend-team\`) via the \`subscribe\` action. All subscribed inboxes are checked together.
- **Subscribers can respond.** If you received a request via subscription, you can respond to it — you don't need to be named directly.
- **No team registry.** PACT has no concept of "who exists." Discover teammates through your organization's tools (GitHub, Slack, org wiki, etc.) or just address them by convention.

### Key Rules

- **Bundles are freeform.** \`context_bundle\` and \`response_bundle\` are \`Record<string, unknown>\`. The pact definition describes what fields to include — follow it, but the protocol won't reject you if you don't.
- **Frontmatter is guidance.** Fields like \`response_mode\`, \`visibility\`, \`claimable\`, and \`defaults\` in pact definitions are advice for you to interpret and honor. PACT does not enforce them.
- **No access control.** Git has no file-level ACL. Everyone with repo access can see everything. Treat \`visibility: private\` as a convention you respect, not a security boundary.
- **Check your inbox proactively.** PACT won't notify you. You need to check.
- **Be a good citizen.** Respond to requests addressed to you. Include the fields the pact asks for. Follow the pact's guidance on multi-round, deadlines, and coordination.`;

/**
 * Creates and returns an McpServer with the 2 collapsed PACT tools registered.
 * Adapters are created lazily on first tool call.
 */
export function createMcpServer(config: McpServerConfig): McpServer {
  if (!config.repoPath) throw new Error("repoPath is required");
  if (!config.userId) throw new Error("userId is required");

  const server = new McpServer(
    { name: "PACT", version: "1.0.0" },
    { instructions: PACT_INSTRUCTIONS },
  );

  // Lazily-initialized adapters (git validates directory at construction)
  let git: GitAdapter | undefined;
  let configAdapter: ConfigAdapter | undefined;
  let file: FileAdapter | undefined;

  function ensureAdapters() {
    if (!git) {
      git = new GitAdapter(config.repoPath);
      file = new FileAdapter(config.repoPath);
      configAdapter = new ConfigAdapter(
        config.userId,
        config.displayName,
        file,
        git,
      );
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
    "Perform an action (send, respond, cancel, amend, check_status, inbox, view_thread, subscribe, unsubscribe)",
    {
      action: z.string().describe("The action to perform: send, respond, cancel, amend, check_status, inbox, view_thread, subscribe, unsubscribe"),
      request_type: z.string().optional().describe("The type of request (for send action)"),
      subject: z.string().optional().describe("One-line human-readable summary of the request (for send action, like an email subject)"),
      recipient: z.string().optional().describe("The user_id of the recipient (for send action, single-recipient backward compat). For subscribe/unsubscribe: the ID to add/remove. Omit to list current subscriptions."),
      recipients: z.array(z.string()).optional().describe("Array of user_id strings (for send action, group addressing)"),
      group_ref: z.string().optional().describe("Optional group reference label (for send action, e.g. 'backend-team')"),
      context_bundle: z.record(z.string(), z.any()).optional().describe("Flexible context payload (for send action)"),
      request_id: z.string().optional().describe("The request ID (for respond, cancel, amend, check_status actions)"),
      response_bundle: z.record(z.string(), z.any()).optional().describe("Flexible response payload (for respond action)"),
      thread_id: z.string().optional().describe("Thread ID (for send or view_thread actions)"),
      deadline: z.string().optional().describe("Optional ISO 8601 deadline (for send action)"),
      attachments: z.array(z.object({
        filename: z.string().optional().describe("Filename for the attachment (defaults to basename of path)"),
        description: z.string().optional().describe("What this file is and what it's for"),
        content: z.string().optional().describe("File content as text (for agent-generated content)"),
        path: z.string().optional().describe("Absolute local file path to attach (binary-safe, any file type). Takes precedence over content if both provided."),
      })).optional().describe("Optional file attachments (for send action). Each attachment needs content or path."),
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
