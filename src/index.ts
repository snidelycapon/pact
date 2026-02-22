/**
 * PACT MCP server entry point (production).
 *
 * Reads PACT_REPO and PACT_USER from environment variables,
 * creates the MCP server, and connects via stdio transport.
 *
 * Usage: PACT_REPO=/path/to/repo PACT_USER=alice bun src/index.ts
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "./mcp-server.ts";
import { TeamConfigSchema } from "./schemas.ts";

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

// Validate PACT_USER exists in config.json
const configPath = join(PACT_REPO, "config.json");
if (!existsSync(configPath)) {
  console.error(`No config.json found in PACT_REPO '${PACT_REPO}'`);
  process.exit(1);
}

try {
  const raw = JSON.parse(await readFile(configPath, "utf-8"));
  const config = TeamConfigSchema.parse(raw);
  const member = config.members.find((m) => m.user_id === PACT_USER);
  if (!member) {
    console.error(`PACT_USER '${PACT_USER}' not found in ${configPath} team members`);
    process.exit(1);
  }
} catch (err) {
  if (err instanceof Error && err.message.includes("PACT_USER")) throw err;
  console.error(`Failed to read ${configPath}: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
}

const server = createMcpServer({ repoPath: PACT_REPO, userId: PACT_USER });
const transport = new StdioServerTransport();
await server.connect(transport);
