/**
 * Test repository setup for acceptance tests.
 *
 * Creates a local bare git repo (simulating GitHub) plus two working
 * clones ("alice" and "bob") with the standard GARP directory
 * structure, config.json, and a sanity-check skill stub.
 *
 * This follows the Alice + Bob pattern from the testing strategy.
 * No network access -- everything is local filesystem git.
 */

import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";

export interface TestRepoContext {
  /** Path to the bare repo (simulates the GitHub remote) */
  remotePath: string;
  /** Alice's working clone */
  aliceRepo: string;
  /** Bob's working clone */
  bobRepo: string;
  /** Base temp directory (for cleanup) */
  basePath: string;
  /** Remove all temp directories */
  cleanup: () => void;
}

/**
 * Standard team config for tests: two members, alice and bob.
 */
const TEST_CONFIG = {
  team_name: "Test Team",
  version: 1,
  members: [
    { user_id: "alice", display_name: "Alice" },
    { user_id: "bob", display_name: "Bob" },
  ],
};

/**
 * Minimal sanity-check skill file for tests.
 */
const TEST_SKILL = `# Sanity Check

## When To Use
When you need a colleague to validate your findings on a bug investigation.

## Context Bundle Fields
| Field | Required | Description |
|-------|----------|-------------|
| customer | yes | Customer name |
| product | yes | Product name and version |
| issue_summary | yes | Brief description of the issue |
| involved_files | yes | Files examined |
| investigation_so_far | yes | What you have found |
| question | yes | Specific question for the reviewer |
| zendesk_ticket | no | Related Zendesk ticket ID |

## Response Structure
| Field | Description |
|-------|-------------|
| answer | YES / NO / PARTIALLY with brief explanation |
| evidence | What you compared or examined |
| concerns | Any risks or caveats |
| recommendation | Suggested next step |
`;

/**
 * Create a complete test repo topology: bare remote + alice clone + bob clone.
 *
 * The repos are initialized with the GARP directory structure,
 * config.json, a sanity-check SKILL.md, and .gitkeep files.
 *
 * Call cleanup() when done to remove all temp directories.
 */
export function createTestRepos(): TestRepoContext {
  const basePath = mkdtempSync(join(tmpdir(), "garp-accept-"));
  const remotePath = join(basePath, "remote.git");
  const aliceRepo = join(basePath, "alice");
  const bobRepo = join(basePath, "bob");

  // Create bare remote
  execSync(`git init --bare "${remotePath}"`, { stdio: "pipe" });

  // Clone for Alice and initialize structure
  execSync(`git clone "${remotePath}" "${aliceRepo}"`, { stdio: "pipe" });

  // Create directory structure and write files using Node fs (avoids
  // heredoc issues inside shell && chains).
  const dirs = [
    "requests/pending",
    "requests/active",
    "requests/completed",
    "responses",
    "skills/sanity-check",
  ];
  for (const dir of dirs) {
    mkdirSync(join(aliceRepo, dir), { recursive: true });
  }
  for (const gk of [
    "requests/pending/.gitkeep",
    "requests/active/.gitkeep",
    "requests/completed/.gitkeep",
    "responses/.gitkeep",
    "skills/.gitkeep",
  ]) {
    writeFileSync(join(aliceRepo, gk), "");
  }
  writeFileSync(
    join(aliceRepo, "config.json"),
    JSON.stringify(TEST_CONFIG, null, 2),
  );
  writeFileSync(join(aliceRepo, "skills/sanity-check/SKILL.md"), TEST_SKILL);

  execSync(
    [
      `cd "${aliceRepo}"`,
      `git config user.email "alice@test.local"`,
      `git config user.name "Alice"`,
      `git add -A`,
      `git commit -m "Initialize GARP repo"`,
      `git push origin main`,
    ].join(" && "),
    { stdio: "pipe" },
  );

  // Clone for Bob
  execSync(`git clone "${remotePath}" "${bobRepo}"`, { stdio: "pipe" });
  execSync(
    [
      `cd "${bobRepo}"`,
      `git config user.email "bob@test.local"`,
      `git config user.name "Bob"`,
    ].join(" && "),
    { stdio: "pipe" },
  );

  return {
    remotePath,
    aliceRepo,
    bobRepo,
    basePath,
    cleanup: () => {
      if (existsSync(basePath)) {
        rmSync(basePath, { recursive: true, force: true });
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Repo inspection helpers (for assertions)
// ---------------------------------------------------------------------------

/** List filenames in a directory within the repo (no path prefix, just names). */
export function listDir(repoPath: string, dir: string): string[] {
  const full = join(repoPath, dir);
  if (!existsSync(full)) return [];
  const out = execSync(`ls -1 "${full}"`, { encoding: "utf-8" }).trim();
  return out ? out.split("\n").filter((f) => f !== ".gitkeep") : [];
}

/** Read and parse a JSON file from the repo. */
export function readRepoJSON<T = unknown>(repoPath: string, filePath: string): T {
  const full = join(repoPath, filePath);
  return JSON.parse(readFileSync(full, "utf-8")) as T;
}

/** Check whether a file exists in the repo. */
export function fileExists(repoPath: string, filePath: string): boolean {
  return existsSync(join(repoPath, filePath));
}

/** Get the most recent git commit message from the repo. */
export function lastCommitMessage(repoPath: string): string {
  return execSync(`cd "${repoPath}" && git log -1 --format=%s`, {
    encoding: "utf-8",
  }).trim();
}

/** Get all git commit messages (one per line, most recent first). */
export function allCommitMessages(repoPath: string): string[] {
  return execSync(`cd "${repoPath}" && git log --format=%s`, {
    encoding: "utf-8",
  })
    .trim()
    .split("\n");
}

/** Pull latest from remote in a given repo clone. */
export function gitPull(repoPath: string): void {
  execSync(`cd "${repoPath}" && git pull --rebase`, { stdio: "pipe" });
}
