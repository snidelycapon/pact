/**
 * Acceptance Tests -- garp_status (Check Request Status)
 *
 * Traces to: US-005, US-012
 *
 * Tests exercise the garp_status driving port (tool handler) against
 * real local git repos. Scenarios verify:
 *   - Returns "completed" with full response for finished requests
 *   - Returns "pending" with no response for waiting requests
 *   - Searches across all lifecycle directories
 *   - Returns clear error for non-existent request ID
 *   - Falls back to local state when git pull fails
 *   - Is a read-only operation (no commits)
 *   - Returns thread_id and attachments in request data (US-002a/003a)
 *   - Returns resolved attachment_paths when request has attachments (US-012)
 *
 * Error/edge scenarios: 4 of 11 total (36%)
 */

import { describe, it, expect, afterEach } from "vitest";
import {
  createTestRepos,
  seedPendingRequest,
  listDir,
  readRepoJSON,
  fileExists,
  gitPull,
  type TestRepoContext,
} from "./helpers/setup-test-repos";
import { given, when, thenAssert } from "./helpers/gwt";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

import { createGarpServer } from "../../src/server.ts";

/** Seed a completed request + response. */
function seedCompletedRequest(
  repoPath: string,
  requestId: string,
  recipient: string,
  sender: string,
  responseBundle: Record<string, unknown>,
): void {
  // Write request to completed (not pending)
  const envelope = {
    request_id: requestId,
    request_type: "sanity-check",
    sender: { user_id: sender, display_name: sender.charAt(0).toUpperCase() + sender.slice(1) },
    recipient: { user_id: recipient, display_name: recipient.charAt(0).toUpperCase() + recipient.slice(1) },
    status: "pending",
    created_at: "2026-02-21T14:30:22.000Z",
    context_bundle: { question: "Test question" },
  };
  writeFileSync(
    join(repoPath, "requests", "completed", `${requestId}.json`),
    JSON.stringify(envelope, null, 2),
  );

  // Write response
  const response = {
    request_id: requestId,
    responder: { user_id: recipient, display_name: recipient.charAt(0).toUpperCase() + recipient.slice(1) },
    responded_at: "2026-02-21T16:00:00.000Z",
    response_bundle: responseBundle,
  };
  writeFileSync(
    join(repoPath, "responses", `${requestId}.json`),
    JSON.stringify(response, null, 2),
  );

  execSync(`cd "${repoPath}" && git add -A && git commit -m "seed completed ${requestId}" && git push`, {
    stdio: "pipe",
  });
}

/** Seed a pending request with optional thread_id and attachments. */
function seedPendingRequestWithExtensions(
  repoPath: string,
  requestId: string,
  recipient: string,
  sender: string,
  opts?: { threadId?: string; attachments?: Array<{ filename: string; description: string }> },
): void {
  const envelope: Record<string, unknown> = {
    request_id: requestId,
    request_type: "sanity-check",
    sender: { user_id: sender, display_name: sender.charAt(0).toUpperCase() + sender.slice(1) },
    recipient: { user_id: recipient, display_name: recipient.charAt(0).toUpperCase() + recipient.slice(1) },
    status: "pending",
    created_at: "2026-02-21T14:30:22.000Z",
    context_bundle: { question: "Test question" },
  };
  if (opts?.threadId) {
    envelope.thread_id = opts.threadId;
  }
  if (opts?.attachments?.length) {
    envelope.attachments = opts.attachments;
  }
  writeFileSync(
    join(repoPath, "requests", "pending", `${requestId}.json`),
    JSON.stringify(envelope, null, 2),
  );
  execSync(`cd "${repoPath}" && git add -A && git commit -m "seed ${requestId}" && git push`, {
    stdio: "pipe",
  });
}

describe("garp_status: check request status and response", () => {
  let ctx: TestRepoContext;

  afterEach(() => {
    ctx?.cleanup();
  });

  // =========================================================================
  // Happy Path
  // =========================================================================

  it("returns completed status with full response for a finished request", async () => {
    ctx = createTestRepos();
    const requestId = "req-20260221-143022-alice-a1b2";

    await given("Alice's request has been responded to by Bob", async () => {
      seedCompletedRequest(ctx.aliceRepo, requestId, "bob", "alice", {
        answer: "YES - same pattern as ZD-4102",
        evidence: "Compared refresh.ts with cleanup.ts",
        recommendation: "Apply finally-block cleanup",
      });
    });

    await when("Alice checks the status of her request", async () => {
      const aliceServer = createGarpServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      const status = await aliceServer.callTool("garp_do", { action: "check_status",
        request_id: requestId,
      }) as any;

      expect(status.status).toBe("completed");
      expect(status.response).toBeDefined();
      expect(status.response.responder.display_name).toBe("Bob");
      expect(status.response.responded_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(status.response.response_bundle).toMatchObject({
        answer: "YES - same pattern as ZD-4102",
        recommendation: "Apply finally-block cleanup",
      });
    });
  });

  it("returns pending status with no response for a waiting request", async () => {
    ctx = createTestRepos();
    const requestId = "req-20260221-143022-alice-a1b2";

    await given("Alice has sent a request that Bob has not yet responded to", async () => {
      seedPendingRequest(ctx.aliceRepo, requestId, "bob", "alice");
    });

    await when("Alice checks the status of her request", async () => {
      const aliceServer = createGarpServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      const status = await aliceServer.callTool("garp_do", { action: "check_status",
        request_id: requestId,
      }) as any;

      expect(status.status).toBe("pending");
      expect(status.response).toBeUndefined();
    });
  });

  it("includes the original request data in the status response", async () => {
    ctx = createTestRepos();
    const requestId = "req-20260221-143022-alice-a1b2";

    await given("a pending request exists", async () => {
      seedPendingRequest(ctx.aliceRepo, requestId, "bob", "alice");
    });

    await when("Alice checks status", async () => {
      const aliceServer = createGarpServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      const status = await aliceServer.callTool("garp_do", { action: "check_status",
        request_id: requestId,
      }) as any;

      expect(status.request).toMatchObject({
        request_id: requestId,
        request_type: "sanity-check",
        sender: { user_id: "alice" },
        recipient: { user_id: "bob" },
      });
    });
  });

  it("finds a request regardless of which lifecycle directory it is in", async () => {
    ctx = createTestRepos();
    const pendingId = "req-20260221-140000-alice-0001";
    const completedId = "req-20260221-140100-alice-0002";

    await given("one request is pending and another is completed", async () => {
      seedPendingRequest(ctx.aliceRepo, pendingId, "bob", "alice");
      seedCompletedRequest(ctx.aliceRepo, completedId, "bob", "alice", {
        answer: "Done",
      });
    });

    await when("Alice checks status of each request", async () => {
      const aliceServer = createGarpServer({ repoPath: ctx.aliceRepo, userId: "alice" });

      const pendingStatus = await aliceServer.callTool("garp_do", { action: "check_status",
        request_id: pendingId,
      }) as any;
      expect(pendingStatus.status).toBe("pending");

      const completedStatus = await aliceServer.callTool("garp_do", { action: "check_status",
        request_id: completedId,
      }) as any;
      expect(completedStatus.status).toBe("completed");
      expect(completedStatus.response.response_bundle.answer).toBe("Done");
    });
  });

  // =========================================================================
  // Protocol Extensions: thread_id and attachments in status (US-002a/003a)
  // =========================================================================

  it("returns thread_id and attachments in the request data when present", async () => {
    ctx = createTestRepos();
    const requestId = "req-20260221-143022-alice-a1b2";
    const threadId = "req-20260221-100000-alice-0001";

    await given("a pending request exists with thread_id and attachments", async () => {
      seedPendingRequestWithExtensions(ctx.aliceRepo, requestId, "bob", "alice", {
        threadId,
        attachments: [
          { filename: "crash.log", description: "Application error log" },
          { filename: "config.yml", description: "Deployment configuration" },
        ],
      });
    });

    await when("Alice checks the status of her request", async () => {
      const aliceServer = createGarpServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      const status = await aliceServer.callTool("garp_do", { action: "check_status",
        request_id: requestId,
      }) as any;

      expect(status.status).toBe("pending");
      expect(status.request.thread_id).toBe(threadId);
      expect(status.request.attachments).toHaveLength(2);
      expect(status.request.attachments[0]).toEqual({
        filename: "crash.log",
        description: "Application error log",
      });
    });
  });

  // =========================================================================
  // Attachment Paths in Status (US-012 partial)
  // =========================================================================

  it("returns attachment_paths with absolute paths when request has attachments", async () => {
    ctx = createTestRepos();
    const requestId = "req-20260221-143022-alice-a1b2";

    await given("a pending request exists with attachments", async () => {
      seedPendingRequestWithExtensions(ctx.aliceRepo, requestId, "bob", "alice", {
        attachments: [
          { filename: "crash.log", description: "Error log" },
          { filename: "config.yml", description: "Deploy config" },
        ],
      });
    });

    await when("Alice checks the status of her request", async () => {
      const aliceServer = createGarpServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      const status = await aliceServer.callTool("garp_do", { action: "check_status",
        request_id: requestId,
      }) as any;

      expect(status.attachment_paths).toBeDefined();
      expect(status.attachment_paths).toHaveLength(2);
      expect(status.attachment_paths[0]).toEqual({
        filename: "crash.log",
        description: "Error log",
        path: join(ctx.aliceRepo, "attachments", requestId, "crash.log"),
      });
      expect(status.attachment_paths[1]).toEqual({
        filename: "config.yml",
        description: "Deploy config",
        path: join(ctx.aliceRepo, "attachments", requestId, "config.yml"),
      });
    });
  });

  it("omits attachment_paths when request has no attachments", async () => {
    ctx = createTestRepos();
    const requestId = "req-20260221-143022-alice-a1b2";

    await given("a pending request exists without attachments", async () => {
      seedPendingRequest(ctx.aliceRepo, requestId, "bob", "alice");
    });

    await when("Alice checks the status of her request", async () => {
      const aliceServer = createGarpServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      const status = await aliceServer.callTool("garp_do", { action: "check_status",
        request_id: requestId,
      }) as any;

      expect(status.attachment_paths).toBeUndefined();
    });
  });

  // =========================================================================
  // Cancelled Status
  // =========================================================================

  it("returns cancelled status when request is in cancelled/", async () => {
    ctx = createTestRepos();
    const requestId = "req-20260221-143022-alice-a1b2";

    await given("Alice's pending request has been cancelled", async () => {
      seedPendingRequest(ctx.aliceRepo, requestId, "bob", "alice");
      // Move request from pending/ to cancelled/ via git
      execSync(
        `cd "${ctx.aliceRepo}" && git mv requests/pending/${requestId}.json requests/cancelled/${requestId}.json && git commit -m "cancel ${requestId}" && git push`,
        { stdio: "pipe" },
      );
    });

    await when("Alice checks the status of her cancelled request", async () => {
      const aliceServer = createGarpServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      const status = await aliceServer.callTool("garp_do", { action: "check_status",
        request_id: requestId,
      }) as any;

      expect(status.status).toBe("cancelled");
      expect(status.request).toMatchObject({
        request_id: requestId,
        request_type: "sanity-check",
        sender: { user_id: "alice" },
        recipient: { user_id: "bob" },
      });
      expect(status.response).toBeUndefined();
    });
  });

  // =========================================================================
  // Error Paths
  // =========================================================================

  it("returns an error when request ID does not exist in any directory", async () => {
    ctx = createTestRepos();

    await when("Alice checks status of a non-existent request", async () => {
      const aliceServer = createGarpServer({ repoPath: ctx.aliceRepo, userId: "alice" });

      await expect(
        aliceServer.callTool("garp_do", { action: "check_status",
          request_id: "req-nonexistent-0000",
        }),
      ).rejects.toThrow(/not found/i);
    });
  });

  it("falls back to local state with warning when git pull fails", async () => {
    ctx = createTestRepos();
    const requestId = "req-20260221-143022-alice-a1b2";

    await given("a completed request exists locally but remote is unreachable", async () => {
      seedCompletedRequest(ctx.aliceRepo, requestId, "bob", "alice", {
        answer: "Cached answer",
      });

      // Break the remote
      execSync(`mv "${ctx.remotePath}" "${ctx.remotePath}.broken"`, { stdio: "pipe" });
    });

    await when("Alice checks status with remote unreachable", async () => {
      const aliceServer = createGarpServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      const status = await aliceServer.callTool("garp_do", { action: "check_status",
        request_id: requestId,
      }) as any;

      expect(status.status).toBe("completed");
      expect(status.response.response_bundle.answer).toBe("Cached answer");
      expect(status.warning).toMatch(/stale|local/i);
    });

    // Restore for cleanup
    await thenAssert("(cleanup) restore remote", async () => {
      execSync(`mv "${ctx.remotePath}.broken" "${ctx.remotePath}"`, { stdio: "pipe" });
    });
  });

  it("status check is read-only -- no commits are created", async () => {
    ctx = createTestRepos();
    const requestId = "req-20260221-143022-alice-a1b2";

    await given("a pending request exists", async () => {
      seedPendingRequest(ctx.aliceRepo, requestId, "bob", "alice");
    });

    await when("Alice checks status", async () => {
      const commitsBefore = execSync(
        `cd "${ctx.aliceRepo}" && git rev-list --count HEAD`,
        { encoding: "utf-8" },
      ).trim();

      const aliceServer = createGarpServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      await aliceServer.callTool("garp_do", { action: "check_status",
        request_id: requestId,
      });

      const commitsAfter = execSync(
        `cd "${ctx.aliceRepo}" && git rev-list --count HEAD`,
        { encoding: "utf-8" },
      ).trim();

      // Pull may update commit count, but Alice should not have authored new commits
      // The commit count after should be the same since pull from same remote won't add commits
      // (alice already has the latest). The key check: no new commits by Alice after the call.
      const aliceCommitsAfter = execSync(
        `cd "${ctx.aliceRepo}" && git log --author="alice" --oneline | wc -l`,
        { encoding: "utf-8" },
      ).trim();
      // Alice authored seed commits but status should not add any new ones
      // We just verify the count didn't change
      expect(Number(commitsAfter)).toBe(Number(commitsBefore));
    });
  });

  it("works from any session -- not tied to the session that created the request", async () => {
    ctx = createTestRepos();
    const requestId = "req-20260221-143022-alice-a1b2";

    await given("Alice sent a request from 'Session A' (simulated by first server instance)", async () => {
      seedPendingRequest(ctx.aliceRepo, requestId, "bob", "alice");
    });

    await when("Alice checks status from 'Session B' (new server instance)", async () => {
      // The key point: a fresh server instance can find the request
      const aliceSessionB = createGarpServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      const status = await aliceSessionB.callTool("garp_do", { action: "check_status",
        request_id: requestId,
      }) as any;

      expect(status.status).toBe("pending");
      expect(status.request.request_id).toBe(requestId);
    });
  });
});
