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
import { writeFileSync } from "node:fs";
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
      expect(fileExists(ctx.aliceRepo, "pact-store/sanity-check.md")).toBe(true);
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
      expect(inbox.requests[0].pact_path).toContain("pact-store/sanity-check.md");
    });
  });

  it("newly created pact type is available after git pull", async () => {
    ctx = createTestRepos();

    await given("Alice creates a new pact type 'code-review'", async () => {
      writeFileSync(
        join(ctx.aliceRepo, "pact-store", "code-review.md"),
        `---
name: code-review
description: Review code changes for correctness
scope: global
when_to_use:
  - When you need a teammate to review code changes before merging
context_bundle:
  required: [diff_url]
  fields:
    diff_url: { type: string, description: "Pull request URL" }
response_bundle:
  required: [status]
  fields:
    status: { type: string, description: "approve / request-changes / comment" }
---

# Code Review

Review code changes for correctness.
`,
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
      expect(fileExists(ctx.bobRepo, "pact-store/code-review.md")).toBe(true);
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

    await given("Alice updates the sanity-check pact to add a severity field", async () => {
      const pactPath = join(ctx.aliceRepo, "pact-store", "sanity-check.md");
      const updatedContent = `---
name: sanity-check
description: Sanity Check (v2)
version: "2.0.0"
scope: global
when_to_use:
  - Validate findings
context_bundle:
  required: [customer, severity, question]
  fields:
    customer: { type: string, description: "Customer name" }
    severity: { type: string, description: "Issue severity" }
    question: { type: string, description: "Specific question" }
response_bundle:
  required: [answer]
  fields:
    answer: { type: string, description: "Answer" }
---

# Sanity Check (v2)
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
      const content = require("node:fs").readFileSync(
        join(ctx.bobRepo, "pact-store", "sanity-check.md"),
        "utf-8",
      );
      expect(content).toContain("severity");
      expect(content).toContain("v2");
    });
  });

  // =========================================================================
  // Error Paths
  // =========================================================================

  it("pact_request sends request with unknown pact type, returning a validation warning", async () => {
    ctx = createTestRepos();

    await when("Alice tries to submit a 'code-review' request (pact does not exist)", async () => {
      expect(fileExists(ctx.aliceRepo, "pact-store/code-review.md")).toBe(false);

      const aliceServer = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });

      const result = (await aliceServer.callTool("pact_do", { action: "send",
        request_type: "code-review",
        recipient: "bob",
        context_bundle: { question: "No pact test" },
      })) as { request_id: string; validation_warnings?: string[] };
      expect(result.request_id).toBeTruthy();
      expect(result.validation_warnings).toBeDefined();
      expect(result.validation_warnings!.some((w: string) => /code-review/i.test(w))).toBe(true);
    });

    await thenAssert("request file IS created (dumb pipe)", async () => {
      const pending = listDir(ctx.aliceRepo, "requests/pending");
      expect(pending).toHaveLength(1);
    });
  });

  it("pact file without YAML frontmatter still allows sending (dumb pipe)", async () => {
    ctx = createTestRepos();

    await given("a .md file exists in pact-store but has no YAML frontmatter", async () => {
      writeFileSync(join(ctx.aliceRepo, "pact-store", "empty-pact.md"), "# No Frontmatter\n\nJust markdown.\n");
      execSync(
        `cd "${ctx.aliceRepo}" && git add -A && git commit -m "empty pact file" && git push`,
        { stdio: "pipe" },
      );
    });

    await when("Alice submits an 'empty-pact' request", async () => {
      const aliceServer = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });

      const result = (await aliceServer.callTool("pact_do", {
        action: "send",
        request_type: "empty-pact",
        recipient: "bob",
        context_bundle: { question: "Empty pact test" },
      })) as { request_id: string };
      expect(result.request_id).toBeTruthy();
    });
  });

  it("request with unknown pact type still creates envelope (with warning)", async () => {
    ctx = createTestRepos();

    await when("Alice submits a request with unknown pact type", async () => {
      const aliceServer = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });

      const result = (await aliceServer.callTool("pact_do", { action: "send",
        request_type: "nonexistent-pact",
        recipient: "bob",
        context_bundle: { question: "Order of validation test" },
      })) as { request_id: string; validation_warnings?: string[] };
      expect(result.request_id).toBeTruthy();
      expect(result.validation_warnings).toBeDefined();

      // File SHOULD exist now (dumb pipe sends regardless)
      const pending = listDir(ctx.aliceRepo, "requests/pending");
      expect(pending).toHaveLength(1);
    });
  });
});
