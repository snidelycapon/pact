/**
 * Handler for the pact_discover tool.
 *
 * Pulls latest from remote, scans pacts/ directory for subdirectories,
 * loads YAML frontmatter metadata via pact-loader, optionally filters
 * by keyword query, and returns a structured catalog alongside team members.
 * Falls back to local data with a warning when git pull fails.
 */

import type { GitPort, ConfigPort, FilePort } from "../ports.ts";
import { loadPactMetadata, loadFlatFilePacts } from "../pact-loader.ts";
import type { PactMetadata, AttachmentSlot } from "../pact-loader.ts";
import { log } from "../logger.ts";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface PactDiscoverParams {
  query?: string;
  format?: "full" | "compressed";
  scope?: string;
}

export interface PactDiscoverContext {
  userId: string;
  repoPath: string;
  git: GitPort;
  config: ConfigPort;
  file: FilePort;
}

export interface PactCatalogEntry {
  name: string;
  description: string;
  when_to_use: string[];
  context_bundle: {
    required: string[];
    fields: Record<string, { type: string; description: string }>;
  };
  response_bundle: {
    required: string[];
    fields: Record<string, { type: string; description: string }>;
  };
  has_hooks: boolean;
  scope?: string;
  defaults?: Record<string, unknown>;
  multi_round?: boolean;
  attachments?: AttachmentSlot[];
  registered_for?: string[];
}

export interface DiscoverResult {
  pacts?: PactCatalogEntry[];
  catalog?: string;
  team: Array<{ user_id: string; display_name: string }>;
  warning?: string;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function handlePactDiscover(
  params: PactDiscoverParams,
  ctx: PactDiscoverContext,
): Promise<DiscoverResult> {
  let warning: string | undefined;

  // 1. Pull latest (catch failure, set warning)
  try {
    await ctx.git.pull();
  } catch {
    warning = "Using local data (remote unreachable). Results may be stale.";
  }

  // 2. Try flat-file pact-store/ first, fall back to pacts/ directory
  const flatFilePacts = await loadFlatFilePacts(ctx.file);
  let pacts: PactCatalogEntry[];

  if (flatFilePacts.length > 0) {
    // Use flat-file pact store
    pacts = flatFilePacts.map(toEntry);
  } else {
    // Fall back to old pacts/ directory format
    let pactDirs: string[];
    try {
      pactDirs = await ctx.file.listDirectory("pacts");
    } catch {
      log("warn", "pact_discover: pacts directory not found");
      const team = await readTeam(ctx);
      return { pacts: [], team, ...(warning ? { warning } : {}) };
    }

    pacts = [];
    for (const dirName of pactDirs) {
      // Skip hidden directories (e.g. .gitkeep)
      if (dirName.startsWith(".")) {
        continue;
      }

      const metadata = await loadPactMetadata(ctx.file, dirName);
      if (!metadata) {
        continue;
      }

      pacts.push(toEntry(metadata));
    }
  }

  // 4. Filter by query if provided
  let filtered = pacts;
  if (params.query) {
    const terms = params.query.toLowerCase().split(/\s+/);
    filtered = pacts.filter((pact) => {
      const searchText = [
        pact.name,
        pact.description,
        ...pact.when_to_use,
      ].join(" ").toLowerCase();
      return terms.some((term) => searchText.includes(term));
    });
  }

  // 5. Sort by name for consistent ordering
  filtered.sort((a, b) => a.name.localeCompare(b.name));

  // 6. Read team members
  const team = await readTeam(ctx);

  // 7. Compressed format: pipe-delimited catalog string
  if (params.format === "compressed") {
    const lines = filtered.map((p) => {
      const ctx_req = p.context_bundle.required.join(",");
      const res_req = p.response_bundle.required.join(",");
      return `${p.name}|${p.description}|${p.scope ?? ""}|${ctx_req}\u2192${res_req}`;
    });
    return { catalog: lines.join("\n"), team, ...(warning ? { warning } : {}) };
  }

  return { pacts: filtered, team, ...(warning ? { warning } : {}) };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Map PactMetadata from pact-loader into a PactCatalogEntry. */
function toEntry(m: PactMetadata): PactCatalogEntry {
  return {
    name: m.name,
    description: m.description,
    when_to_use: m.when_to_use,
    context_bundle: m.context_bundle,
    response_bundle: m.response_bundle,
    has_hooks: m.has_hooks,
    ...(m.scope ? { scope: m.scope } : {}),
    ...(m.defaults ? { defaults: m.defaults } : {}),
    ...(m.multi_round !== undefined ? { multi_round: m.multi_round } : {}),
    ...(m.attachments ? { attachments: m.attachments } : {}),
    ...(m.registered_for ? { registered_for: m.registered_for } : {}),
  };
}

/** Read team members from config, mapping to the required shape. */
async function readTeam(
  ctx: PactDiscoverContext,
): Promise<Array<{ user_id: string; display_name: string }>> {
  try {
    const members = await ctx.config.readTeamMembers();
    return members.map((m) => ({
      user_id: m.user_id,
      display_name: m.display_name,
    }));
  } catch (error) {
    log("warn", "pact_discover: failed to read team members", {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}
