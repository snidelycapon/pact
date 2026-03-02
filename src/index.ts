/**
 * PACT MCP server entry point (production).
 *
 * Reads PACT_REPO and PACT_USER from environment variables, creates
 * the MCP server, and connects via stdio transport.
 *
 * Usage: PACT_REPO=/path/to/repo PACT_USER=alice node dist/index.js
 *
 * Identity comes from environment variables:
 *   - PACT_USER (required): user ID
 *   - PACT_DISPLAY_NAME (optional): friendly name, defaults to PACT_USER
 *
 * Subscriptions are stored in the pact repo at members/{user_id}.json.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "./mcp-server.ts";
import { normalizeId } from "./normalize.ts";

const PACT_REPO = process.env.PACT_REPO;
const PACT_USER = process.env.PACT_USER;

if (!PACT_REPO) {
  console.error("PACT_REPO environment variable is required");
  process.exit(1);
}

if (!PACT_USER) {
  console.error("PACT_USER environment variable is required");
  process.exit(1);
}

// Validate PACT_REPO is a git repository
if (!existsSync(join(PACT_REPO, ".git"))) {
  console.error(`PACT_REPO '${PACT_REPO}' is not a git repository (no .git directory)`);
  process.exit(1);
}

const userId = normalizeId(PACT_USER);
const displayName = process.env.PACT_DISPLAY_NAME ?? PACT_USER;

const server = createMcpServer({
  repoPath: PACT_REPO,
  userId,
  displayName,
});
const transport = new StdioServerTransport();
await server.connect(transport);
