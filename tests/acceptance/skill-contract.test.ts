/**
 * Acceptance Tests -- Skill Contract Validation
 *
 * Traces to: US-006
 *
 * These tests verify that the MCP server correctly validates skill
 * directory existence and provides skill paths for agent auto-loading.
 * The MCP server does NOT parse or enforce skill file content -- that
 * is agent-level behavior. What the server does:
 *
 *   - garp_request checks that skills/{type}/SKILL.md exists before accepting
 *   - garp_inbox includes skill_path in each returned request
 *   - Skill files are distributed via git pull (no separate mechanism)
 *
 * Note: Testing that agents produce consistent behavior from skill files
 * is out of scope for automated acceptance tests. That is validated
 * via manual round-trip tests (US-008 manual checklist).
 *
 * Error/edge scenarios: 3 of 7 total (43%)
 */

import { describe, it, expect, afterEach } from "vitest";
import {
  createTestRepos,
  listDir,
  fileExists,
  gitPull,
  type TestRepoContext,
} from "./helpers/setup-test-repos";
import { given, when, thenAssert } from "./helpers/gwt";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { createGarpServer } from "../../src/server.js";

describe("skill contract: skill validation and auto-loading", () => {
  let ctx: TestRepoContext;

  afterEach(() => {
    ctx?.cleanup();
  });

  // =========================================================================
  // Happy Path
  // =========================================================================

  it("garp_request accepts a request when the skill directory exists", async () => {
    ctx = createTestRepos();

    await given("the sanity-check skill file exists in the repo", () => {
      expect(fileExists(ctx.aliceRepo, "skills/sanity-check/SKILL.md")).toBe(true);
    });

    await when("Alice submits a sanity-check request", async () => {
      const aliceServer = createGarpServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      const result = await aliceServer.callTool("garp_do", { action: "send",
        request_type: "sanity-check",
        recipient: "bob",
        context_bundle: { question: "Skill exists test" },
      }) as { request_id: string };

      expect(result.request_id).toBeTruthy();
    });
  });

  it("garp_inbox includes the skill_path for each pending request", async () => {
    ctx = createTestRepos();

    await given("a sanity-check request exists for Bob", async () => {
      const aliceServer = createGarpServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      await aliceServer.callTool("garp_do", { action: "send",
        request_type: "sanity-check",
        recipient: "bob",
        context_bundle: { question: "Skill path test" },
      });
    });

    await when("Bob checks his inbox", async () => {
      const bobServer = createGarpServer({ repoPath: ctx.bobRepo, userId: "bob" });
      const inbox = await bobServer.callTool("garp_do", { action: "inbox" }) as { requests: any[] };

      expect(inbox.requests).toHaveLength(1);
      // skill_path should point to the local file path
      expect(inbox.requests[0].skill_path).toContain("skills/sanity-check/SKILL.md");
    });
  });

  it("newly created skill type is available after git pull", async () => {
    ctx = createTestRepos();

    await given("Alice creates a new skill type 'code-review'", async () => {
      const skillDir = join(ctx.aliceRepo, "skills", "code-review");
      mkdirSync(skillDir, { recursive: true });
      writeFileSync(
        join(skillDir, "SKILL.md"),
        "# Code Review\n\nReview code changes for correctness.\n",
      );
      execSync(
        `cd "${ctx.aliceRepo}" && git add -A && git commit -m "add code-review skill" && git push`,
        { stdio: "pipe" },
      );
    });

    await when("Bob pulls the latest", async () => {
      gitPull(ctx.bobRepo);
    });

    await thenAssert("Bob's clone has the new skill file", () => {
      expect(fileExists(ctx.bobRepo, "skills/code-review/SKILL.md")).toBe(true);
    });

    // And Alice can now send code-review requests
    await thenAssert("Alice can submit a code-review request", async () => {
      const aliceServer = createGarpServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      const result = await aliceServer.callTool("garp_do", { action: "send",
        request_type: "code-review",
        recipient: "bob",
        context_bundle: { diff_url: "https://github.com/acme/platform/pull/42" },
      }) as { request_id: string };

      expect(result.request_id).toBeTruthy();
    });
  });

  it("updated skill file is synced to all clones via git pull", async () => {
    ctx = createTestRepos();

    await given("Alice updates the sanity-check SKILL.md to add a severity field", async () => {
      const skillPath = join(ctx.aliceRepo, "skills", "sanity-check", "SKILL.md");
      const updatedContent = `# Sanity Check (v2)

## Context Bundle Fields
| Field | Required |
|-------|----------|
| customer | yes |
| severity | yes |
| question | yes |
`;
      writeFileSync(skillPath, updatedContent);
      execSync(
        `cd "${ctx.aliceRepo}" && git add -A && git commit -m "update sanity-check skill" && git push`,
        { stdio: "pipe" },
      );
    });

    await when("Bob pulls the latest", async () => {
      gitPull(ctx.bobRepo);
    });

    await thenAssert("Bob's skill file contains the updated content", () => {
      const content = execSync(
        `cat "${join(ctx.bobRepo, "skills", "sanity-check", "SKILL.md")}"`,
        { encoding: "utf-8" },
      );
      expect(content).toContain("severity");
      expect(content).toContain("v2");
    });
  });

  // =========================================================================
  // Error Paths
  // =========================================================================

  it("garp_request rejects a request type with no skill directory", async () => {
    ctx = createTestRepos();

    await when("Alice tries to submit a 'code-review' request (skill does not exist)", async () => {
      expect(fileExists(ctx.aliceRepo, "skills/code-review/SKILL.md")).toBe(false);

      const aliceServer = createGarpServer({ repoPath: ctx.aliceRepo, userId: "alice" });

      await expect(
        aliceServer.callTool("garp_do", { action: "send",
          request_type: "code-review",
          recipient: "bob",
          context_bundle: { question: "No skill test" },
        }),
      ).rejects.toThrow(/no skill found.*code-review/i);
    });

    await thenAssert("no request file is created", async () => {
      const pending = listDir(ctx.aliceRepo, "requests/pending");
      expect(pending).toHaveLength(0);
    });
  });

  it("garp_request rejects when SKILL.md file is missing (directory exists but no file)", async () => {
    ctx = createTestRepos();

    await given("a skill directory exists but has no SKILL.md", async () => {
      mkdirSync(join(ctx.aliceRepo, "skills", "empty-skill"), { recursive: true });
      execSync(
        `cd "${ctx.aliceRepo}" && touch skills/empty-skill/.gitkeep && git add -A && git commit -m "empty skill dir" && git push`,
        { stdio: "pipe" },
      );
    });

    await when("Alice tries to submit an 'empty-skill' request", async () => {
      const aliceServer = createGarpServer({ repoPath: ctx.aliceRepo, userId: "alice" });

      await expect(
        aliceServer.callTool("garp_do", { action: "send",
          request_type: "empty-skill",
          recipient: "bob",
          context_bundle: { question: "Empty skill test" },
        }),
      ).rejects.toThrow(/no skill found.*empty-skill/i);
    });
  });

  it("skill validation happens before envelope is written", async () => {
    ctx = createTestRepos();

    await when("Alice submits a request with invalid skill AND invalid recipient", async () => {
      // The skill check should happen early, before any file writes
      const aliceServer = createGarpServer({ repoPath: ctx.aliceRepo, userId: "alice" });

      await expect(
        aliceServer.callTool("garp_do", { action: "send",
          request_type: "nonexistent-skill",
          recipient: "bob",
          context_bundle: { question: "Order of validation test" },
        }),
      ).rejects.toThrow(/no skill found/i);

      // No file should exist
      const pending = listDir(ctx.aliceRepo, "requests/pending");
      expect(pending).toHaveLength(0);
    });
  });
});
