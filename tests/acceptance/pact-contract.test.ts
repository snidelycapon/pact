/**
 * Acceptance Tests -- Pact Contract Validation
 *
 * Traces to: US-006
 *
 * These tests verify that the MCP server correctly validates pact
 * directory existence and provides pact paths for agent auto-loading.
 * The MCP server does NOT parse or enforce pact file content -- that
 * is agent-level behavior. What the server does:
 *
 *   - pact_request checks that pacts/{type}/PACT.md exists before accepting
 *   - pact_inbox includes pact_path in each returned request
 *   - Pact files are distributed via git pull (no separate mechanism)
 *
 * Note: Testing that agents produce consistent behavior from pact files
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
import { createPactServer } from "../../src/server.js";

describe("pact: pact validation and auto-loading", () => {
  let ctx: TestRepoContext;

  afterEach(() => {
    ctx?.cleanup();
  });

  // =========================================================================
  // Happy Path
  // =========================================================================

  it("pact_request accepts a request when the pact directory exists", async () => {
    ctx = createTestRepos();

    await given("the sanity-check pact file exists in the repo", () => {
      expect(fileExists(ctx.aliceRepo, "pacts/sanity-check/PACT.md")).toBe(true);
    });

    await when("Alice submits a sanity-check request", async () => {
      const aliceServer = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      const result = await aliceServer.callTool("pact_do", { action: "send",
        request_type: "sanity-check",
        recipient: "bob",
        context_bundle: { question: "Pact exists test" },
      }) as { request_id: string };

      expect(result.request_id).toBeTruthy();
    });
  });

  it("pact_inbox includes the pact_path for each pending request", async () => {
    ctx = createTestRepos();

    await given("a sanity-check request exists for Bob", async () => {
      const aliceServer = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      await aliceServer.callTool("pact_do", { action: "send",
        request_type: "sanity-check",
        recipient: "bob",
        context_bundle: { question: "Pact path test" },
      });
    });

    await when("Bob checks his inbox", async () => {
      const bobServer = createPactServer({ repoPath: ctx.bobRepo, userId: "bob" });
      const inbox = await bobServer.callTool("pact_do", { action: "inbox" }) as { requests: any[] };

      expect(inbox.requests).toHaveLength(1);
      // pact_path should point to the local file path
      expect(inbox.requests[0].pact_path).toContain("pacts/sanity-check/PACT.md");
    });
  });

  it("newly created pact type is available after git pull", async () => {
    ctx = createTestRepos();

    await given("Alice creates a new pact type 'code-review'", async () => {
      const pactDir = join(ctx.aliceRepo, "pacts", "code-review");
      mkdirSync(pactDir, { recursive: true });
      writeFileSync(
        join(pactDir, "PACT.md"),
        "# Code Review\n\nReview code changes for correctness.\n",
      );
      execSync(
        `cd "${ctx.aliceRepo}" && git add -A && git commit -m "add code-review pact" && git push`,
        { stdio: "pipe" },
      );
    });

    await when("Bob pulls the latest", async () => {
      gitPull(ctx.bobRepo);
    });

    await thenAssert("Bob's clone has the new pact file", () => {
      expect(fileExists(ctx.bobRepo, "pacts/code-review/PACT.md")).toBe(true);
    });

    // And Alice can now send code-review requests
    await thenAssert("Alice can submit a code-review request", async () => {
      const aliceServer = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      const result = await aliceServer.callTool("pact_do", { action: "send",
        request_type: "code-review",
        recipient: "bob",
        context_bundle: { diff_url: "https://github.com/acme/platform/pull/42" },
      }) as { request_id: string };

      expect(result.request_id).toBeTruthy();
    });
  });

  it("updated pact file is synced to all clones via git pull", async () => {
    ctx = createTestRepos();

    await given("Alice updates the sanity-check PACT.md to add a severity field", async () => {
      const pactPath = join(ctx.aliceRepo, "pacts", "sanity-check", "PACT.md");
      const updatedContent = `# Sanity Check (v2)

## Context Bundle Fields
| Field | Required |
|-------|----------|
| customer | yes |
| severity | yes |
| question | yes |
`;
      writeFileSync(pactPath, updatedContent);
      execSync(
        `cd "${ctx.aliceRepo}" && git add -A && git commit -m "update sanity-check pact" && git push`,
        { stdio: "pipe" },
      );
    });

    await when("Bob pulls the latest", async () => {
      gitPull(ctx.bobRepo);
    });

    await thenAssert("Bob's pact file contains the updated content", () => {
      const content = execSync(
        `cat "${join(ctx.bobRepo, "pacts", "sanity-check", "PACT.md")}"`,
        { encoding: "utf-8" },
      );
      expect(content).toContain("severity");
      expect(content).toContain("v2");
    });
  });

  // =========================================================================
  // Error Paths
  // =========================================================================

  it("pact_request rejects a request type with no pact directory", async () => {
    ctx = createTestRepos();

    await when("Alice tries to submit a 'code-review' request (pact does not exist)", async () => {
      expect(fileExists(ctx.aliceRepo, "pacts/code-review/PACT.md")).toBe(false);

      const aliceServer = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });

      await expect(
        aliceServer.callTool("pact_do", { action: "send",
          request_type: "code-review",
          recipient: "bob",
          context_bundle: { question: "No pact test" },
        }),
      ).rejects.toThrow(/no pact found.*code-review/i);
    });

    await thenAssert("no request file is created", async () => {
      const pending = listDir(ctx.aliceRepo, "requests/pending");
      expect(pending).toHaveLength(0);
    });
  });

  it("pact_request rejects when PACT.md file is missing (directory exists but no file)", async () => {
    ctx = createTestRepos();

    await given("a pact directory exists but has no PACT.md", async () => {
      mkdirSync(join(ctx.aliceRepo, "pacts", "empty-pact"), { recursive: true });
      execSync(
        `cd "${ctx.aliceRepo}" && touch pacts/empty-pact/.gitkeep && git add -A && git commit -m "empty pact dir" && git push`,
        { stdio: "pipe" },
      );
    });

    await when("Alice tries to submit an 'empty-pact' request", async () => {
      const aliceServer = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });

      await expect(
        aliceServer.callTool("pact_do", { action: "send",
          request_type: "empty-pact",
          recipient: "bob",
          context_bundle: { question: "Empty pact test" },
        }),
      ).rejects.toThrow(/no pact found.*empty-pact/i);
    });
  });

  it("pact validation happens before envelope is written", async () => {
    ctx = createTestRepos();

    await when("Alice submits a request with invalid pact AND invalid recipient", async () => {
      // The pact check should happen early, before any file writes
      const aliceServer = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });

      await expect(
        aliceServer.callTool("pact_do", { action: "send",
          request_type: "nonexistent-pact",
          recipient: "bob",
          context_bundle: { question: "Order of validation test" },
        }),
      ).rejects.toThrow(/no pact found/i);

      // No file should exist
      const pending = listDir(ctx.aliceRepo, "requests/pending");
      expect(pending).toHaveLength(0);
    });
  });
});
