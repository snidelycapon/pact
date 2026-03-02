/**
 * PACT MCP server factory.
 *
 * createPactServer accepts configuration and returns an object with
 * a callTool method that dispatches to the 2 collapsed tool handlers:
 *   - pact_discover
 *   - pact_do
 */

import { GitAdapter } from "./adapters/git-adapter.ts";
import { ConfigAdapter } from "./adapters/config-adapter.ts";
import { FileAdapter } from "./adapters/file-adapter.ts";
import { handlePactDiscover } from "./tools/pact-discover.ts";
import type { PactDiscoverParams } from "./tools/pact-discover.ts";
import { handlePactDo } from "./tools/pact-do.ts";
import { normalizeId } from "./normalize.ts";

export interface PactServerConfig {
  repoPath: string;
  userId: string;
  displayName?: string;
}

export interface PactServer {
  callTool(name: string, params: Record<string, unknown>): Promise<unknown>;
}

export function createPactServer(config: PactServerConfig): PactServer {
  const normalizedUserId = normalizeId(config.userId);

  let git: GitAdapter | undefined;
  let configAdapter: ConfigAdapter | undefined;
  let file: FileAdapter | undefined;

  function ensureAdapters() {
    if (!git) {
      git = new GitAdapter(config.repoPath);
      file = new FileAdapter(config.repoPath);
      configAdapter = new ConfigAdapter(
        normalizedUserId,
        config.displayName ?? config.userId,
        file,
        git,
      );
    }
  }

  return {
    async callTool(name: string, params: Record<string, unknown>): Promise<unknown> {
      switch (name) {
        case "pact_discover":
          ensureAdapters();
          return handlePactDiscover(params as unknown as PactDiscoverParams, {
            userId: normalizedUserId,
            repoPath: config.repoPath,
            git: git!,
            file: file!,
          });
        case "pact_do":
          ensureAdapters();
          return handlePactDo(params, {
            userId: normalizedUserId,
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
