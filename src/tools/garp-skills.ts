/**
 * Handler for the garp_skills tool.
 *
 * Pulls latest from remote, scans skills/ directory for available
 * request types, parses metadata from SKILL.md and schema.json,
 * optionally filters by keyword query, and returns structured results.
 * Falls back to local data with a warning when git pull fails.
 */

import type { GitPort, FilePort } from "../ports.ts";
import { parseSkillMetadata } from "../skill-parser.ts";
import type { SkillMetadata } from "../skill-parser.ts";
import { log } from "../logger.ts";

export interface GarpSkillsParams {
  query?: string;
}

export interface GarpSkillsContext {
  repoPath: string;
  git: GitPort;
  file: FilePort;
}

export interface SkillsResult {
  skills: SkillMetadata[];
  warning?: string;
}

export async function handleGarpSkills(
  params: GarpSkillsParams,
  ctx: GarpSkillsContext,
): Promise<SkillsResult> {
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
    return { skills: [], ...(warning ? { warning } : {}) };
  }

  // 3. Parse metadata for each skill directory
  const skills: SkillMetadata[] = [];
  for (const dirName of skillDirs) {
    // Skip hidden files like .gitkeep
    if (dirName.startsWith(".")) {
      continue;
    }
    const metadata = await parseSkillMetadata(ctx.file, ctx.repoPath, dirName);
    if (metadata) {
      skills.push(metadata);
    }
  }

  // 4. Filter by query if provided
  let filtered = skills;
  if (params.query) {
    const terms = params.query.toLowerCase().split(/\s+/);
    filtered = skills.filter((skill) => {
      const searchText = [
        skill.name,
        skill.description,
        skill.when_to_use,
      ].join(" ").toLowerCase();
      return terms.some((term) => searchText.includes(term));
    });
  }

  // 5. Sort by name for consistent ordering
  filtered.sort((a, b) => a.name.localeCompare(b.name));

  return { skills: filtered, ...(warning ? { warning } : {}) };
}
