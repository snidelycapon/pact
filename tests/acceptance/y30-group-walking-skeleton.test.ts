/**
 * Walking Skeleton: Group Request Round-Trip
 *
 * pact-y30 epic — validates the core group addressing lifecycle:
 *   1. Alice sends a request to multiple recipients (bob, carol)
 *   2. Both recipients see the request in their inbox
 *   3. Bob responds — per-respondent response file created
 *   4. Alice checks status and sees Bob's response
 *   5. Carol responds — second per-respondent response file created
 *   6. Alice sees both responses
 *
 * Exercises driving ports: pact_do(send, inbox, respond, check_status)
 * Integration contracts: IC1 (group send), IC2 (inbox filtering),
 *   IC3 (per-respondent storage)
 *
 * @skip — Enable when recipients[] schema and per-respondent storage are implemented.
 */

import { describe, it, expect, afterEach } from "vitest";
import {
  createTestRepos,
  listDir,
  readRepoJSON,
  fileExists,
  gitPull,
  type TestRepoContext,
} from "./helpers/setup-test-repos";
import { given, when, thenAssert } from "./helpers/gwt";
import { createPactServer } from "../../src/server.ts";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

// ---------------------------------------------------------------------------
// Multi-member team setup (extends alice+bob with carol)
// ---------------------------------------------------------------------------

function createGroupTestRepos(): TestRepoContext & { carolRepo: string } {
  const ctx = createTestRepos();

  // Add carol to team config in alice's repo
  const config = JSON.parse(
    require("node:fs").readFileSync(join(ctx.aliceRepo, "config.json"), "utf-8"),
  );
  config.members.push({ user_id: "carol", display_name: "Carol" });
  writeFileSync(join(ctx.aliceRepo, "config.json"), JSON.stringify(config, null, 2));
  execSync(
    `cd "${ctx.aliceRepo}" && git add config.json && git commit -m "add carol to team" && git push`,
    { stdio: "pipe" },
  );

  // Clone for Carol
  const carolRepo = join(ctx.basePath, "carol");
  execSync(`git clone "${ctx.remotePath}" "${carolRepo}"`, { stdio: "pipe" });
  execSync(
    `cd "${carolRepo}" && git config user.email "carol@test.local" && git config user.name "Carol"`,
    { stdio: "pipe" },
  );

  // Update Bob's clone
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

describe("Walking Skeleton: group request round-trip (pact-y30)", () => {
  let ctx: ReturnType<typeof createGroupTestRepos>;

  afterEach(() => {
    ctx?.cleanup();
  });

  // =========================================================================
  // WALKING SKELETON 1: Full group request-respond lifecycle
  // =========================================================================

  it.skip("Alice sends a request to Bob and Carol, both respond, Alice sees all responses", async () => {
    ctx = createGroupTestRepos();

    const aliceServer = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
    const bobServer = createPactServer({ repoPath: ctx.bobRepo, userId: "bob" });
    const carolServer = createPactServer({ repoPath: ctx.carolRepo, userId: "carol" });

    let requestId: string;

    // --- Given: team has 3 members and a pact installed ---

    await given("team has alice, bob, and carol with a sanity-check pact", async () => {
      expect(fileExists(ctx.aliceRepo, "config.json")).toBe(true);
      expect(fileExists(ctx.aliceRepo, "pacts/sanity-check/PACT.md")).toBe(true);
    });

    // --- When: Alice sends a group request ---

    await when("Alice sends a sanity-check request to Bob and Carol", async () => {
      const result = (await aliceServer.callTool("pact_do", {
        action: "send",
        request_type: "sanity-check",
        recipients: ["bob", "carol"],
        context_bundle: {
          customer: "Acme Corp",
          product: "Platform v3.2",
          issue_summary: "Token cache not clearing on logout",
          involved_files: "src/auth/cache.ts:L20-50",
          investigation_so_far: "Cache entries persist after session end",
          question: "Is this the same pattern we saw in the session service?",
        },
      })) as { request_id: string };
      requestId = result.request_id;
      expect(requestId).toBeTruthy();
    });

    // --- Then: request envelope has recipients[] ---

    await thenAssert("request envelope lists both recipients", async () => {
      const pendingFiles = listDir(ctx.aliceRepo, "requests/pending");
      expect(pendingFiles).toHaveLength(1);
      const envelope = readRepoJSON<any>(ctx.aliceRepo, `requests/pending/${pendingFiles[0]}`);
      expect(envelope.recipients).toHaveLength(2);
      const recipientIds = envelope.recipients.map((r: any) => r.user_id);
      expect(recipientIds).toContain("bob");
      expect(recipientIds).toContain("carol");
    });

    // --- Then: both recipients see the request ---

    await thenAssert("Bob sees the group request in his inbox", async () => {
      gitPull(ctx.bobRepo);
      const inbox = (await bobServer.callTool("pact_do", { action: "inbox" })) as {
        requests: any[];
      };
      expect(inbox.requests).toHaveLength(1);
      expect(inbox.requests[0].request_id).toBe(requestId);
    });

    await thenAssert("Carol sees the group request in her inbox", async () => {
      gitPull(ctx.carolRepo);
      const inbox = (await carolServer.callTool("pact_do", { action: "inbox" })) as {
        requests: any[];
      };
      expect(inbox.requests).toHaveLength(1);
      expect(inbox.requests[0].request_id).toBe(requestId);
    });

    // --- When: Bob responds ---

    await when("Bob responds with his findings", async () => {
      const response = (await bobServer.callTool("pact_do", {
        action: "respond",
        request_id: requestId,
        response_bundle: {
          answer: "YES — same pattern as ZD-4102",
          evidence: "Compared cache.ts:L20-50 with cleanup.ts:L30-60",
          concerns: "The token-cache module may have the same issue",
          recommendation: "Apply finally-block cleanup",
        },
      })) as { status: string };
      expect(response.status).toBe("completed");
    });

    // --- Then: per-respondent response file exists ---

    await thenAssert("Bob's response is stored as a per-respondent file", async () => {
      gitPull(ctx.aliceRepo);
      expect(fileExists(ctx.aliceRepo, `responses/${requestId}/bob.json`)).toBe(true);
      const bobResponse = readRepoJSON<any>(ctx.aliceRepo, `responses/${requestId}/bob.json`);
      expect(bobResponse.responder.user_id).toBe("bob");
      expect(bobResponse.response_bundle.answer).toContain("ZD-4102");
    });

    // --- When: Carol responds ---

    await when("Carol responds with her findings", async () => {
      gitPull(ctx.carolRepo);
      const response = (await carolServer.callTool("pact_do", {
        action: "respond",
        request_id: requestId,
        response_bundle: {
          answer: "PARTIALLY — similar but not identical",
          evidence: "The lifecycle differs from the session service",
          concerns: "Need to check if the cache has a TTL",
          recommendation: "Add TTL to cache entries before applying cleanup",
        },
      })) as { status: string };
      expect(response.status).toBe("completed");
    });

    // --- Then: both responses visible ---

    await thenAssert("Alice sees both per-respondent responses", async () => {
      gitPull(ctx.aliceRepo);
      expect(fileExists(ctx.aliceRepo, `responses/${requestId}/bob.json`)).toBe(true);
      expect(fileExists(ctx.aliceRepo, `responses/${requestId}/carol.json`)).toBe(true);
    });

    // --- When: Alice checks status ---

    await when("Alice checks status and sees both responses", async () => {
      const status = (await aliceServer.callTool("pact_do", {
        action: "check_status",
        request_id: requestId,
      })) as any;
      expect(status.status).toBe("completed");
      // Should have responses from both bob and carol
      const responses = Array.isArray(status.responses) ? status.responses : [status.response];
      const responderIds = responses.map((r: any) => r.responder.user_id);
      expect(responderIds).toContain("bob");
      expect(responderIds).toContain("carol");
    });
  });

  // =========================================================================
  // WALKING SKELETON 2: Group inbox enrichment
  // =========================================================================

  it.skip("inbox entries for group requests include recipient count and group reference", async () => {
    ctx = createGroupTestRepos();

    const aliceServer = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
    const bobServer = createPactServer({ repoPath: ctx.bobRepo, userId: "bob" });

    let requestId: string;

    await given("Alice sends a group request with a group reference", async () => {
      const result = (await aliceServer.callTool("pact_do", {
        action: "send",
        request_type: "sanity-check",
        recipients: ["bob", "carol"],
        group_ref: "@backend-team",
        context_bundle: {
          customer: "Acme Corp",
          question: "Does this look right?",
        },
      })) as { request_id: string };
      requestId = result.request_id;
    });

    await thenAssert("Bob's inbox shows recipient count and group reference", async () => {
      gitPull(ctx.bobRepo);
      const inbox = (await bobServer.callTool("pact_do", { action: "inbox" })) as {
        requests: any[];
      };
      const entry = inbox.requests.find((r: any) => r.request_id === requestId);
      expect(entry).toBeDefined();
      expect(entry.recipients_count).toBe(2);
      expect(entry.group_ref).toBe("@backend-team");
    });
  });

  // =========================================================================
  // WALKING SKELETON 3: Single recipient still works (backward compat)
  // =========================================================================

  it("single-recipient request works with recipients[] array of one", async () => {
    ctx = createGroupTestRepos();

    const aliceServer = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
    const bobServer = createPactServer({ repoPath: ctx.bobRepo, userId: "bob" });

    let requestId: string;

    await when("Alice sends a request to only Bob using recipients array", async () => {
      const result = (await aliceServer.callTool("pact_do", {
        action: "send",
        request_type: "sanity-check",
        recipients: ["bob"],
        context_bundle: {
          customer: "Acme Corp",
          question: "Quick check on this?",
        },
      })) as { request_id: string };
      requestId = result.request_id;
    });

    await thenAssert("Bob sees the request and can respond normally", async () => {
      gitPull(ctx.bobRepo);
      const inbox = (await bobServer.callTool("pact_do", { action: "inbox" })) as {
        requests: any[];
      };
      expect(inbox.requests).toHaveLength(1);

      const response = (await bobServer.callTool("pact_do", {
        action: "respond",
        request_id: requestId,
        response_bundle: { answer: "Looks good" },
      })) as { status: string };
      expect(response.status).toBe("completed");
    });

    await thenAssert("response stored in per-respondent directory format", async () => {
      gitPull(ctx.aliceRepo);
      expect(fileExists(ctx.aliceRepo, `responses/${requestId}/bob.json`)).toBe(true);
    });
  });
});
