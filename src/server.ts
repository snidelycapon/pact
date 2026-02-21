/**
 * GARP MCP server factory.
 *
 * createGarpServer accepts configuration and returns an object with
 * a callTool method that dispatches to tool handlers.
 */

import { GitAdapter } from "./adapters/git-adapter.ts";
import { ConfigAdapter } from "./adapters/config-adapter.ts";
import { FileAdapter } from "./adapters/file-adapter.ts";
import { handleGarpRequest } from "./tools/garp-request.ts";
import type { GarpRequestParams } from "./tools/garp-request.ts";
import { handleGarpInbox } from "./tools/garp-inbox.ts";
import { handleGarpRespond } from "./tools/garp-respond.ts";
import type { GarpRespondParams } from "./tools/garp-respond.ts";
import { handleGarpStatus } from "./tools/garp-status.ts";
import type { GarpStatusParams } from "./tools/garp-status.ts";

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
        case "garp_request":
          ensureAdapters();
          return handleGarpRequest(params as unknown as GarpRequestParams, {
            userId: config.userId,
            repoPath: config.repoPath,
            git: git!,
            config: configAdapter!,
            file: file!,
          });
        case "garp_inbox":
          ensureAdapters();
          return handleGarpInbox(params, {
            userId: config.userId,
            repoPath: config.repoPath,
            git: git!,
            file: file!,
          });
        case "garp_respond":
          ensureAdapters();
          return handleGarpRespond(params as unknown as GarpRespondParams, {
            userId: config.userId,
            repoPath: config.repoPath,
            git: git!,
            config: configAdapter!,
            file: file!,
          });
        case "garp_status":
          ensureAdapters();
          return handleGarpStatus(params as unknown as GarpStatusParams, {
            userId: config.userId,
            repoPath: config.repoPath,
            git: git!,
            file: file!,
          });
        default:
          throw new Error(`Tool "${name}" is not yet implemented`);
      }
    },
  };
}
