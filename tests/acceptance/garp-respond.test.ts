/**
 * Acceptance Tests -- garp_respond (Submit a Response)
 *
 * Traces to: US-004
 *
 * Tests exercise the garp_respond driving port (tool handler) against
 * real local git repos. Scenarios verify:
 *   - Successful response with file creation + request move
 *   - Response envelope structure (responder, timestamp, bundle)
 *   - Atomic commit (response write + request move in one commit)
 *   - Rejection when request is already completed
 *   - Rejection when responder is not the designated recipient
 *   - Rejection when request does not exist
 *   - Git push with rebase retry
 *   - Preserves thread_id and attachments during lifecycle move (US-002a)
 *
 * Error/edge scenarios: 5 of 11 total (45%)
 */

import { describe, it, expect, afterEach } from "vitest";
import {
  createTestRepos,
  listDir,
  readRepoJSON,
  fileExists,
  lastCommitMessage,
  gitPull,
  type TestRepoContext,
} from "./helpers/setup-test-repos";
import { given, when, thenAssert } from "./helpers/gwt";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { createGarpServer } from "../../src/server.ts";

/** Seed a pending request directly (same pattern as garp-inbox tests). */
function seedPendingRequest(
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

describe("garp_respond: submit a response to a request", () => {
  let ctx: TestRepoContext;

  afterEach(() => {
    ctx?.cleanup();
  });

  // =========================================================================
  // Happy Path
  // =========================================================================

  it("writes response, moves request to completed, commits and pushes", async () => {
    ctx = createTestRepos();
    const requestId = "req-20260221-143022-alice-a1b2";
    let result: any;

    await given("a pending request from Alice exists, addressed to Bob", async () => {
      seedPendingRequest(ctx.aliceRepo, requestId, "bob", "alice");
    });

    await when("Bob responds with investigation findings", async () => {
      gitPull(ctx.bobRepo);
      const bobServer = createGarpServer({ repoPath: ctx.bobRepo, userId: "bob" });

      result = await bobServer.callTool("garp_respond", {
        request_id: requestId,
        response_bundle: {
          answer: "YES - same pattern as ZD-4102",
          evidence: "Compared refresh.ts with cleanup.ts",
          concerns: "Token-cache module may have same issue",
          recommendation: "Apply finally-block cleanup",
        },
      });

      expect((result as any).status).toBe("completed");
    });

    await thenAssert("request moves from pending to completed", async () => {
      const pending = listDir(ctx.bobRepo, "requests/pending");
      expect(pending).toHaveLength(0);

      const completed = listDir(ctx.bobRepo, "requests/completed");
      expect(completed).toHaveLength(1);
      expect(completed[0]).toBe(`${requestId}.json`);
    });

    await thenAssert("response file is created with correct envelope", async () => {
      expect(fileExists(ctx.bobRepo, `responses/${requestId}.json`)).toBe(true);

      const response = readRepoJSON<any>(ctx.bobRepo, `responses/${requestId}.json`);
      expect(response).toMatchObject({
        request_id: requestId,
        responder: { user_id: "bob", display_name: "Bob" },
        response_bundle: {
          answer: "YES - same pattern as ZD-4102",
          recommendation: "Apply finally-block cleanup",
        },
      });
      expect(response.responded_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    await thenAssert("changes reach the remote (Alice can pull them)", async () => {
      gitPull(ctx.aliceRepo);

      expect(listDir(ctx.aliceRepo, "requests/pending")).toHaveLength(0);
      expect(listDir(ctx.aliceRepo, "requests/completed")).toHaveLength(1);
      expect(fileExists(ctx.aliceRepo, `responses/${requestId}.json`)).toBe(true);
    });
  });

  it("response write and request move happen in a single atomic commit", async () => {
    ctx = createTestRepos();
    const requestId = "req-20260221-143022-alice-a1b2";

    await given("a pending request from Alice exists", async () => {
      seedPendingRequest(ctx.aliceRepo, requestId, "bob", "alice");
    });

    await when("Bob responds", async () => {
      gitPull(ctx.bobRepo);
      const bobServer = createGarpServer({ repoPath: ctx.bobRepo, userId: "bob" });
      await bobServer.callTool("garp_respond", {
        request_id: requestId,
        response_bundle: { answer: "Confirmed" },
      });
    });

    await thenAssert("both changes appear in a single commit", async () => {
      const msg = lastCommitMessage(ctx.bobRepo);
      expect(msg).toMatch(/\[garp\] response:.*sanity-check.*bob -> alice/);

      // Verify single commit: diff of last commit should show both the move and the new file
      const diffStat = execSync(
        `cd "${ctx.bobRepo}" && git diff --name-status HEAD~1 HEAD`,
        { encoding: "utf-8" },
      );
      // Should contain: R (rename/move) for request, A (add) for response
      expect(diffStat).toContain("responses/");
      expect(diffStat).toContain("requests/completed/");
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
      const bobServer = createGarpServer({ repoPath: ctx.bobRepo, userId: "bob" });
      await bobServer.callTool("garp_respond", {
        request_id: requestId,
        response_bundle: { answer: "Yes" },
      });
    });

    await thenAssert("commit message is formatted as [garp] response: {id} ({type}) {responder} -> {sender}", async () => {
      const msg = lastCommitMessage(ctx.bobRepo);
      expect(msg).toBe(
        `[garp] response: ${requestId} (sanity-check) bob -> alice`,
      );
    });
  });

  it("responder identity is set from GARP_USER, not tool input", async () => {
    ctx = createTestRepos();
    const requestId = "req-20260221-143022-alice-a1b2";

    await given("a pending request exists for Bob", async () => {
      seedPendingRequest(ctx.aliceRepo, requestId, "bob", "alice");
    });

    await when("Bob responds (responder resolved from GARP_USER)", async () => {
      gitPull(ctx.bobRepo);
      const bobServer = createGarpServer({ repoPath: ctx.bobRepo, userId: "bob" });
      await bobServer.callTool("garp_respond", {
        request_id: requestId,
        response_bundle: { answer: "Checked" },
      });
    });

    await thenAssert("response has Bob's identity from config, not tool input", async () => {
      const response = readRepoJSON<any>(ctx.bobRepo, `responses/${requestId}.json`);
      expect(response.responder.user_id).toBe("bob");
      expect(response.responder.display_name).toBe("Bob");
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
      const bobServer = createGarpServer({ repoPath: ctx.bobRepo, userId: "bob" });
      await bobServer.callTool("garp_respond", {
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

  it("preserves thread_id and attachments in request envelope after respond moves it to completed", async () => {
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
      const bobServer = createGarpServer({ repoPath: ctx.bobRepo, userId: "bob" });
      await bobServer.callTool("garp_respond", {
        request_id: requestId,
        response_bundle: { answer: "Confirmed" },
      });
    });

    await thenAssert("the completed request envelope still has thread_id and attachments", async () => {
      const completed = readRepoJSON<any>(ctx.bobRepo, `requests/completed/${requestId}.json`);
      expect(completed.thread_id).toBe(threadId);
      expect(completed.attachments).toHaveLength(1);
      expect(completed.attachments[0].filename).toBe("crash.log");
    });
  });

  // =========================================================================
  // Error Paths
  // =========================================================================

  it("rejects response when request is already completed", async () => {
    ctx = createTestRepos();
    const requestId = "req-20260221-143022-alice-a1b2";

    await given("a request has already been responded to and is in completed", async () => {
      seedPendingRequest(ctx.aliceRepo, requestId, "bob", "alice");
      // Move to completed manually
      execSync(
        `cd "${ctx.aliceRepo}" && git mv requests/pending/${requestId}.json requests/completed/ && git commit -m "already done" && git push`,
        { stdio: "pipe" },
      );
      // Write a response file too
      writeFileSync(
        join(ctx.aliceRepo, "responses", `${requestId}.json`),
        JSON.stringify({ request_id: requestId, response_bundle: { answer: "done" } }),
      );
      execSync(`cd "${ctx.aliceRepo}" && git add -A && git commit -m "response" && git push`, {
        stdio: "pipe",
      });
    });

    await when("Bob tries to respond again", async () => {
      gitPull(ctx.bobRepo);
      const bobServer = createGarpServer({ repoPath: ctx.bobRepo, userId: "bob" });

      await expect(
        bobServer.callTool("garp_respond", {
          request_id: requestId,
          response_bundle: { answer: "duplicate" },
        }),
      ).rejects.toThrow(/already completed/i);
    });

    await thenAssert("no new response file is written", async () => {
      // The existing response should be unchanged
      const response = readRepoJSON<any>(ctx.bobRepo, `responses/${requestId}.json`);
      expect(response.response_bundle.answer).toBe("done");
    });
  });

  it("rejects response when current user is not the designated recipient", async () => {
    ctx = createTestRepos();
    const requestId = "req-20260221-143022-bob-c3d4";

    await given("a request from Bob is addressed to Alice (not Bob)", async () => {
      seedPendingRequest(ctx.bobRepo, requestId, "alice", "bob");
      gitPull(ctx.aliceRepo);
    });

    await when("Bob tries to respond to his own request (he is the sender, not recipient)", async () => {
      const bobServer = createGarpServer({ repoPath: ctx.bobRepo, userId: "bob" });

      await expect(
        bobServer.callTool("garp_respond", {
          request_id: requestId,
          response_bundle: { answer: "I'll answer my own question" },
        }),
      ).rejects.toThrow(/not the recipient/i);
    });

    await thenAssert("no response is written and request stays in pending", async () => {
      const pending = listDir(ctx.bobRepo, "requests/pending");
      expect(pending).toContain(`${requestId}.json`);
      expect(fileExists(ctx.bobRepo, `responses/${requestId}.json`)).toBe(false);
    });
  });

  it("rejects response when request ID does not exist", async () => {
    ctx = createTestRepos();

    await when("Bob tries to respond to a non-existent request", async () => {
      const bobServer = createGarpServer({ repoPath: ctx.bobRepo, userId: "bob" });

      await expect(
        bobServer.callTool("garp_respond", {
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
      const bobServer = createGarpServer({ repoPath: ctx.bobRepo, userId: "bob" });

      await expect(
        bobServer.callTool("garp_respond", {
          request_id: requestId,
          // response_bundle omitted
        }),
      ).rejects.toThrow(/missing required field.*response_bundle/i);
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
      const bobServer = createGarpServer({ repoPath: ctx.bobRepo, userId: "bob" });
      const result = await bobServer.callTool("garp_respond", {
        request_id: requestId,
        response_bundle: { answer: "Rebase retry test" },
      });

      expect((result as any).status).toBe("completed");
    });

    await thenAssert("the response reaches the remote", async () => {
      gitPull(ctx.aliceRepo);
      expect(fileExists(ctx.aliceRepo, `responses/${requestId}.json`)).toBe(true);
    });
  });
});
