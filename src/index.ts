/**
 * GARP MCP server entry point (production).
 *
 * Reads GARP_REPO and GARP_USER from environment variables,
 * creates the MCP server, and connects via stdio transport.
 *
 * Usage: GARP_REPO=/path/to/repo GARP_USER=alice bun src/index.ts
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "./mcp-server.ts";
import { TeamConfigSchema } from "./schemas.ts";

const GARP_REPO = process.env.GARP_REPO;
const GARP_USER = process.env.GARP_USER;

if (!GARP_REPO) {
  console.error("GARP_REPO environment variable is required");
  process.exit(1);
}

if (!GARP_USER) {
  console.error("GARP_USER environment variable is required");
  process.exit(1);
}

// Validate GARP_REPO is a git repository
if (!existsSync(join(GARP_REPO, ".git"))) {
  console.error(`GARP_REPO '${GARP_REPO}' is not a git repository (no .git directory)`);
  process.exit(1);
}

// Validate GARP_USER exists in config.json
const configPath = join(GARP_REPO, "config.json");
if (!existsSync(configPath)) {
  console.error(`No config.json found in GARP_REPO '${GARP_REPO}'`);
  process.exit(1);
}

try {
  const raw = JSON.parse(await readFile(configPath, "utf-8"));
  const config = TeamConfigSchema.parse(raw);
  const member = config.members.find((m) => m.user_id === GARP_USER);
  if (!member) {
    console.error(`GARP_USER '${GARP_USER}' not found in ${configPath} team members`);
    process.exit(1);
  }
} catch (err) {
  if (err instanceof Error && err.message.includes("GARP_USER")) throw err;
  console.error(`Failed to read ${configPath}: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
}

const server = createMcpServer({ repoPath: GARP_REPO, userId: GARP_USER });
const transport = new StdioServerTransport();
await server.connect(transport);
