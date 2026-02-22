/**
 * Acceptance Tests -- garp_amend (Amend a Pending Request)
 *
 * Traces to: US-014
 *
 * Tests exercise the garp_amend driving port (tool handler) against
 * real local git repos. Scenarios verify:
 *   - Sender can amend a pending request (amendment appended)
 *   - Multiple amendments append without overwriting
 *   - Non-sender is blocked from amending
 *   - Completed request cannot be amended
 *   - Cancelled request cannot be amended
 *
 * Test Budget: 5 behaviors x 2 = 10 max (using 5)
 */

import { describe, it, expect, afterEach } from "vitest";
import {
  createTestRepos,
  seedPendingRequest,
  readRepoJSON,
  lastCommitMessage,
  gitPull,
  type TestRepoContext,
} from "./helpers/setup-test-repos";
import { given, when, thenAssert } from "./helpers/gwt";
import { execSync } from "node:child_process";
import { createGarpServer } from "../../src/server.ts";

describe("garp_amend: amend a pending request", () => {
  let ctx: TestRepoContext;

  afterEach(() => {
    ctx?.cleanup();
  });

  // =========================================================================
  // Happy Path
  // =========================================================================

  it("sender amends a pending request, appending an amendment entry", async () => {
    ctx = createTestRepos();
    const requestId = "req-20260221-143022-alice-a1b2";
    let result: any;

    await given("a pending request from Alice to Bob exists", async () => {
      seedPendingRequest(ctx.aliceRepo, requestId, "bob", "alice");
    });

    await when("Alice amends the request with updated fields", async () => {
      gitPull(ctx.aliceRepo);
      const aliceServer = createGarpServer({ repoPath: ctx.aliceRepo, userId: "alice" });

      result = await aliceServer.callTool("garp_do", { action: "amend",
        request_id: requestId,
        fields: { customer: "Acme Corp v2", priority: "high" },
        note: "Updated customer name",
      });
    });

    await thenAssert("result confirms amendment", async () => {
      expect(result.status).toBe("amended");
      expect(result.request_id).toBe(requestId);
      expect(result.amendment_count).toBe(1);
    });

    await thenAssert("envelope in pending/ has the amendment entry appended", async () => {
      const envelope = readRepoJSON<any>(ctx.aliceRepo, `requests/pending/${requestId}.json`);
      expect(envelope.amendments).toHaveLength(1);
      expect(envelope.amendments[0]).toMatchObject({
        amended_by: "alice",
        fields: { customer: "Acme Corp v2", priority: "high" },
        note: "Updated customer name",
      });
      expect(envelope.amendments[0].amended_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    await thenAssert("commit message matches expected format", async () => {
      const msg = lastCommitMessage(ctx.aliceRepo);
      expect(msg).toBe(`[garp] amended: ${requestId}`);
    });

    await thenAssert("changes reach the remote (Bob can pull them)", async () => {
      gitPull(ctx.bobRepo);
      const envelope = readRepoJSON<any>(ctx.bobRepo, `requests/pending/${requestId}.json`);
      expect(envelope.amendments).toHaveLength(1);
    });
  });

  // =========================================================================
  // Multiple Amendments
  // =========================================================================

  it("multiple amendments append without overwriting prior amendments", async () => {
    ctx = createTestRepos();
    const requestId = "req-20260221-143022-alice-a1b2";

    await given("a pending request from Alice to Bob exists", async () => {
      seedPendingRequest(ctx.aliceRepo, requestId, "bob", "alice");
    });

    await when("Alice amends the request twice", async () => {
      gitPull(ctx.aliceRepo);
      const aliceServer = createGarpServer({ repoPath: ctx.aliceRepo, userId: "alice" });

      await aliceServer.callTool("garp_do", { action: "amend",
        request_id: requestId,
        fields: { customer: "Acme Corp v2" },
      });

      const result = await aliceServer.callTool("garp_do", { action: "amend",
        request_id: requestId,
        fields: { priority: "critical" },
        note: "Escalated priority",
      });

      expect((result as any).amendment_count).toBe(2);
    });

    await thenAssert("both amendments are present in order", async () => {
      const envelope = readRepoJSON<any>(ctx.aliceRepo, `requests/pending/${requestId}.json`);
      expect(envelope.amendments).toHaveLength(2);
      expect(envelope.amendments[0].fields).toEqual({ customer: "Acme Corp v2" });
      expect(envelope.amendments[0].note).toBeUndefined();
      expect(envelope.amendments[1].fields).toEqual({ priority: "critical" });
      expect(envelope.amendments[1].note).toBe("Escalated priority");
    });
  });

  // =========================================================================
  // Error Paths
  // =========================================================================

  it("rejects amendment when caller is not the sender", async () => {
    ctx = createTestRepos();
    const requestId = "req-20260221-143022-alice-a1b2";

    await given("a pending request from Alice to Bob exists", async () => {
      seedPendingRequest(ctx.aliceRepo, requestId, "bob", "alice");
    });

    await when("Bob (the recipient, not sender) tries to amend", async () => {
      gitPull(ctx.bobRepo);
      const bobServer = createGarpServer({ repoPath: ctx.bobRepo, userId: "bob" });

      await expect(
        bobServer.callTool("garp_do", { action: "amend",
          request_id: requestId,
          fields: { customer: "Changed by Bob" },
        }),
      ).rejects.toThrow(/only the sender/i);
    });
  });

  it("rejects amendment when request is already completed", async () => {
    ctx = createTestRepos();
    const requestId = "req-20260221-143022-alice-a1b2";

    await given("a completed request exists", async () => {
      seedPendingRequest(ctx.aliceRepo, requestId, "bob", "alice");
      execSync(
        `cd "${ctx.aliceRepo}" && git mv requests/pending/${requestId}.json requests/completed/ && git commit -m "complete it" && git push`,
        { stdio: "pipe" },
      );
    });

    await when("Alice tries to amend the completed request", async () => {
      gitPull(ctx.aliceRepo);
      const aliceServer = createGarpServer({ repoPath: ctx.aliceRepo, userId: "alice" });

      await expect(
        aliceServer.callTool("garp_do", { action: "amend",
          request_id: requestId,
          fields: { customer: "Too late" },
        }),
      ).rejects.toThrow(/already completed/i);
    });
  });

  it("rejects amendment when request is already cancelled", async () => {
    ctx = createTestRepos();
    const requestId = "req-20260221-143022-alice-a1b2";

    await given("a cancelled request exists", async () => {
      seedPendingRequest(ctx.aliceRepo, requestId, "bob", "alice");
      execSync(
        `cd "${ctx.aliceRepo}" && git mv requests/pending/${requestId}.json requests/cancelled/ && git commit -m "cancel it" && git push`,
        { stdio: "pipe" },
      );
    });

    await when("Alice tries to amend the cancelled request", async () => {
      gitPull(ctx.aliceRepo);
      const aliceServer = createGarpServer({ repoPath: ctx.aliceRepo, userId: "alice" });

      await expect(
        aliceServer.callTool("garp_do", { action: "amend",
          request_id: requestId,
          fields: { customer: "Too late" },
        }),
      ).rejects.toThrow(/already cancelled/i);
    });
  });
});
