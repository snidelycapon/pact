/**
 * Build configuration for PACT MCP server.
 *
 * Produces dist/index.js as a single-file ESM bundle.
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

console.error("Built dist/index.js");
