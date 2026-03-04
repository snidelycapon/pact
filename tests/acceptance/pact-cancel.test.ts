/**
 * Acceptance Tests -- pact_cancel (Cancel a Pending Request)
 *
 * Traces to: US-013
 *
 * Tests exercise the pact_cancel driving port (tool handler) against
 * real local git repos. Scenarios verify:
 *   - Sender cancels pending request (moves to cancelled/, status updated)
 *   - Cancel reason is persisted in envelope
 *
 * Edge scenarios: 0 of 2 total (0%)
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
import { createPactServer } from "../../src/server.ts";

describe("pact_cancel: cancel a pending request", () => {
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
      const aliceServer = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });

      const result = await aliceServer.callTool("pact_do", { action: "cancel",
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

    await thenAssert("commit message matches [pact] cancelled: {request_id}", async () => {
      const msg = lastCommitMessage(ctx.aliceRepo);
      expect(msg).toBe(`[pact] cancelled: ${requestId}`);
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
      const aliceServer = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });

      await aliceServer.callTool("pact_do", { action: "cancel",
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

});
