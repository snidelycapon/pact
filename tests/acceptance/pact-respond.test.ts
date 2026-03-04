/**
 * Acceptance Tests -- pact_respond (Submit a Response)
 *
 * Traces to: US-004
 *
 * Tests exercise the pact_respond driving port (tool handler) against
 * real local git repos. Apathy principle: respond ONLY writes a response
 * file — it does not move requests or enforce recipient authorization.
 *
 * Scenarios verify:
 *   - Successful response file creation (request stays in pending)
 *   - Response envelope structure (responder, timestamp, bundle)
 *   - Atomic commit (response write in one commit)
 *   - Rejection when request does not exist
 *   - Git push with rebase retry
 *   - Preserves thread_id and attachments on request envelope (US-002a)
 *
 * Error/edge scenarios: 2 of 8 total (25%)
 */

import { describe, it, expect, afterEach } from "vitest";
import {
  createTestRepos,
  seedPendingRequest,
  listDir,
  readRepoJSON,
  fileExists,
  lastCommitMessage,
  gitPull,
  type TestRepoContext,
} from "./helpers/setup-test-repos";
import { given, when, thenAssert } from "./helpers/gwt";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { createPactServer } from "../../src/server.ts";

describe("pact_respond: submit a response to a request", () => {
  let ctx: TestRepoContext;

  afterEach(() => {
    ctx?.cleanup();
  });

  // =========================================================================
  // Happy Path
  // =========================================================================

  it("writes response file, commits and pushes", async () => {
    ctx = createTestRepos();
    const requestId = "req-20260221-143022-alice-a1b2";
    let result: any;

    await given("a pending request from Alice exists, addressed to Bob", async () => {
      seedPendingRequest(ctx.aliceRepo, requestId, "bob", "alice");
    });

    await when("Bob responds with investigation findings", async () => {
      gitPull(ctx.bobRepo);
      const bobServer = createPactServer({ repoPath: ctx.bobRepo, userId: "bob" });

      result = await bobServer.callTool("pact_do", { action: "respond",
        request_id: requestId,
        response_bundle: {
          answer: "YES - same pattern as ZD-4102",
          evidence: "Compared refresh.ts with cleanup.ts",
          concerns: "Token-cache module may have same issue",
          recommendation: "Apply finally-block cleanup",
        },
      });

      expect((result as any).status).toBe("pending");
    });

    await thenAssert("request stays in pending (respond does not move requests)", async () => {
      const pending = listDir(ctx.bobRepo, "requests/pending");
      expect(pending).toHaveLength(1);
      expect(pending[0]).toBe(`${requestId}.json`);
    });

    await thenAssert("response file is created with correct envelope", async () => {
      expect(fileExists(ctx.bobRepo, `responses/${requestId}.json`)).toBe(true);

      const response = readRepoJSON<any>(ctx.bobRepo, `responses/${requestId}.json`);
      expect(response).toMatchObject({
        request_id: requestId,
        responder: { user_id: "bob", display_name: "bob" },
        response_bundle: {
          answer: "YES - same pattern as ZD-4102",
          recommendation: "Apply finally-block cleanup",
        },
      });
      expect(response.responded_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    await thenAssert("changes reach the remote (Alice can pull them)", async () => {
      gitPull(ctx.aliceRepo);

      expect(listDir(ctx.aliceRepo, "requests/pending")).toHaveLength(1);
      expect(fileExists(ctx.aliceRepo, `responses/${requestId}.json`)).toBe(true);
    });
  });

  it("response write happens in a single atomic commit", async () => {
    ctx = createTestRepos();
    const requestId = "req-20260221-143022-alice-a1b2";

    await given("a pending request from Alice exists", async () => {
      seedPendingRequest(ctx.aliceRepo, requestId, "bob", "alice");
    });

    await when("Bob responds", async () => {
      gitPull(ctx.bobRepo);
      const bobServer = createPactServer({ repoPath: ctx.bobRepo, userId: "bob" });
      await bobServer.callTool("pact_do", { action: "respond",
        request_id: requestId,
        response_bundle: { answer: "Confirmed" },
      });
    });

    await thenAssert("response file appears in the commit", async () => {
      const msg = lastCommitMessage(ctx.bobRepo);
      expect(msg).toMatch(/\[pact\] response:.*sanity-check.*bob -> alice/);

      const diffStat = execSync(
        `cd "${ctx.bobRepo}" && git diff --name-status HEAD~1 HEAD`,
        { encoding: "utf-8" },
      );
      expect(diffStat).toContain("responses/");
    });
  });

  it("commit message follows structured format", async () => {
    ctx = createTestRepos();
    const requestId = "req-20260221-143022-alice-a1b2";

    await given("a pending request exists", async () => {
      seedPendingRequest(ctx.aliceRepo, requestId, "bob", "alice");
    });

    await when("Bob responds", async () => {
      gitPull(ctx.bobRepo);
      const bobServer = createPactServer({ repoPath: ctx.bobRepo, userId: "bob" });
      await bobServer.callTool("pact_do", { action: "respond",
        request_id: requestId,
        response_bundle: { answer: "Yes" },
      });
    });

    await thenAssert("commit message is formatted as [pact] response: {id} ({type}) {responder} -> {sender}", async () => {
      const msg = lastCommitMessage(ctx.bobRepo);
      expect(msg).toBe(
        `[pact] response: ${requestId} (sanity-check) bob -> alice`,
      );
    });
  });

  it("responder identity is set from PACT_USER, not tool input", async () => {
    ctx = createTestRepos();
    const requestId = "req-20260221-143022-alice-a1b2";

    await given("a pending request exists for Bob", async () => {
      seedPendingRequest(ctx.aliceRepo, requestId, "bob", "alice");
    });

    await when("Bob responds (responder resolved from PACT_USER)", async () => {
      gitPull(ctx.bobRepo);
      const bobServer = createPactServer({ repoPath: ctx.bobRepo, userId: "bob" });
      await bobServer.callTool("pact_do", { action: "respond",
        request_id: requestId,
        response_bundle: { answer: "Checked" },
      });
    });

    await thenAssert("response has Bob's identity from config, not tool input", async () => {
      const response = readRepoJSON<any>(ctx.bobRepo, `responses/${requestId}.json`);
      expect(response.responder.user_id).toBe("bob");
      expect(response.responder.display_name).toBe("bob");
    });
  });

  it("accepts any response_bundle shape without validation", async () => {
    ctx = createTestRepos();
    const requestId = "req-20260221-143022-alice-a1b2";

    await given("a pending request exists", async () => {
      seedPendingRequest(ctx.aliceRepo, requestId, "bob", "alice");
    });

    await when("Bob responds with a non-standard response bundle", async () => {
      gitPull(ctx.bobRepo);
      const bobServer = createPactServer({ repoPath: ctx.bobRepo, userId: "bob" });
      await bobServer.callTool("pact_do", { action: "respond",
        request_id: requestId,
        response_bundle: {
          custom_verdict: "all clear",
          metrics: { confidence: 0.95 },
          tags: ["verified", "no-action"],
        },
      });
    });

    await thenAssert("response file contains the custom bundle as-is", async () => {
      const response = readRepoJSON<any>(ctx.bobRepo, `responses/${requestId}.json`);
      expect(response.response_bundle.custom_verdict).toBe("all clear");
      expect(response.response_bundle.metrics.confidence).toBe(0.95);
    });
  });

  // =========================================================================
  // Protocol Extensions: thread_id and attachments survive lifecycle (US-002a)
  // =========================================================================

  it("preserves thread_id and attachments in request envelope after respond", async () => {
    ctx = createTestRepos();
    const requestId = "req-20260221-143022-alice-a1b2";
    const threadId = "req-20260221-100000-alice-0001";

    await given("a pending request with thread_id and attachments exists", async () => {
      const envelope = {
        request_id: requestId,
        thread_id: threadId,
        request_type: "sanity-check",
        sender: { user_id: "alice", display_name: "Alice" },
        recipient: { user_id: "bob", display_name: "Bob" },
        status: "pending",
        created_at: "2026-02-21T14:30:22.000Z",
        context_bundle: { question: "Thread + attachment test" },
        attachments: [
          { filename: "crash.log", description: "Application error log" },
        ],
      };
      writeFileSync(
        join(ctx.aliceRepo, "requests", "pending", `${requestId}.json`),
        JSON.stringify(envelope, null, 2),
      );
      execSync(`cd "${ctx.aliceRepo}" && git add -A && git commit -m "seed ${requestId}" && git push`, {
        stdio: "pipe",
      });
    });

    await when("Bob responds to the request", async () => {
      gitPull(ctx.bobRepo);
      const bobServer = createPactServer({ repoPath: ctx.bobRepo, userId: "bob" });
      await bobServer.callTool("pact_do", { action: "respond",
        request_id: requestId,
        response_bundle: { answer: "Confirmed" },
      });
    });

    await thenAssert("the pending request envelope still has thread_id and attachments", async () => {
      const pending = readRepoJSON<any>(ctx.bobRepo, `requests/pending/${requestId}.json`);
      expect(pending.thread_id).toBe(threadId);
      expect(pending.attachments).toHaveLength(1);
      expect(pending.attachments[0].filename).toBe("crash.log");
    });
  });

  // =========================================================================
  // Error Paths
  // =========================================================================

  it("rejects response when request ID does not exist", async () => {
    ctx = createTestRepos();

    await when("Bob tries to respond to a non-existent request", async () => {
      const bobServer = createPactServer({ repoPath: ctx.bobRepo, userId: "bob" });

      await expect(
        bobServer.callTool("pact_do", { action: "respond",
          request_id: "req-nonexistent-0000",
          response_bundle: { answer: "Ghost response" },
        }),
      ).rejects.toThrow(/not found/i);
    });
  });

  it("rejects response missing required field: response_bundle", async () => {
    ctx = createTestRepos();
    const requestId = "req-20260221-143022-alice-a1b2";

    await given("a pending request exists", async () => {
      seedPendingRequest(ctx.aliceRepo, requestId, "bob", "alice");
    });

    await when("Bob submits a response without a response_bundle", async () => {
      gitPull(ctx.bobRepo);
      const bobServer = createPactServer({ repoPath: ctx.bobRepo, userId: "bob" });

      await expect(
        bobServer.callTool("pact_do", { action: "respond",
          request_id: requestId,
          // response_bundle omitted
        }),
      ).rejects.toThrow(/missing required field.*response_bundle/i);
    });
  });

  // =========================================================================
  // Subscription-Based Respond
  // =========================================================================

  it("allows a subscriber to respond to a request addressed to a subscribed list", async () => {
    ctx = createTestRepos();
    const requestId = "req-20260225-140000-alice-sub1";

    await given("Alice sends a request addressed to '+backend-team'", async () => {
      seedPendingRequest(ctx.aliceRepo, requestId, "+backend-team", "alice");
    });

    await when("Bob (subscribed to +backend-team) responds", async () => {
      gitPull(ctx.bobRepo);
      mkdirSync(join(ctx.bobRepo, "members"), { recursive: true });
      writeFileSync(join(ctx.bobRepo, "members/bob.json"), JSON.stringify({ subscriptions: ["+backend-team"] }));
      const bobServer = createPactServer({
        repoPath: ctx.bobRepo,
        userId: "bob",
      });

      const result = await bobServer.callTool("pact_do", { action: "respond",
        request_id: requestId,
        response_bundle: { answer: "Handled by subscriber" },
      });

      expect((result as any).status).toBe("pending");
    });

    await thenAssert("response is written with Bob's identity", async () => {
      const response = readRepoJSON<any>(ctx.bobRepo, `responses/${requestId}.json`);
      expect(response.responder.user_id).toBe("bob");
      expect(response.response_bundle.answer).toBe("Handled by subscriber");
    });

    await thenAssert("request stays in pending", async () => {
      expect(listDir(ctx.bobRepo, "requests/pending")).toHaveLength(1);
    });
  });

  it("retries push after rebase when remote has new commits", async () => {
    ctx = createTestRepos();
    const requestId = "req-20260221-143022-alice-a1b2";

    await given("a pending request exists and Alice pushes while Bob is responding", async () => {
      seedPendingRequest(ctx.aliceRepo, requestId, "bob", "alice");
      gitPull(ctx.bobRepo);

      // Alice pushes an unrelated change
      execSync(
        `cd "${ctx.aliceRepo}" && echo "note" > notes.txt && git add notes.txt && git commit -m "unrelated" && git push`,
        { stdio: "pipe" },
      );
    });

    await when("Bob responds (his local is behind the remote)", async () => {
      const bobServer = createPactServer({ repoPath: ctx.bobRepo, userId: "bob" });
      const result = await bobServer.callTool("pact_do", { action: "respond",
        request_id: requestId,
        response_bundle: { answer: "Rebase retry test" },
      });

      expect((result as any).status).toBe("pending");
    });

    await thenAssert("the response reaches the remote", async () => {
      gitPull(ctx.aliceRepo);
      expect(fileExists(ctx.aliceRepo, `responses/${requestId}.json`)).toBe(true);
    });
  });
});
