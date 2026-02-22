/**
 * Acceptance Tests -- pact_do (Collapsed Action Dispatch)
 *
 * Feature: collapsed-tools-brain
 *
 * Tests exercise the pact_do driving port (tool handler) against
 * real local git repos. pact_do dispatches actions to existing
 * handler modules. Scenarios verify:
 *   - Agent sends a request and recipient retrieves it via pact_do
 *   - Each action (send, inbox, respond, check_status, cancel, amend, view_thread) dispatches correctly
 *   - Unknown action produces descriptive error listing valid actions
 *   - Missing or empty action field produces error
 *   - Handler validation errors propagate unchanged through pact_do
 *
 * Error/edge scenarios: 6 of 14 total (43%)
 */

import { describe, it, expect, afterEach } from "vitest";
import {
  createTestRepos,
  readRepoJSON,
  fileExists,
  gitPull,
  seedPendingRequest,
  type TestRepoContext,
} from "./helpers/setup-test-repos";
import { given, when, thenAssert } from "./helpers/gwt";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { createPactServer } from "../../src/server.ts";

// ---------------------------------------------------------------------------
// YAML frontmatter pact fixture (same as pact-discover tests)
// ---------------------------------------------------------------------------

const SANITY_CHECK_PACT_YAML = `---
name: sanity-check
version: "1.0.0"
description: "Get a colleague to validate your findings on a bug investigation."
when_to_use:
  - "When you need a colleague to validate your findings on a bug investigation"
context_bundle:
  required:
    - customer
    - product
    - issue_summary
    - involved_files
    - investigation_so_far
    - question
  fields:
    customer:
      type: string
      description: "Customer name"
    product:
      type: string
      description: "Product name and version"
    issue_summary:
      type: string
      description: "Brief description of the issue"
    involved_files:
      type: string
      description: "Files examined"
    investigation_so_far:
      type: string
      description: "What you have found"
    question:
      type: string
      description: "Specific question for the reviewer"
  additionalProperties: true
response_bundle:
  required:
    - answer
    - recommendation
  fields:
    answer:
      type: string
      description: "YES / NO / PARTIALLY with brief explanation"
    recommendation:
      type: string
      description: "Suggested next step"
  additionalProperties: true
---

# Sanity Check

Get a colleague to validate your findings on a bug investigation.
`;

/** Upgrade the default sanity-check pact to YAML frontmatter format. */
function upgradePactToYaml(repoPath: string): void {
  writeFileSync(
    join(repoPath, "pacts", "sanity-check", "PACT.md"),
    SANITY_CHECK_PACT_YAML,
  );
  execSync(
    `cd "${repoPath}" && git add -A && git commit -m "upgrade pact to YAML format" && git push`,
    { stdio: "pipe" },
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("pact_do: perform actions through collapsed tool surface", () => {
  let ctx: TestRepoContext;

  afterEach(() => {
    ctx?.cleanup();
  });

  // =========================================================================
  // Walking Skeleton
  // =========================================================================

  it("agent sends a request to a teammate and the recipient sees it in their inbox", async () => {
    ctx = createTestRepos();

    await given("the team has YAML pacts installed", () => {
      upgradePactToYaml(ctx.aliceRepo);
    });

    let requestId: string;

    await when("Alice sends a sanity-check request to Bob via pact_do", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      const result = (await server.callTool("pact_do", {
        action: "send",
        request_type: "sanity-check",
        recipient: "bob",
        context_bundle: {
          customer: "Acme Corp",
          product: "Platform v3.2",
          issue_summary: "Memory leak in auth refresh flow",
          involved_files: "src/auth/refresh.ts:L45-90",
          investigation_so_far: "Tokens held by closure, preventing GC",
          question: "Does this match the session service pattern?",
        },
      })) as { request_id: string; status: string; message: string };
      requestId = result.request_id;
      expect(result.status).toBe("pending");
      expect(result.message).toBe("Request submitted");
    });

    await thenAssert("the request file is created in pending with correct envelope", () => {
      const envelope = readRepoJSON(ctx.aliceRepo, `requests/pending/${requestId}.json`);
      expect(envelope).toMatchObject({
        request_id: requestId,
        request_type: "sanity-check",
        status: "pending",
        sender: { user_id: "alice", display_name: "Alice" },
        recipient: { user_id: "bob", display_name: "Bob" },
        context_bundle: {
          customer: "Acme Corp",
          question: "Does this match the session service pattern?",
        },
      });
    });

    await thenAssert("Bob sees Alice's request in his inbox via pact_do", async () => {
      const bobServer = createPactServer({ repoPath: ctx.bobRepo, userId: "bob" });
      const inbox = (await bobServer.callTool("pact_do", {
        action: "inbox",
      })) as { requests: Array<{ request_id: string; sender: string }> };
      expect(inbox.requests).toHaveLength(1);
      expect(inbox.requests[0].request_id).toBe(requestId);
      expect(inbox.requests[0].sender).toBe("Alice");
    });
  });

  // =========================================================================
  // Milestone 4: Action Dispatch -- Each action routes to the correct handler
  // =========================================================================

  it("dispatches send action and creates a pending request with correct ID format", async () => {
    ctx = createTestRepos();

    await given("the team has YAML pacts installed", () => {
      upgradePactToYaml(ctx.aliceRepo);
    });

    await when("Alice sends a request via pact_do with action 'send'", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      const result = (await server.callTool("pact_do", {
        action: "send",
        request_type: "sanity-check",
        recipient: "bob",
        context_bundle: { question: "ID format test" },
      })) as { request_id: string };

      // Same ID format as pact_request: req-{YYYYMMDD}-{HHmmss}-{user_id}-{random4hex}
      expect(result.request_id).toMatch(/^req-\d{8}-\d{6}-alice-[0-9a-f]{4}$/);
    });
  });

  it("dispatches inbox action and returns pending requests for the user", async () => {
    ctx = createTestRepos();

    await given("Alice has sent a request to Bob", async () => {
      seedPendingRequest(ctx.aliceRepo, "req-20260222-100000-alice-a1b2", "bob", "alice");
    });

    let inbox: any;

    await when("Bob checks his inbox via pact_do", async () => {
      const bobServer = createPactServer({ repoPath: ctx.bobRepo, userId: "bob" });
      inbox = await bobServer.callTool("pact_do", { action: "inbox" });
    });

    await thenAssert("the inbox contains Alice's request", () => {
      expect(inbox.requests).toHaveLength(1);
      expect(inbox.requests[0].request_id).toBe("req-20260222-100000-alice-a1b2");
    });
  });

  it("dispatches respond action and completes a request", async () => {
    ctx = createTestRepos();

    await given("Bob has a pending request from Alice", async () => {
      seedPendingRequest(ctx.aliceRepo, "req-20260222-100000-alice-a1b2", "bob", "alice");
      gitPull(ctx.bobRepo);
    });

    let result: any;

    await when("Bob responds via pact_do with action 'respond'", async () => {
      const bobServer = createPactServer({ repoPath: ctx.bobRepo, userId: "bob" });
      result = await bobServer.callTool("pact_do", {
        action: "respond",
        request_id: "req-20260222-100000-alice-a1b2",
        response_bundle: {
          answer: "YES, this matches the session service pattern",
          recommendation: "Apply the same fix from PR #312",
        },
      });
    });

    await thenAssert("the response confirms completion", () => {
      expect(result.status).toBe("completed");
      expect(result.request_id).toBe("req-20260222-100000-alice-a1b2");
    });

    await thenAssert("the request is moved to completed", () => {
      expect(fileExists(ctx.bobRepo, "requests/completed/req-20260222-100000-alice-a1b2.json")).toBe(true);
      expect(fileExists(ctx.bobRepo, "requests/pending/req-20260222-100000-alice-a1b2.json")).toBe(false);
    });
  });

  it("dispatches check_status action and returns request status", async () => {
    ctx = createTestRepos();

    await given("Alice has a pending request to Bob", async () => {
      seedPendingRequest(ctx.aliceRepo, "req-20260222-100000-alice-a1b2", "bob", "alice");
    });

    let result: any;

    await when("Alice checks status via pact_do", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_do", {
        action: "check_status",
        request_id: "req-20260222-100000-alice-a1b2",
      });
    });

    await thenAssert("the status shows the request is pending", () => {
      expect(result.status).toBe("pending");
      expect(result.request).toBeDefined();
      expect(result.request.request_id).toBe("req-20260222-100000-alice-a1b2");
    });
  });

  it("dispatches cancel action and moves request to cancelled", async () => {
    ctx = createTestRepos();

    await given("Alice has a pending request to Bob", async () => {
      seedPendingRequest(ctx.aliceRepo, "req-20260222-100000-alice-a1b2", "bob", "alice");
    });

    let result: any;

    await when("Alice cancels the request via pact_do", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_do", {
        action: "cancel",
        request_id: "req-20260222-100000-alice-a1b2",
        reason: "No longer needed",
      });
    });

    await thenAssert("the cancellation is confirmed", () => {
      expect(result.status).toBe("cancelled");
      expect(result.request_id).toBe("req-20260222-100000-alice-a1b2");
    });

    await thenAssert("the request is moved to cancelled directory", () => {
      expect(fileExists(ctx.aliceRepo, "requests/cancelled/req-20260222-100000-alice-a1b2.json")).toBe(true);
      expect(fileExists(ctx.aliceRepo, "requests/pending/req-20260222-100000-alice-a1b2.json")).toBe(false);
    });
  });

  it("dispatches amend action and adds amendment to request", async () => {
    ctx = createTestRepos();

    await given("Alice has a pending request to Bob", async () => {
      seedPendingRequest(ctx.aliceRepo, "req-20260222-100000-alice-a1b2", "bob", "alice");
    });

    let result: any;

    await when("Alice amends the request via pact_do", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_do", {
        action: "amend",
        request_id: "req-20260222-100000-alice-a1b2",
        fields: { urgency: "high" },
        note: "Escalated due to customer impact",
      });
    });

    await thenAssert("the amendment is confirmed with count", () => {
      expect(result.status).toBe("amended");
      expect(result.request_id).toBe("req-20260222-100000-alice-a1b2");
      expect(result.amendment_count).toBeGreaterThan(0);
    });

    await thenAssert("the envelope contains the amendment entry", () => {
      const envelope = readRepoJSON<{ amendments: Array<{ fields: Record<string, unknown> }> }>(
        ctx.aliceRepo,
        "requests/pending/req-20260222-100000-alice-a1b2.json",
      );
      expect(envelope.amendments).toHaveLength(1);
      expect(envelope.amendments[0].fields).toMatchObject({ urgency: "high" });
    });
  });

  it("dispatches view_thread action and returns thread history", async () => {
    ctx = createTestRepos();

    const threadId = "req-20260222-100000-alice-0001";

    await given("a thread exists with 2 requests", async () => {
      // First request in thread
      const envelope1 = {
        request_id: "req-20260222-100000-alice-0001",
        request_type: "sanity-check",
        sender: { user_id: "alice", display_name: "Alice" },
        recipient: { user_id: "bob", display_name: "Bob" },
        status: "pending",
        created_at: "2026-02-22T10:00:00.000Z",
        thread_id: threadId,
        context_bundle: { question: "Round 1" },
      };
      writeFileSync(
        join(ctx.aliceRepo, "requests", "pending", "req-20260222-100000-alice-0001.json"),
        JSON.stringify(envelope1, null, 2),
      );
      execSync(
        `cd "${ctx.aliceRepo}" && git add -A && git commit -m "seed thread req 1" && git push`,
        { stdio: "pipe" },
      );

      // Second request in thread
      const envelope2 = {
        request_id: "req-20260222-110000-alice-0002",
        request_type: "sanity-check",
        sender: { user_id: "alice", display_name: "Alice" },
        recipient: { user_id: "bob", display_name: "Bob" },
        status: "pending",
        created_at: "2026-02-22T11:00:00.000Z",
        thread_id: threadId,
        context_bundle: { question: "Round 2" },
      };
      writeFileSync(
        join(ctx.aliceRepo, "requests", "pending", "req-20260222-110000-alice-0002.json"),
        JSON.stringify(envelope2, null, 2),
      );
      execSync(
        `cd "${ctx.aliceRepo}" && git add -A && git commit -m "seed thread req 2" && git push`,
        { stdio: "pipe" },
      );
    });

    let result: any;

    await when("Alice views the thread via pact_do", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_do", {
        action: "view_thread",
        thread_id: threadId,
      });
    });

    await thenAssert("the thread contains both requests", () => {
      expect(result.thread_id).toBe(threadId);
      expect(result.entries).toHaveLength(2);
    });
  });

  // =========================================================================
  // Milestone 5: Error Handling
  // =========================================================================

  it("rejects unknown action with error listing valid actions", async () => {
    ctx = createTestRepos();

    await when("an agent calls pact_do with action 'deploy'", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      await expect(
        server.callTool("pact_do", { action: "deploy" }),
      ).rejects.toThrow(/unknown action.*deploy/i);
    });

    await thenAssert("the error message lists valid actions", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      try {
        await server.callTool("pact_do", { action: "deploy" });
      } catch (error: any) {
        expect(error.message).toMatch(/send/);
        expect(error.message).toMatch(/respond/);
        expect(error.message).toMatch(/cancel/);
        expect(error.message).toMatch(/inbox/);
      }
    });
  });

  it("rejects request with missing action field", async () => {
    ctx = createTestRepos();

    await when("an agent calls pact_do without an action field", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      await expect(
        server.callTool("pact_do", {
          request_type: "sanity-check",
          recipient: "bob",
        }),
      ).rejects.toThrow(/action/i);
    });
  });

  it("rejects request with empty action string", async () => {
    ctx = createTestRepos();

    await when("an agent calls pact_do with empty string action", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      await expect(
        server.callTool("pact_do", { action: "" }),
      ).rejects.toThrow(/action/i);
    });
  });

  it("passes through recipient validation error from send handler unchanged", async () => {
    ctx = createTestRepos();

    await given("the team has YAML pacts installed", () => {
      upgradePactToYaml(ctx.aliceRepo);
    });

    await when("Alice sends to unknown recipient 'charlie' via pact_do", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      await expect(
        server.callTool("pact_do", {
          action: "send",
          request_type: "sanity-check",
          recipient: "charlie",
          context_bundle: { question: "Recipient validation test" },
        }),
      ).rejects.toThrow(/charlie.*not found in team config/i);
    });
  });

  it("passes through missing required field error from handler unchanged", async () => {
    ctx = createTestRepos();

    await when("Alice sends via pact_do without a recipient", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      await expect(
        server.callTool("pact_do", {
          action: "send",
          request_type: "sanity-check",
          context_bundle: { question: "Missing field test" },
          // recipient omitted
        }),
      ).rejects.toThrow(/missing required field.*recipient/i);
    });
  });

  it("passes through pact validation error when request type has no matching pact", async () => {
    ctx = createTestRepos();

    await when("Alice sends a request with a non-existent pact type via pact_do", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      await expect(
        server.callTool("pact_do", {
          action: "send",
          request_type: "nonexistent-pact",
          recipient: "bob",
          context_bundle: { question: "Pact validation test" },
        }),
      ).rejects.toThrow(/no pact found.*nonexistent-pact/i);
    });
  });
});
