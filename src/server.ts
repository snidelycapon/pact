/**
 * GARP MCP server factory.
 *
 * createGarpServer accepts configuration and returns an object with
 * a callTool method that dispatches to the 2 collapsed tool handlers:
 *   - garp_discover
 *   - garp_do
 */

import { GitAdapter } from "./adapters/git-adapter.ts";
import { ConfigAdapter } from "./adapters/config-adapter.ts";
import { FileAdapter } from "./adapters/file-adapter.ts";
import { handleGarpDiscover } from "./tools/garp-discover.ts";
import type { GarpDiscoverParams } from "./tools/garp-discover.ts";
import { handleGarpDo } from "./tools/garp-do.ts";

export interface GarpServerConfig {
  repoPath: string;
  userId: string;
}

export interface GarpServer {
  callTool(name: string, params: Record<string, unknown>): Promise<unknown>;
}

export function createGarpServer(config: GarpServerConfig): GarpServer {
  // Adapters are lazily created on first callTool invocation so that
  // createGarpServer itself remains a pure factory (simple-git validates
  // the directory exists at construction time).
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

  return {
    async callTool(name: string, params: Record<string, unknown>): Promise<unknown> {
      switch (name) {
        case "garp_discover":
          ensureAdapters();
          return handleGarpDiscover(params as unknown as GarpDiscoverParams, {
            userId: config.userId,
            repoPath: config.repoPath,
            git: git!,
            config: configAdapter!,
            file: file!,
          });
        case "garp_do":
          ensureAdapters();
          return handleGarpDo(params, {
            userId: config.userId,
            repoPath: config.repoPath,
            git: git!,
            config: configAdapter!,
            file: file!,
          });
        default:
          throw new Error(`Tool "${name}" is not yet implemented`);
      }
    },
  };
}
