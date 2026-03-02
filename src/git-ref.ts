/**
 * Git remote reference resolver.
 *
 * Resolves a local file path to a canonical remote reference:
 *   org/repo@branch:path/to/file#L42-L78
 *
 * Used by agents to produce portable references that work across
 * machines and for other participants who don't have the same local
 * checkout.
 */

import { execFile } from "node:child_process";
import { relative, resolve } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);

export interface GitRef {
  org: string;
  repo: string;
  branch: string;
  path: string;
  commit?: string;
  lines?: [number, number];
}

/**
 * Resolve a local file path to a remote git reference.
 *
 * @param filePath - Absolute path to a file on disk
 * @param lines - Optional [startLine, endLine] tuple
 * @returns GitRef with org/repo/branch/path/commit, or null if not in a git repo
 */
export async function resolveGitRef(
  filePath: string,
  lines?: [number, number],
): Promise<GitRef | null> {
  const absPath = resolve(filePath);

  let repoRoot: string;
  try {
    const { stdout } = await exec("git", ["rev-parse", "--show-toplevel"], {
      cwd: absPath.endsWith("/") ? absPath : resolve(absPath, ".."),
    });
    repoRoot = stdout.trim();
  } catch {
    return null; // Not in a git repo
  }

  const relPath = relative(repoRoot, absPath);

  // Get remote URL (prefer origin, fall back to first remote)
  let remoteUrl: string;
  try {
    const { stdout } = await exec("git", ["remote", "get-url", "origin"], { cwd: repoRoot });
    remoteUrl = stdout.trim();
  } catch {
    try {
      const { stdout: remotes } = await exec("git", ["remote"], { cwd: repoRoot });
      const firstRemote = remotes.trim().split("\n")[0];
      if (!firstRemote) return null;
      const { stdout } = await exec("git", ["remote", "get-url", firstRemote], { cwd: repoRoot });
      remoteUrl = stdout.trim();
    } catch {
      return null;
    }
  }

  // Parse org/repo from remote URL
  const parsed = parseRemoteUrl(remoteUrl);
  if (!parsed) return null;

  // Get current branch
  let branch: string;
  try {
    const { stdout } = await exec("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: repoRoot });
    branch = stdout.trim();
  } catch {
    branch = "main";
  }

  // Get current commit SHA (short)
  let commit: string | undefined;
  try {
    const { stdout } = await exec("git", ["rev-parse", "--short", "HEAD"], { cwd: repoRoot });
    commit = stdout.trim();
  } catch {
    // Optional — leave undefined
  }

  return {
    org: parsed.org,
    repo: parsed.repo,
    branch,
    path: relPath,
    ...(commit ? { commit } : {}),
    ...(lines ? { lines } : {}),
  };
}

/**
 * Format a GitRef as a canonical string.
 *
 * Examples:
 *   acme-corp/backend@main:src/auth.ts
 *   acme-corp/backend@main:src/auth.ts#L42-L78
 */
export function formatGitRef(ref: GitRef): string {
  let s = `${ref.org}/${ref.repo}@${ref.branch}:${ref.path}`;
  if (ref.lines) {
    s += `#L${ref.lines[0]}-L${ref.lines[1]}`;
  }
  return s;
}

/**
 * Parse a git remote URL into org/repo.
 *
 * Handles:
 *   git@github.com:org/repo.git
 *   https://github.com/org/repo.git
 *   https://github.com/org/repo
 */
function parseRemoteUrl(url: string): { org: string; repo: string } | null {
  // SSH format: git@github.com:org/repo.git
  const sshMatch = url.match(/:([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (sshMatch) return { org: sshMatch[1], repo: sshMatch[2] };

  // HTTPS format: https://github.com/org/repo.git
  const httpsMatch = url.match(/\/([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (httpsMatch) return { org: httpsMatch[1], repo: httpsMatch[2] };

  return null;
}
