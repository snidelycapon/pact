/**
 * Milestone 4: Group Addressing Error Paths and Backward Compatibility
 *
 * pact-y30 epic — validates error handling and migration:
 *   - Unknown recipient in recipients[] array
 *   - Non-recipient trying to respond
 *   - Empty recipients array
 *   - Old single-response file format still readable
 *   - Old recipient field coerced to recipients[] on read
 *
 * Exercises driving ports: pact_do(send, respond, check_status, view_thread)
 * Integration contracts: IC1 (group send validation), IC3 (response storage),
 *   IC6 (backward compat)
 *
 * Error scenarios: 6 of 10 total (60%)
 *
 * @skip — Enable when recipients[] schema migration is implemented.
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
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { createPactServer } from "../../src/server.ts";

// ---------------------------------------------------------------------------
// Multi-member team setup
// ---------------------------------------------------------------------------

function createGroupTestRepos(): TestRepoContext & { carolRepo: string } {
  const ctx = createTestRepos();

  const config = JSON.parse(
    require("node:fs").readFileSync(join(ctx.aliceRepo, "config.json"), "utf-8"),
  );
  config.members.push({ user_id: "carol", display_name: "Carol" });
  writeFileSync(join(ctx.aliceRepo, "config.json"), JSON.stringify(config, null, 2));
  execSync(
    `cd "${ctx.aliceRepo}" && git add config.json && git commit -m "add carol" && git push`,
    { stdio: "pipe" },
  );

  const carolRepo = join(ctx.basePath, "carol");
  execSync(`git clone "${ctx.remotePath}" "${carolRepo}"`, { stdio: "pipe" });
  execSync(
    `cd "${carolRepo}" && git config user.email "carol@test.local" && git config user.name "Carol"`,
    { stdio: "pipe" },
  );

  gitPull(ctx.bobRepo);

  const origCleanup = ctx.cleanup;
  return {
    ...ctx,
    carolRepo,
    cleanup: () => origCleanup(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Group addressing error paths and backward compat (pact-y30)", () => {
  let ctx: ReturnType<typeof createGroupTestRepos>;

  afterEach(() => {
    ctx?.cleanup();
  });

  // =========================================================================
  // Error: Invalid recipients
  // =========================================================================

  it("rejects send when recipients array contains unknown user_id", async () => {
    ctx = createGroupTestRepos();

    const aliceServer = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });

    let error: any;

    await when("Alice sends to a mix of valid and invalid recipients", async () => {
      try {
        await aliceServer.callTool("pact_do", {
          action: "send",
          request_type: "sanity-check",
          recipients: ["bob", "nonexistent-user"],
          context_bundle: { question: "Will this fail?" },
        });
      } catch (e) {
        error = e;
      }
    });

    await thenAssert("send fails with error identifying the unknown user", () => {
      expect(error).toBeDefined();
      expect(String(error)).toMatch(/nonexistent-user/i);
    });

    await thenAssert("no request file was created", () => {
      const pending = listDir(ctx.aliceRepo, "requests/pending");
      expect(pending).toHaveLength(0);
    });
  });

  it("rejects send with empty recipients array", async () => {
    ctx = createGroupTestRepos();

    const aliceServer = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });

    let error: any;

    await when("Alice sends a request with empty recipients array", async () => {
      try {
        await aliceServer.callTool("pact_do", {
          action: "send",
          request_type: "sanity-check",
          recipients: [],
          context_bundle: { question: "Who receives this?" },
        });
      } catch (e) {
        error = e;
      }
    });

    await thenAssert("send fails with validation error", () => {
      expect(error).toBeDefined();
    });
  });

  it("rejects send when sender is in recipients array", async () => {
    ctx = createGroupTestRepos();

    const aliceServer = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });

    let error: any;

    await when("Alice includes herself in the recipients array", async () => {
      try {
        await aliceServer.callTool("pact_do", {
          action: "send",
          request_type: "sanity-check",
          recipients: ["alice", "bob"],
          context_bundle: { question: "Can I send to myself?" },
        });
      } catch (e) {
        error = e;
      }
    });

    await thenAssert("send fails because sender cannot be a recipient", () => {
      expect(error).toBeDefined();
    });
  });

  // =========================================================================
  // Error: Non-recipient responding
  // =========================================================================

  it("rejects response from user not in recipients array", async () => {
    ctx = createGroupTestRepos();

    const aliceServer = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
    const carolServer = createPactServer({ repoPath: ctx.carolRepo, userId: "carol" });

    let requestId: string;
    let error: any;

    await given("Alice sends a request to Bob only", async () => {
      const result = (await aliceServer.callTool("pact_do", {
        action: "send",
        request_type: "sanity-check",
        recipients: ["bob"],
        context_bundle: { question: "Bob only" },
      })) as { request_id: string };
      requestId = result.request_id;
    });

    await when("Carol (not a recipient) tries to respond", async () => {
      gitPull(ctx.carolRepo);
      try {
        await carolServer.callTool("pact_do", {
          action: "respond",
          request_id: requestId,
          response_bundle: { answer: "I was not asked" },
        });
      } catch (e) {
        error = e;
      }
    });

    await thenAssert("response is rejected because Carol is not a recipient", () => {
      expect(error).toBeDefined();
      expect(String(error)).toMatch(/not.*recipient|not.*authorized/i);
    });
  });

  // =========================================================================
  // Error: Duplicate response
  // =========================================================================

  it("rejects duplicate response from same recipient", async () => {
    ctx = createGroupTestRepos();

    const aliceServer = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
    const bobServer = createPactServer({ repoPath: ctx.bobRepo, userId: "bob" });

    let requestId: string;
    let error: any;

    await given("Alice sends a group request and Bob already responded", async () => {
      const result = (await aliceServer.callTool("pact_do", {
        action: "send",
        request_type: "sanity-check",
        recipients: ["bob", "carol"],
        context_bundle: { question: "Double respond test" },
      })) as { request_id: string };
      requestId = result.request_id;

      gitPull(ctx.bobRepo);
      await bobServer.callTool("pact_do", {
        action: "respond",
        request_id: requestId,
        response_bundle: { answer: "First response" },
      });
    });

    await when("Bob tries to respond a second time", async () => {
      try {
        await bobServer.callTool("pact_do", {
          action: "respond",
          request_id: requestId,
          response_bundle: { answer: "Second response" },
        });
      } catch (e) {
        error = e;
      }
    });

    await thenAssert("duplicate response is rejected", () => {
      expect(error).toBeDefined();
    });
  });

  // =========================================================================
  // Backward compatibility: old single-recipient format
  // =========================================================================

  it("inbox reads old-format requests with single recipient field", async () => {
    ctx = createGroupTestRepos();

    await given("a request exists with old-format single recipient field", () => {
      // Seed a request with old-format: `recipient` instead of `recipients`
      seedPendingRequest(ctx.aliceRepo, "req-20260223-100000-alice-old1", "bob", "alice");
    });

    await thenAssert("Bob can see the old-format request in inbox", async () => {
      gitPull(ctx.bobRepo);
      const bobServer = createPactServer({ repoPath: ctx.bobRepo, userId: "bob" });
      const inbox = (await bobServer.callTool("pact_do", { action: "inbox" })) as {
        requests: any[];
      };
      expect(inbox.requests).toHaveLength(1);
      expect(inbox.requests[0].request_id).toBe("req-20260223-100000-alice-old1");
    });
  });

  it("status reads old-format single response file alongside per-respondent directory", async () => {
    ctx = createGroupTestRepos();

    await given("a completed request exists with old-format single response file", () => {
      // Seed old-format: response as responses/{id}.json (file, not directory)
      seedPendingRequest(ctx.aliceRepo, "req-20260223-100000-alice-old2", "bob", "alice");

      gitPull(ctx.bobRepo);
      const bobServer = createPactServer({ repoPath: ctx.bobRepo, userId: "bob" });
      // Respond using current system (creates old-format response file)
      return bobServer.callTool("pact_do", {
        action: "respond",
        request_id: "req-20260223-100000-alice-old2",
        response_bundle: { answer: "Old format response" },
      });
    });

    await thenAssert("Alice can check status and see the old-format response", async () => {
      gitPull(ctx.aliceRepo);
      const aliceServer = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      const status = (await aliceServer.callTool("pact_do", {
        action: "check_status",
        request_id: "req-20260223-100000-alice-old2",
      })) as any;
      expect(status.status).toBe("completed");
      expect(status.response.response_bundle.answer).toBe("Old format response");
    });
  });

  // =========================================================================
  // Thread with per-respondent responses
  // =========================================================================

  it("view_thread shows all per-respondent responses for a group request", async () => {
    ctx = createGroupTestRepos();

    const aliceServer = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
    const bobServer = createPactServer({ repoPath: ctx.bobRepo, userId: "bob" });
    const carolServer = createPactServer({ repoPath: ctx.carolRepo, userId: "carol" });

    let requestId: string;

    await given("Alice sends a group request and both recipients respond", async () => {
      const result = (await aliceServer.callTool("pact_do", {
        action: "send",
        request_type: "sanity-check",
        recipients: ["bob", "carol"],
        context_bundle: { question: "Thread test" },
      })) as { request_id: string };
      requestId = result.request_id;

      gitPull(ctx.bobRepo);
      await bobServer.callTool("pact_do", {
        action: "respond",
        request_id: requestId,
        response_bundle: { answer: "Bob's thread entry" },
      });

      gitPull(ctx.carolRepo);
      await carolServer.callTool("pact_do", {
        action: "respond",
        request_id: requestId,
        response_bundle: { answer: "Carol's thread entry" },
      });
    });

    await thenAssert("thread shows both responses", async () => {
      gitPull(ctx.aliceRepo);
      const thread = (await aliceServer.callTool("pact_do", {
        action: "view_thread",
        request_id: requestId,
      })) as any;
      const responses = Array.isArray(thread.responses) ? thread.responses : [thread.response];
      expect(responses.length).toBeGreaterThanOrEqual(2);
      const responderIds = responses.map((r: any) => r.responder.user_id);
      expect(responderIds).toContain("bob");
      expect(responderIds).toContain("carol");
    });
  });
});
