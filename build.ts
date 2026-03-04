/**
 * Build configuration for PACT MCP server and CLI.
 *
 * Produces two bundles:
 *   dist/index.js — MCP server (stdio transport)
 *   dist/cli.js   — CLI entry point (pact inbox, pact poll)
 *
 * External dependencies (MCP SDK, simple-git, zod) are not bundled
 * and resolved from node_modules at runtime.
 *
 * Usage: bun run build
 */

import { build } from "esbuild";

await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile: "dist/index.js",
  packages: "external",
});

await build({
  entryPoints: ["src/cli.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile: "dist/cli.js",
  packages: "external",
  banner: { js: "#!/usr/bin/env node" },
});

console.error("Built dist/index.js + dist/cli.js");
