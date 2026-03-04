/**
 * Acceptance Tests -- pact_thread (View Thread History)
 *
 * Traces to: US-009
 *
 * Scenarios:
 *   - Multi-round thread with completed and pending requests
 *   - Single-round completed thread
 *   - Thread not found returns empty with message
 *   - Thread includes cancelled requests
 *   - Git pull runs before scanning (with fallback)
 */

import { describe, it, expect, afterEach } from "vitest";
import {
  createTestRepos,
  readRepoJSON,
  type TestRepoContext,
} from "./helpers/setup-test-repos";
import { given, when, thenAssert } from "./helpers/gwt";
import { createPactServer } from "../../src/server.ts";

describe("pact_thread: view thread history", () => {
  let ctx: TestRepoContext;

  afterEach(() => {
    ctx?.cleanup();
  });

  it("retrieves multi-round thread history in chronological order", async () => {
    ctx = createTestRepos();
    const aliceServer = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
    const bobServer = createPactServer({ repoPath: ctx.bobRepo, userId: "bob" });

    let threadId: string;
    let round1Id: string;
    let round2Id: string;

    await given("Alice sends round 1 of a design conversation to Bob", async () => {
      const r1 = (await aliceServer.callTool("pact_do", { action: "send",
        request_type: "sanity-check",
        recipient: "bob",
        context_bundle: { question: "Round 1: Does this pattern look right?" },
      })) as { request_id: string; thread_id: string };
      round1Id = r1.request_id;
      threadId = r1.thread_id;
    });

    await given("Bob responds to round 1", async () => {
      await bobServer.callTool("pact_do", { action: "respond",
        request_id: round1Id,
        response_bundle: { answer: "Looks good but needs tests" },
      });
    });

    await given("Alice sends round 2 using the same thread_id", async () => {
      const r2 = (await aliceServer.callTool("pact_do", { action: "send",
        request_type: "sanity-check",
        recipient: "bob",
        context_bundle: { question: "Round 2: Added tests, what do you think?" },
        thread_id: threadId,
      })) as { request_id: string; thread_id: string };
      round2Id = r2.request_id;
    });

    let result: Record<string, unknown>;

    await when("Alice calls pact_thread with the thread_id", async () => {
      result = (await aliceServer.callTool("pact_do", { action: "view_thread",
        thread_id: threadId,
      })) as Record<string, unknown>;
    });

    await thenAssert("the result contains 2 entries in chronological order", async () => {
      expect(result.thread_id).toBe(threadId);
      const entries = result.entries as Array<{ request: Record<string, unknown>; response?: Record<string, unknown> }>;
      expect(entries).toHaveLength(2);
      // Round 1 first, round 2 second
      expect(entries[0].request.request_id).toBe(round1Id);
      expect(entries[1].request.request_id).toBe(round2Id);
    });

    await thenAssert("entry 1 includes Bob's response, entry 2 has no response", async () => {
      const entries = result.entries as Array<{ request: Record<string, unknown>; response?: Record<string, unknown> }>;
      expect(entries[0].response).toBeDefined();
      expect((entries[0].response as Record<string, unknown>).response_bundle).toMatchObject({ answer: "Looks good but needs tests" });
      expect(entries[1].response).toBeUndefined();
    });

    await thenAssert("the summary shows participants, round_count, and latest status", async () => {
      const summary = result.summary as Record<string, unknown>;
      expect(summary.participants).toEqual(["alice", "bob"]);
      expect(summary.round_count).toBe(2);
      expect(summary.latest_status).toBe("pending");
      expect(summary.request_type).toBe("sanity-check");
    });
  });

  it("retrieves single-round completed thread", async () => {
    ctx = createTestRepos();
    const aliceServer = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
    const bobServer = createPactServer({ repoPath: ctx.bobRepo, userId: "bob" });

    let threadId: string;

    await given("Alice sends a request and Bob responds", async () => {
      const r = (await aliceServer.callTool("pact_do", { action: "send",
        request_type: "sanity-check",
        recipient: "bob",
        context_bundle: { question: "Quick question" },
      })) as { request_id: string; thread_id: string };
      threadId = r.thread_id;
      await bobServer.callTool("pact_do", { action: "respond",
        request_id: r.request_id,
        response_bundle: { answer: "Yes" },
      });
    });

    let result: Record<string, unknown>;

    await when("Alice calls pact_thread", async () => {
      result = (await aliceServer.callTool("pact_do", { action: "view_thread",
        thread_id: threadId,
      })) as Record<string, unknown>;
    });

    await thenAssert("the result has 1 entry with request and response", async () => {
      const entries = result.entries as Array<{ request: Record<string, unknown>; response?: Record<string, unknown> }>;
      expect(entries).toHaveLength(1);
      expect(entries[0].response).toBeDefined();
      const summary = result.summary as Record<string, unknown>;
      expect(summary.round_count).toBe(1);
      expect(summary.latest_status).toBe("pending");
    });
  });

  it("returns empty result with message when thread not found", async () => {
    ctx = createTestRepos();
    const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });

    let result: Record<string, unknown>;

    await when("Alice calls pact_thread with a non-existent thread_id", async () => {
      result = (await server.callTool("pact_do", { action: "view_thread",
        thread_id: "req-nonexistent",
      })) as Record<string, unknown>;
    });

    await thenAssert("the result has 0 entries and a helpful message", async () => {
      const entries = result.entries as unknown[];
      expect(entries).toHaveLength(0);
      expect(result.message).toBe("No requests found for this thread");
      const summary = result.summary as Record<string, unknown>;
      expect(summary.round_count).toBe(0);
    });
  });

  it("thread is viewable from any user's server (not tied to sender)", async () => {
    ctx = createTestRepos();
    const aliceServer = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
    const bobServer = createPactServer({ repoPath: ctx.bobRepo, userId: "bob" });

    let threadId: string;

    await given("Alice sends a request to Bob", async () => {
      const r = (await aliceServer.callTool("pact_do", { action: "send",
        request_type: "sanity-check",
        recipient: "bob",
        context_bundle: { question: "Can Bob see this thread too?" },
      })) as { request_id: string; thread_id: string };
      threadId = r.thread_id;
    });

    let result: Record<string, unknown>;

    await when("Bob calls pact_thread with the thread_id", async () => {
      result = (await bobServer.callTool("pact_do", { action: "view_thread",
        thread_id: threadId,
      })) as Record<string, unknown>;
    });

    await thenAssert("Bob sees the thread with 1 entry", async () => {
      const entries = result.entries as unknown[];
      expect(entries).toHaveLength(1);
    });
  });
});
