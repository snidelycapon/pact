/**
 * Acceptance Tests -- garp_cancel (Cancel a Pending Request)
 *
 * Traces to: US-013
 *
 * Tests exercise the garp_cancel driving port (tool handler) against
 * real local git repos. Scenarios verify:
 *   - Sender cancels pending request (moves to cancelled/, status updated)
 *   - Non-sender is blocked from cancelling
 *   - Already completed request returns error
 *   - Already cancelled request returns error
 *   - Cancel reason is persisted in envelope
 *
 * Error/edge scenarios: 3 of 5 total (60%)
 */

import { describe, it, expect, afterEach } from "vitest";
import {
  createTestRepos,
  seedPendingRequest,
  listDir,
  readRepoJSON,
  lastCommitMessage,
  gitPull,
  type TestRepoContext,
} from "./helpers/setup-test-repos";
import { given, when, thenAssert } from "./helpers/gwt";
import { execSync } from "node:child_process";
import { createGarpServer } from "../../src/server.ts";

describe("garp_cancel: cancel a pending request", () => {
  let ctx: TestRepoContext;

  afterEach(() => {
    ctx?.cleanup();
  });

  // =========================================================================
  // Happy Path
  // =========================================================================

  it("sender cancels a pending request, moving it to cancelled/ with status cancelled", async () => {
    ctx = createTestRepos();
    const requestId = "req-20260221-143022-alice-a1b2";

    await given("a pending request from Alice addressed to Bob exists", async () => {
      seedPendingRequest(ctx.aliceRepo, requestId, "bob", "alice");
    });

    await when("Alice cancels the request", async () => {
      gitPull(ctx.aliceRepo);
      const aliceServer = createGarpServer({ repoPath: ctx.aliceRepo, userId: "alice" });

      const result = await aliceServer.callTool("garp_do", { action: "cancel",
        request_id: requestId,
      });

      expect((result as any).status).toBe("cancelled");
    });

    await thenAssert("request moves from pending to cancelled with status field updated", async () => {
      const pending = listDir(ctx.aliceRepo, "requests/pending");
      expect(pending).toHaveLength(0);

      const cancelled = listDir(ctx.aliceRepo, "requests/cancelled");
      expect(cancelled).toHaveLength(1);
      expect(cancelled[0]).toBe(`${requestId}.json`);

      const envelope = readRepoJSON<any>(ctx.aliceRepo, `requests/cancelled/${requestId}.json`);
      expect(envelope.status).toBe("cancelled");
    });

    await thenAssert("commit message matches [garp] cancelled: {request_id}", async () => {
      const msg = lastCommitMessage(ctx.aliceRepo);
      expect(msg).toBe(`[garp] cancelled: ${requestId}`);
    });

    await thenAssert("changes reach the remote (Bob can pull them)", async () => {
      gitPull(ctx.bobRepo);
      expect(listDir(ctx.bobRepo, "requests/pending")).toHaveLength(0);
      expect(listDir(ctx.bobRepo, "requests/cancelled")).toHaveLength(1);
    });
  });

  // =========================================================================
  // Cancel with reason
  // =========================================================================

  it("persists cancel_reason in the envelope when reason is provided", async () => {
    ctx = createTestRepos();
    const requestId = "req-20260221-143022-alice-a1b2";

    await given("a pending request from Alice exists", async () => {
      seedPendingRequest(ctx.aliceRepo, requestId, "bob", "alice");
    });

    await when("Alice cancels with a reason", async () => {
      gitPull(ctx.aliceRepo);
      const aliceServer = createGarpServer({ repoPath: ctx.aliceRepo, userId: "alice" });

      await aliceServer.callTool("garp_do", { action: "cancel",
        request_id: requestId,
        reason: "Found the answer myself",
      });
    });

    await thenAssert("the cancelled envelope has cancel_reason field", async () => {
      const envelope = readRepoJSON<any>(ctx.aliceRepo, `requests/cancelled/${requestId}.json`);
      expect(envelope.status).toBe("cancelled");
      expect(envelope.cancel_reason).toBe("Found the answer myself");
    });
  });

  // =========================================================================
  // Error Paths
  // =========================================================================

  it("rejects cancellation when the caller is not the sender", async () => {
    ctx = createTestRepos();
    const requestId = "req-20260221-143022-alice-a1b2";

    await given("a pending request from Alice addressed to Bob exists", async () => {
      seedPendingRequest(ctx.aliceRepo, requestId, "bob", "alice");
    });

    await when("Bob (the recipient, not the sender) tries to cancel", async () => {
      gitPull(ctx.bobRepo);
      const bobServer = createGarpServer({ repoPath: ctx.bobRepo, userId: "bob" });

      await expect(
        bobServer.callTool("garp_do", { action: "cancel",
          request_id: requestId,
        }),
      ).rejects.toThrow(/only the sender can cancel/i);
    });

    await thenAssert("request stays in pending", async () => {
      const pending = listDir(ctx.bobRepo, "requests/pending");
      expect(pending).toContain(`${requestId}.json`);
    });
  });

  it("rejects cancellation when the request is already completed", async () => {
    ctx = createTestRepos();
    const requestId = "req-20260221-143022-alice-a1b2";

    await given("a request has already been completed", async () => {
      seedPendingRequest(ctx.aliceRepo, requestId, "bob", "alice");
      execSync(
        `cd "${ctx.aliceRepo}" && git mv requests/pending/${requestId}.json requests/completed/ && git commit -m "already done" && git push`,
        { stdio: "pipe" },
      );
    });

    await when("Alice tries to cancel the completed request", async () => {
      gitPull(ctx.aliceRepo);
      const aliceServer = createGarpServer({ repoPath: ctx.aliceRepo, userId: "alice" });

      await expect(
        aliceServer.callTool("garp_do", { action: "cancel",
          request_id: requestId,
        }),
      ).rejects.toThrow(/already completed/i);
    });
  });

  it("rejects cancellation when the request is already cancelled", async () => {
    ctx = createTestRepos();
    const requestId = "req-20260221-143022-alice-a1b2";

    await given("a request has already been cancelled", async () => {
      seedPendingRequest(ctx.aliceRepo, requestId, "bob", "alice");
      execSync(
        `cd "${ctx.aliceRepo}" && git mv requests/pending/${requestId}.json requests/cancelled/ && git commit -m "already cancelled" && git push`,
        { stdio: "pipe" },
      );
    });

    await when("Alice tries to cancel it again", async () => {
      gitPull(ctx.aliceRepo);
      const aliceServer = createGarpServer({ repoPath: ctx.aliceRepo, userId: "alice" });

      await expect(
        aliceServer.callTool("garp_do", { action: "cancel",
          request_id: requestId,
        }),
      ).rejects.toThrow(/already cancelled/i);
    });
  });
});
