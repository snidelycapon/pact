/**
 * Handler for the garp_discover tool.
 *
 * Pulls latest from remote, scans skills/ directory for subdirectories,
 * loads YAML frontmatter metadata via skill-loader, optionally filters
 * by keyword query, and returns a structured catalog alongside team members.
 * Falls back to local data with a warning when git pull fails.
 */

import type { GitPort, ConfigPort, FilePort } from "../ports.ts";
import { loadSkillMetadata } from "../skill-loader.ts";
import type { SkillMetadata } from "../skill-loader.ts";
import { log } from "../logger.ts";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface GarpDiscoverParams {
  query?: string;
}

export interface GarpDiscoverContext {
  userId: string;
  repoPath: string;
  git: GitPort;
  config: ConfigPort;
  file: FilePort;
}

export interface SkillCatalogEntry {
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
  has_brain: boolean;
}

export interface DiscoverResult {
  skills: SkillCatalogEntry[];
  team: Array<{ user_id: string; display_name: string }>;
  warning?: string;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function handleGarpDiscover(
  params: GarpDiscoverParams,
  ctx: GarpDiscoverContext,
): Promise<DiscoverResult> {
  let warning: string | undefined;

  // 1. Pull latest (catch failure, set warning)
  try {
    await ctx.git.pull();
  } catch {
    warning = "Using local data (remote unreachable). Results may be stale.";
  }

  // 2. List skills directory
  let skillDirs: string[];
  try {
    skillDirs = await ctx.file.listDirectory("skills");
  } catch {
    log("warn", "garp_discover: skills directory not found");
    const team = await readTeam(ctx);
    return { skills: [], team, ...(warning ? { warning } : {}) };
  }

  // 3. Load metadata for each skill directory
  const skills: SkillCatalogEntry[] = [];
  for (const dirName of skillDirs) {
    // Skip hidden directories (e.g. .gitkeep)
    if (dirName.startsWith(".")) {
      continue;
    }

    const metadata = await loadSkillMetadata(ctx.file, dirName);
    if (!metadata) {
      continue;
    }

    skills.push(toEntry(metadata));
  }

  // 4. Filter by query if provided
  let filtered = skills;
  if (params.query) {
    const terms = params.query.toLowerCase().split(/\s+/);
    filtered = skills.filter((skill) => {
      const searchText = [
        skill.name,
        skill.description,
        ...skill.when_to_use,
      ].join(" ").toLowerCase();
      return terms.some((term) => searchText.includes(term));
    });
  }

  // 5. Sort by name for consistent ordering
  filtered.sort((a, b) => a.name.localeCompare(b.name));

  // 6. Read team members
  const team = await readTeam(ctx);

  return { skills: filtered, team, ...(warning ? { warning } : {}) };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Map SkillMetadata from skill-loader into a SkillCatalogEntry. */
function toEntry(m: SkillMetadata): SkillCatalogEntry {
  return {
    name: m.name,
    description: m.description,
    when_to_use: m.when_to_use,
    context_bundle: m.context_bundle,
    response_bundle: m.response_bundle,
    has_brain: m.has_brain,
  };
}

/** Read team members from config, mapping to the required shape. */
async function readTeam(
  ctx: GarpDiscoverContext,
): Promise<Array<{ user_id: string; display_name: string }>> {
  try {
    const members = await ctx.config.readTeamMembers();
    return members.map((m) => ({
      user_id: m.user_id,
      display_name: m.display_name,
    }));
  } catch (error) {
    log("warn", "garp_discover: failed to read team members", {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}
