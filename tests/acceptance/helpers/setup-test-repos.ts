/**
 * Test repository setup for acceptance tests.
 *
 * Creates a local bare git repo (simulating GitHub) plus two working
 * clones ("alice" and "bob") with the standard PACT directory
 * structure, config.json, and a sanity-check pact stub.
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
 * Minimal sanity-check pact file for tests (flat-file YAML frontmatter format).
 *
 * Required context fields match what pact-schema and enrichment tests expect.
 */
const TEST_PACT = `---
name: sanity-check
description: Validate findings on a bug investigation
version: "1.0.0"
scope: global
when_to_use:
  - You need a colleague to validate your findings on a bug investigation
context_bundle:
  required: [customer, product, issue_summary, involved_files, investigation_so_far, question]
  fields:
    customer: { type: string, description: "Customer name" }
    product: { type: string, description: "Product name and version" }
    issue_summary: { type: string, description: "Brief description of the issue" }
    involved_files: { type: string, description: "Files examined" }
    investigation_so_far: { type: string, description: "What you have found" }
    question: { type: string, description: "Specific question for the reviewer" }
    zendesk_ticket: { type: string, description: "Related Zendesk ticket ID" }
response_bundle:
  required: [answer]
  fields:
    answer: { type: string, description: "YES / NO / PARTIALLY with explanation" }
    evidence: { type: string, description: "What you compared or examined" }
    concerns: { type: string, description: "Any risks or caveats" }
    recommendation: { type: string, description: "Suggested next step" }
---

# Sanity Check

Validate findings on a bug investigation.
`;

/**
 * Create a complete test repo topology: bare remote + alice clone + bob clone.
 *
 * The repos are initialized with the PACT directory structure,
 * config.json, a sanity-check PACT.md, and .gitkeep files.
 *
 * Call cleanup() when done to remove all temp directories.
 */
export function createTestRepos(): TestRepoContext {
  const basePath = mkdtempSync(join(tmpdir(), "pact-accept-"));
  const remotePath = join(basePath, "remote.git");
  const aliceRepo = join(basePath, "alice");
  const bobRepo = join(basePath, "bob");

  // Create bare remote
  execSync(`git init --bare --initial-branch=main "${remotePath}"`, { stdio: "pipe" });

  // Clone for Alice and initialize structure
  execSync(`git clone "${remotePath}" "${aliceRepo}"`, { stdio: "pipe" });

  // Create directory structure and write files using Node fs (avoids
  // heredoc issues inside shell && chains).
  const dirs = [
    "requests/pending",
    "requests/active",
    "requests/completed",
    "requests/cancelled",
    "responses",
    "pact-store",
  ];
  for (const dir of dirs) {
    mkdirSync(join(aliceRepo, dir), { recursive: true });
  }
  for (const gk of [
    "requests/pending/.gitkeep",
    "requests/active/.gitkeep",
    "requests/completed/.gitkeep",
    "requests/cancelled/.gitkeep",
    "responses/.gitkeep",
  ]) {
    writeFileSync(join(aliceRepo, gk), "");
  }
  writeFileSync(
    join(aliceRepo, "config.json"),
    JSON.stringify(TEST_CONFIG, null, 2),
  );
  writeFileSync(join(aliceRepo, "pact-store/sanity-check.md"), TEST_PACT);

  execSync(
    [
      `cd "${aliceRepo}"`,
      `git config user.email "alice@test.local"`,
      `git config user.name "Alice"`,
      `git add -A`,
      `git commit -m "Initialize PACT repo"`,
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
// Test seeding helpers
// ---------------------------------------------------------------------------

/** Seed a pending request envelope directly into the repo and push. */
export function seedPendingRequest(
  repoPath: string,
  requestId: string,
  recipient: string,
  sender: string,
): void {
  const envelope = {
    request_id: requestId,
    request_type: "sanity-check",
    sender: {
      user_id: sender,
      display_name: sender.charAt(0).toUpperCase() + sender.slice(1),
    },
    recipient: {
      user_id: recipient,
      display_name: recipient.charAt(0).toUpperCase() + recipient.slice(1),
    },
    status: "pending",
    created_at: "2026-02-21T14:30:22.000Z",
    context_bundle: {
      question: "Does this make sense?",
      customer: "Acme Corp",
    },
  };
  writeFileSync(
    join(repoPath, "requests", "pending", `${requestId}.json`),
    JSON.stringify(envelope, null, 2),
  );
  execSync(`cd "${repoPath}" && git add -A && git commit -m "seed ${requestId}" && git push`, {
    stdio: "pipe",
  });
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
