/**
 * PACT MCP server entry point (production).
 *
 * Reads PACT_REPO, PACT_USER, and optionally PACT_CONFIG from
 * environment variables, creates the MCP server, and connects
 * via stdio transport.
 *
 * Usage: PACT_REPO=/path/to/repo PACT_USER=alice bun src/index.ts
 *
 * If PACT_CONFIG is set, it points to the local user config file.
 * Otherwise defaults to ~/.pact.json. If no config file exists,
 * PACT_USER and optional PACT_DISPLAY_NAME are used directly.
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "./mcp-server.ts";
import { UserConfigSchema } from "./schemas.ts";
import { normalizeId } from "./normalize.ts";

const PACT_REPO = process.env.PACT_REPO;
const PACT_USER = process.env.PACT_USER;
const PACT_CONFIG = process.env.PACT_CONFIG;

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

// Resolve config path: PACT_CONFIG > ~/.pact.json
const configPath = PACT_CONFIG ?? join(homedir(), ".pact.json");

// If config file exists, validate it. If not, create an in-memory default.
let userId = normalizeId(PACT_USER);
let displayName = process.env.PACT_DISPLAY_NAME ?? PACT_USER;
let subscriptions: string[] = [];

if (existsSync(configPath)) {
  try {
    const raw = JSON.parse(await readFile(configPath, "utf-8"));
    const config = UserConfigSchema.parse(raw);
    userId = normalizeId(config.user_id);
    displayName = config.display_name;
    subscriptions = config.subscriptions.map(normalizeId);
  } catch (err) {
    console.error(`Failed to read ${configPath}: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

const server = createMcpServer({
  repoPath: PACT_REPO,
  userId,
  displayName,
  subscriptions,
  configPath,
});
const transport = new StdioServerTransport();
await server.connect(transport);
