/**
 * Walking Skeleton -- Complete Round-Trip Acceptance Test
 *
 * Traces to: US-001, US-008
 *
 * This is the FIRST and most important acceptance test. It proves the
 * entire GARP loop works end-to-end:
 *
 *   1. Repo exists with correct directory structure
 *   2. Alice submits a sanity-check request to Bob via garp_request
 *   3. Bob checks inbox via garp_inbox and sees the request
 *   4. Bob responds via garp_respond with findings
 *   5. Alice checks status via garp_status and sees the response
 *
 * The test exercises all 4 driving ports (MCP tool handlers) against
 * real local git repos. No mocks, no network -- just bare repos on
 * the filesystem simulating the GitHub remote.
 *
 * Implementation note: The test calls tool handlers directly (the
 * driving ports), not through MCP JSON-RPC. The tool handlers are
 * the public API boundary of the GARP server.
 */

import { describe, it, expect, afterEach } from "vitest";
import {
  createTestRepos,
  listDir,
  readRepoJSON,
  fileExists,
  lastCommitMessage,
  allCommitMessages,
  gitPull,
  type TestRepoContext,
} from "./helpers/setup-test-repos";
import { given, when, thenAssert } from "./helpers/gwt";
import { createGarpServer } from "../../src/server.js";

describe("Walking Skeleton: complete round-trip", () => {
  let ctx: TestRepoContext;

  afterEach(() => {
    ctx?.cleanup();
  });

  // =========================================================================
  // WALKING SKELETON 1: Full request-respond lifecycle
  // =========================================================================

  it("Alice sends a request, Bob receives and responds, Alice sees the response", async () => {
    ctx = createTestRepos();

    const aliceServer = createGarpServer({ repoPath: ctx.aliceRepo, userId: "alice" });
    const bobServer   = createGarpServer({ repoPath: ctx.bobRepo,   userId: "bob" });

    let requestId: string;

    // --- Given: repo structure exists with skill and team config ---

    await given("repo has standard directory structure and team config", async () => {
      expect(fileExists(ctx.aliceRepo, "config.json")).toBe(true);
      expect(fileExists(ctx.aliceRepo, "skills/sanity-check/SKILL.md")).toBe(true);
      expect(fileExists(ctx.aliceRepo, "requests/pending/.gitkeep")).toBe(true);
      expect(fileExists(ctx.aliceRepo, "requests/completed/.gitkeep")).toBe(true);
      expect(fileExists(ctx.aliceRepo, "responses/.gitkeep")).toBe(true);
    });

    // --- When: Alice submits a sanity-check request to Bob ---

    await when("Alice submits a sanity-check request to Bob", async () => {
      const result = await aliceServer.callTool("garp_request", {
        request_type: "sanity-check",
        recipient: "bob",
        context_bundle: {
          customer: "Acme Corp",
          product: "Platform v3.2",
          issue_summary: "Refresh tokens not garbage collected",
          involved_files: "src/auth/refresh.ts:L45-90",
          investigation_so_far: "Token references held in closure, preventing GC",
          question: "Does this match the session service pattern from last month?",
        },
      }) as { request_id: string };
      requestId = result.request_id;
      expect(requestId).toMatch(/^req-\d{8}-\d{6}-alice-[0-9a-f]{4}$/);
    });

    // --- Then: request file exists in pending directory ---

    await thenAssert("request file appears in pending directory on the remote", async () => {
      gitPull(ctx.bobRepo);
      const pendingFiles = listDir(ctx.bobRepo, "requests/pending");
      expect(pendingFiles).toHaveLength(1);
      expect(pendingFiles[0]).toContain(requestId);

      const envelope = readRepoJSON(ctx.bobRepo, `requests/pending/${pendingFiles[0]}`);
      expect(envelope).toMatchObject({
        request_id: requestId,
        request_type: "sanity-check",
        status: "pending",
        sender: { user_id: "alice", display_name: "Alice" },
        recipient: { user_id: "bob", display_name: "Bob" },
      });
    });

    // --- When: Bob checks inbox and sees the request ---

    await when("Bob checks inbox and sees one pending request", async () => {
      const inbox = await bobServer.callTool("garp_inbox", {}) as { requests: any[] };
      expect(inbox.requests).toHaveLength(1);
      expect(inbox.requests[0].request_id).toBe(requestId);
      expect(inbox.requests[0].request_type).toBe("sanity-check");
      expect(inbox.requests[0].sender).toBe("Alice");
      expect(inbox.requests[0].skill_path).toContain("skills/sanity-check/SKILL.md");
    });

    // --- When: Bob responds with findings ---

    await when("Bob responds with investigation findings", async () => {
      const response = await bobServer.callTool("garp_respond", {
        request_id: requestId,
        response_bundle: {
          answer: "YES - same pattern as ZD-4102",
          evidence: "Compared refresh.ts:L45-90 with cleanup.ts:L30-60",
          concerns: "The token-cache module may have the same issue",
          recommendation: "Apply finally-block cleanup, reference ZD-4102 fix",
        },
      }) as { status: string };
      expect(response.status).toBe("completed");
    });

    // --- Then: request moved to completed, response file exists ---

    await thenAssert("request is in completed directory and response file exists", async () => {
      gitPull(ctx.aliceRepo);

      // Request moved from pending to completed
      const pending = listDir(ctx.aliceRepo, "requests/pending");
      expect(pending).toHaveLength(0);

      const completed = listDir(ctx.aliceRepo, "requests/completed");
      expect(completed).toHaveLength(1);
      expect(completed[0]).toContain(requestId);

      // Response file exists
      const responseFile = `responses/${requestId}.json`;
      expect(fileExists(ctx.aliceRepo, responseFile)).toBe(true);

      const responseData = readRepoJSON(ctx.aliceRepo, responseFile) as any;
      expect(responseData).toMatchObject({
        request_id: requestId,
        responder: { user_id: "bob", display_name: "Bob" },
        response_bundle: {
          answer: "YES - same pattern as ZD-4102",
        },
      });
    });

    // --- When: Alice checks status ---

    await when("Alice checks status of her request", async () => {
      const status = await aliceServer.callTool("garp_status", {
        request_id: requestId,
      }) as any;
      expect(status.status).toBe("completed");
      expect(status.response.responder.display_name).toBe("Bob");
      expect(status.response.response_bundle.answer).toBe(
        "YES - same pattern as ZD-4102",
      );
      expect(status.response.response_bundle.recommendation).toContain("ZD-4102");
    });
  });

  // =========================================================================
  // WALKING SKELETON 2: Git audit trail
  // =========================================================================

  it("git log shows structured commit messages for the full round-trip", async () => {
    ctx = createTestRepos();

    const aliceServer = createGarpServer({ repoPath: ctx.aliceRepo, userId: "alice" });
    const bobServer   = createGarpServer({ repoPath: ctx.bobRepo,   userId: "bob" });

    // Execute a complete round-trip
    const result = await aliceServer.callTool("garp_request", {
      request_type: "sanity-check",
      recipient: "bob",
      context_bundle: {
        customer: "Acme Corp",
        product: "Platform v3.2",
        issue_summary: "Audit trail test",
        question: "Does the audit trail work?",
      },
    }) as { request_id: string };
    const requestId = result.request_id;

    gitPull(ctx.bobRepo);

    await bobServer.callTool("garp_respond", {
      request_id: requestId,
      response_bundle: {
        answer: "YES",
        recommendation: "Ship it",
      },
    });

    gitPull(ctx.aliceRepo);
    const messages = allCommitMessages(ctx.aliceRepo);

    // Most recent first -- response commit, then request commit
    expect(messages[0]).toMatch(/\[garp\] response:.*sanity-check.*bob -> alice/);
    expect(messages[1]).toMatch(/\[garp\] new request:.*sanity-check.*-> bob/);
  });

  // =========================================================================
  // WALKING SKELETON 3: Session independence (request and response persist)
  // =========================================================================

  it("request and response are accessible from a fresh server instance", async () => {
    ctx = createTestRepos();

    // --- Session A: Alice sends request ---
    const aliceSessionA = createGarpServer({ repoPath: ctx.aliceRepo, userId: "alice" });
    const result = await aliceSessionA.callTool("garp_request", {
      request_type: "sanity-check",
      recipient: "bob",
      context_bundle: { question: "Test question" },
    }) as { request_id: string };
    const requestId = result.request_id;

    // --- Bob responds ---
    const bobSession = createGarpServer({ repoPath: ctx.bobRepo, userId: "bob" });
    gitPull(ctx.bobRepo);
    await bobSession.callTool("garp_respond", {
      request_id: requestId,
      response_bundle: { answer: "Confirmed" },
    });

    // --- Session B: Alice checks from a new server instance ---
    const aliceSessionB = createGarpServer({ repoPath: ctx.aliceRepo, userId: "alice" });
    const status = await aliceSessionB.callTool("garp_status", {
      request_id: requestId,
    }) as any;
    expect(status.status).toBe("completed");
    expect(status.response.response_bundle.answer).toBe("Confirmed");
  });
});
