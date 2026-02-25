/**
 * Mutation Hardening Tests
 *
 * Targeted acceptance tests to kill surviving mutants identified by Stryker.
 * Covers: response-loader.ts, pact-thread.ts, pact-loader.ts, pact-discover.ts
 *
 * Strategy: exercise specific branches that mutations can flip, and assert on
 * exact values (not just existence) so mutations that change return values or
 * conditions are caught.
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
import { createPactServer } from "../../src/server.ts";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

// ---------------------------------------------------------------------------
// Multi-member team setup (extends alice+bob with carol)
// ---------------------------------------------------------------------------

function createGroupTestRepos(): TestRepoContext & { carolRepo: string } {
  const ctx = createTestRepos();

  const config = JSON.parse(
    require("node:fs").readFileSync(join(ctx.aliceRepo, "config.json"), "utf-8"),
  );
  config.members.push({ user_id: "carol", display_name: "Carol" });
  writeFileSync(join(ctx.aliceRepo, "config.json"), JSON.stringify(config, null, 2));
  execSync(
    `cd "${ctx.aliceRepo}" && git add config.json && git commit -m "add carol to team" && git push`,
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
// Flat-file pact fixtures
// ---------------------------------------------------------------------------

const ASK_PACT = `---
name: ask
description: Get input that unblocks current work
version: "1.0.0"
scope: global
when_to_use:
  - You have a question that needs another person's perspective
multi_round: false
context_bundle:
  required: [question]
  fields:
    question: { type: string, description: "The question" }
    background: { type: string, description: "Context the recipient needs" }
response_bundle:
  required: [answer]
  fields:
    answer: { type: string, description: "Direct answer" }
    reasoning: { type: string, description: "Why this answer" }
---

# Ask

Get input that unblocks current work.
`;

const REQUEST_PACT = `---
name: request
description: Ask someone to do something and deliver a result
version: "1.0.0"
scope: global
when_to_use:
  - You need someone to perform a task and deliver a specific result
context_bundle:
  required: [what, done_when]
  fields:
    what: { type: string, description: "What needs to be done" }
    done_when: { type: string, description: "How to know it is complete" }
    deadline: { type: string, description: "When it needs to be done by" }
response_bundle:
  required: [status, result]
  fields:
    status: { type: string, description: "done / blocked / declined" }
    result: { type: string, description: "The deliverable or outcome" }
defaults:
  response_mode: any
  visibility: shared
  claimable: false
---

# Request

Ask someone to do something and deliver a result.
`;

const REQUEST_BACKEND_VARIANT = `---
name: "request:backend"
extends: request
description: Backend team request with service context
scope: team
registered_for: [team:backend]
when_to_use:
  - Backend team member needs something done involving service architecture
context_bundle:
  required: [what, service, done_when]
  fields:
    service: { type: string, description: "Affected service name" }
    runbook: { type: string, description: "Link to relevant runbook" }
defaults:
  claimable: true
response_bundle:
  required: [status, result, deploy_notes]
  fields:
    status: { type: string, description: "done / blocked / declined" }
    result: { type: string, description: "The deliverable or outcome" }
    deploy_notes: { type: string, description: "Deployment notes" }
---

# Backend Request

Extends the base request pact with backend-specific context fields.
`;

const REVIEW_PACT = `---
name: review
description: Get structured feedback with blocking/advisory split
version: "1.0.0"
scope: global
when_to_use:
  - You want structured review feedback
multi_round: true
context_bundle:
  required: [artifact, what_to_focus_on]
  fields:
    artifact: { type: string, description: "What to review" }
    what_to_focus_on: { type: string, description: "Areas to focus on" }
response_bundle:
  required: [overall, must_change, suggestions]
  fields:
    overall: { type: string, description: "Overall assessment" }
    must_change: { type: array, description: "Blocking issues" }
    suggestions: { type: array, description: "Non-blocking suggestions" }
defaults:
  visibility: private
attachments:
  - slot: diff-file
    required: false
    convention: "{branch-name}.diff"
    description: Code changes to review
  - slot: screenshot
    required: true
    convention: "screenshot.png"
    description: Visual evidence
hooks:
  on_respond: update-ticket
---

# Review

Get structured feedback with blocking/advisory split.
`;

function seedFlatFilePacts(
  repoPath: string,
  pacts: { path: string; content: string }[],
): void {
  // Clear pact-store/ to remove default pacts from createTestRepos
  const pactStorePath = join(repoPath, "pact-store");
  rmSync(pactStorePath, { recursive: true, force: true });
  mkdirSync(pactStorePath, { recursive: true });

  for (const pact of pacts) {
    const fullPath = join(repoPath, "pact-store", pact.path);
    mkdirSync(join(fullPath, ".."), { recursive: true });
    writeFileSync(fullPath, pact.content);
  }
  execSync(
    `cd "${repoPath}" && git add -A && git commit -m "seed flat-file pacts" && git push`,
    { stdio: "pipe" },
  );
}

// ============================================================================
// Priority 1: response-loader.ts
// ============================================================================

describe("Mutation hardening: response-loader.ts", () => {
  let ctx: ReturnType<typeof createGroupTestRepos>;

  afterEach(() => {
    ctx?.cleanup();
  });

  it("check_status on pending request returns status without response (tolerateMissing=default)", async () => {
    ctx = createGroupTestRepos();

    const aliceServer = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });

    let requestId: string;

    await given("Alice sends a request to Bob (no one has responded yet)", async () => {
      const result = (await aliceServer.callTool("pact_do", {
        action: "send",
        request_type: "sanity-check",
        recipients: ["bob"],
        context_bundle: {
          customer: "Acme Corp",
          question: "Is this right?",
        },
      })) as { request_id: string };
      requestId = result.request_id;
    });

    await thenAssert("status returns pending with no response or responses field", async () => {
      const status = (await aliceServer.callTool("pact_do", {
        action: "check_status",
        request_id: requestId,
      })) as any;
      expect(status.status).toBe("pending");
      expect(status.response).toBeUndefined();
      expect(status.responses).toBeUndefined();
    });
  });

  it("check_status on completed single-recipient request returns exact response content", async () => {
    ctx = createGroupTestRepos();

    const aliceServer = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
    const bobServer = createPactServer({ repoPath: ctx.bobRepo, userId: "bob" });

    let requestId: string;

    await given("Alice sends to Bob with old-format single recipient", () => {
      seedPendingRequest(ctx.aliceRepo, "req-20260224-100000-alice-flat1", "bob", "alice");
    });

    await when("Bob responds", async () => {
      requestId = "req-20260224-100000-alice-flat1";
      gitPull(ctx.bobRepo);
      await bobServer.callTool("pact_do", {
        action: "respond",
        request_id: requestId,
        response_bundle: {
          answer: "YES -- confirmed the pattern matches",
          evidence: "Compared with ZD-5000",
          concerns: "None",
          recommendation: "Ship it",
        },
      });
    });

    await thenAssert("status returns exact response_bundle values", async () => {
      gitPull(ctx.aliceRepo);
      const status = (await aliceServer.callTool("pact_do", {
        action: "check_status",
        request_id: requestId,
      })) as any;
      expect(status.status).toBe("completed");
      expect(status.response).toBeDefined();
      expect(status.response.response_bundle.answer).toBe("YES -- confirmed the pattern matches");
      expect(status.response.response_bundle.evidence).toBe("Compared with ZD-5000");
      expect(status.response.response_bundle.concerns).toBe("None");
      expect(status.response.response_bundle.recommendation).toBe("Ship it");
      expect(status.response.responder.user_id).toBe("bob");
      expect(status.responses).toBeUndefined();
    });
  });

  it("check_status on completed group request with multiple responses returns all response content", async () => {
    ctx = createGroupTestRepos();

    const aliceServer = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
    const bobServer = createPactServer({ repoPath: ctx.bobRepo, userId: "bob" });
    const carolServer = createPactServer({ repoPath: ctx.carolRepo, userId: "carol" });

    let requestId: string;

    await given("Alice sends group request and both Bob and Carol respond", async () => {
      const result = (await aliceServer.callTool("pact_do", {
        action: "send",
        request_type: "sanity-check",
        recipients: ["bob", "carol"],
        context_bundle: { customer: "Acme Corp", question: "Check this?" },
      })) as { request_id: string };
      requestId = result.request_id;

      gitPull(ctx.bobRepo);
      await bobServer.callTool("pact_do", {
        action: "respond",
        request_id: requestId,
        response_bundle: { answer: "Bob says YES" },
      });

      gitPull(ctx.carolRepo);
      await carolServer.callTool("pact_do", {
        action: "respond",
        request_id: requestId,
        response_bundle: { answer: "Carol says PARTIALLY" },
      });
    });

    await thenAssert("status returns exactly 2 responses with correct content", async () => {
      gitPull(ctx.aliceRepo);
      const status = (await aliceServer.callTool("pact_do", {
        action: "check_status",
        request_id: requestId,
      })) as any;
      expect(status.status).toBe("completed");
      expect(status.responses).toBeDefined();
      expect(status.responses).toHaveLength(2);
      const answers = status.responses.map((r: any) => r.response_bundle.answer).sort();
      expect(answers).toEqual(["Bob says YES", "Carol says PARTIALLY"]);
      // Single response should not be present
      expect(status.response).toBeUndefined();
    });
  });

  it("check_status on group request where only one person responded returns responses array with length 1", async () => {
    ctx = createGroupTestRepos();

    const aliceServer = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
    const bobServer = createPactServer({ repoPath: ctx.bobRepo, userId: "bob" });

    let requestId: string;

    await given("Alice sends group request to bob and carol, only bob responds", async () => {
      const result = (await aliceServer.callTool("pact_do", {
        action: "send",
        request_type: "sanity-check",
        recipients: ["bob", "carol"],
        context_bundle: { customer: "Acme Corp", question: "Partial response test" },
      })) as { request_id: string };
      requestId = result.request_id;

      gitPull(ctx.bobRepo);
      await bobServer.callTool("pact_do", {
        action: "respond",
        request_id: requestId,
        response_bundle: { answer: "Only Bob responded" },
      });
    });

    await thenAssert("status returns responses with exactly 1 entry containing correct data", async () => {
      gitPull(ctx.aliceRepo);
      const status = (await aliceServer.callTool("pact_do", {
        action: "check_status",
        request_id: requestId,
      })) as any;
      expect(status.status).toBe("completed");
      expect(status.responses).toBeDefined();
      expect(status.responses).toHaveLength(1);
      expect(status.responses[0].response_bundle.answer).toBe("Only Bob responded");
      expect(status.responses[0].responder.user_id).toBe("bob");
    });
  });
});

// ============================================================================
// Priority 2: pact-thread.ts
// ============================================================================

describe("Mutation hardening: pact-thread.ts", () => {
  let ctx: ReturnType<typeof createGroupTestRepos>;

  afterEach(() => {
    ctx?.cleanup();
  });

  it("view_thread for a request with no responses returns empty entries and no response/responses fields", async () => {
    ctx = createGroupTestRepos();

    const aliceServer = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });

    let requestId: string;

    await given("Alice sends a request that has not been responded to", async () => {
      const result = (await aliceServer.callTool("pact_do", {
        action: "send",
        request_type: "sanity-check",
        recipients: ["bob"],
        context_bundle: { customer: "Acme Corp", question: "Thread pending test" },
      })) as { request_id: string };
      requestId = result.request_id;
    });

    await thenAssert("thread has 1 entry with no response, no top-level response/responses", async () => {
      const thread = (await aliceServer.callTool("pact_do", {
        action: "view_thread",
        thread_id: requestId,
      })) as any;
      expect(thread.thread_id).toBe(requestId);
      expect(thread.entries).toHaveLength(1);
      expect(thread.entries[0].request).toBeDefined();
      expect(thread.entries[0].response).toBeUndefined();
      expect(thread.entries[0].responses).toBeUndefined();
      // Top-level aggregation should not include response or responses
      expect(thread.response).toBeUndefined();
      expect(thread.responses).toBeUndefined();
      // Summary
      expect(thread.summary.round_count).toBe(1);
      expect(thread.summary.latest_status).toBe("pending");
      expect(thread.summary.request_type).toBe("sanity-check");
    });
  });

  it("view_thread with single response returns top-level response (not responses array)", async () => {
    ctx = createGroupTestRepos();

    const aliceServer = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
    const bobServer = createPactServer({ repoPath: ctx.bobRepo, userId: "bob" });

    let requestId: string;

    await given("Alice sends a single-recipient request and Bob responds", async () => {
      const result = (await aliceServer.callTool("pact_do", {
        action: "send",
        request_type: "sanity-check",
        recipient: "bob",
        context_bundle: { customer: "Acme Corp", question: "Single response thread" },
      })) as { request_id: string };
      requestId = result.request_id;

      gitPull(ctx.bobRepo);
      await bobServer.callTool("pact_do", {
        action: "respond",
        request_id: requestId,
        response_bundle: { answer: "Single response for thread" },
      });
    });

    await thenAssert("thread returns response at top-level (not responses[])", async () => {
      gitPull(ctx.aliceRepo);
      const thread = (await aliceServer.callTool("pact_do", {
        action: "view_thread",
        thread_id: requestId,
      })) as any;
      expect(thread.thread_id).toBe(requestId);
      expect(thread.response).toBeDefined();
      expect(thread.response.response_bundle.answer).toBe("Single response for thread");
      expect(thread.response.responder.user_id).toBe("bob");
      expect(thread.responses).toBeUndefined();
    });
  });

  it("view_thread with multiple responses returns top-level responses array (not response)", async () => {
    ctx = createGroupTestRepos();

    const aliceServer = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
    const bobServer = createPactServer({ repoPath: ctx.bobRepo, userId: "bob" });
    const carolServer = createPactServer({ repoPath: ctx.carolRepo, userId: "carol" });

    let requestId: string;

    await given("Alice sends group request, Bob and Carol both respond", async () => {
      const result = (await aliceServer.callTool("pact_do", {
        action: "send",
        request_type: "sanity-check",
        recipients: ["bob", "carol"],
        context_bundle: { customer: "Acme Corp", question: "Multi response thread test" },
      })) as { request_id: string };
      requestId = result.request_id;

      gitPull(ctx.bobRepo);
      await bobServer.callTool("pact_do", {
        action: "respond",
        request_id: requestId,
        response_bundle: { answer: "Bob thread answer" },
      });

      gitPull(ctx.carolRepo);
      await carolServer.callTool("pact_do", {
        action: "respond",
        request_id: requestId,
        response_bundle: { answer: "Carol thread answer" },
      });
    });

    await thenAssert("thread returns responses[] at top-level with both entries", async () => {
      gitPull(ctx.aliceRepo);
      const thread = (await aliceServer.callTool("pact_do", {
        action: "view_thread",
        thread_id: requestId,
      })) as any;
      expect(thread.responses).toBeDefined();
      expect(thread.responses).toHaveLength(2);
      const answers = thread.responses.map((r: any) => r.response_bundle.answer).sort();
      expect(answers).toEqual(["Bob thread answer", "Carol thread answer"]);
      // Single response field should NOT be present
      expect(thread.response).toBeUndefined();
    });
  });

  it("view_thread with unknown thread_id returns empty entries and descriptive message", async () => {
    ctx = createGroupTestRepos();

    const aliceServer = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });

    await thenAssert("thread returns empty structure with message", async () => {
      const thread = (await aliceServer.callTool("pact_do", {
        action: "view_thread",
        thread_id: "nonexistent-thread-id",
      })) as any;
      expect(thread.thread_id).toBe("nonexistent-thread-id");
      expect(thread.entries).toHaveLength(0);
      expect(thread.summary.participants).toEqual([]);
      expect(thread.summary.round_count).toBe(0);
      expect(thread.summary.latest_status).toBe("unknown");
      expect(thread.summary.request_type).toBe("unknown");
      expect(thread.message).toBeDefined();
      expect(thread.message).toContain("No requests found");
    });
  });

  it("view_thread using request_id alias works the same as thread_id", async () => {
    ctx = createGroupTestRepos();

    const aliceServer = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });

    let requestId: string;

    await given("Alice sends a request", async () => {
      const result = (await aliceServer.callTool("pact_do", {
        action: "send",
        request_type: "sanity-check",
        recipients: ["bob"],
        context_bundle: { customer: "Acme Corp", question: "Alias test" },
      })) as { request_id: string };
      requestId = result.request_id;
    });

    await thenAssert("view_thread with request_id param finds the same thread", async () => {
      const thread = (await aliceServer.callTool("pact_do", {
        action: "view_thread",
        request_id: requestId,
      })) as any;
      expect(thread.thread_id).toBe(requestId);
      expect(thread.entries).toHaveLength(1);
      expect(thread.summary.round_count).toBe(1);
    });
  });

  it("view_thread summary includes recipients[] participants", async () => {
    ctx = createGroupTestRepos();

    const aliceServer = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
    const bobServer = createPactServer({ repoPath: ctx.bobRepo, userId: "bob" });

    let requestId: string;

    await given("Alice sends a group request to bob and carol, bob responds", async () => {
      const result = (await aliceServer.callTool("pact_do", {
        action: "send",
        request_type: "sanity-check",
        recipients: ["bob", "carol"],
        context_bundle: { customer: "Acme Corp", question: "Participant test" },
      })) as { request_id: string };
      requestId = result.request_id;

      gitPull(ctx.bobRepo);
      await bobServer.callTool("pact_do", {
        action: "respond",
        request_id: requestId,
        response_bundle: { answer: "Participant check" },
      });
    });

    await thenAssert("thread summary participants include sender, all recipients, and responder", async () => {
      gitPull(ctx.aliceRepo);
      const thread = (await aliceServer.callTool("pact_do", {
        action: "view_thread",
        thread_id: requestId,
      })) as any;
      // Participants should include alice (sender), bob (recipient+responder), carol (recipient)
      expect(thread.summary.participants).toContain("alice");
      expect(thread.summary.participants).toContain("bob");
      expect(thread.summary.participants).toContain("carol");
      // Should be sorted
      const sorted = [...thread.summary.participants].sort();
      expect(thread.summary.participants).toEqual(sorted);
    });
  });

  it("view_thread with completed request shows completed status in summary", async () => {
    ctx = createGroupTestRepos();

    const aliceServer = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
    const bobServer = createPactServer({ repoPath: ctx.bobRepo, userId: "bob" });

    let requestId: string;

    await given("Alice sends request and Bob responds (completing it)", async () => {
      const result = (await aliceServer.callTool("pact_do", {
        action: "send",
        request_type: "sanity-check",
        recipient: "bob",
        context_bundle: { customer: "Acme Corp", question: "Completed status thread test" },
      })) as { request_id: string };
      requestId = result.request_id;

      gitPull(ctx.bobRepo);
      await bobServer.callTool("pact_do", {
        action: "respond",
        request_id: requestId,
        response_bundle: { answer: "Done" },
      });
    });

    await thenAssert("thread summary shows completed status", async () => {
      gitPull(ctx.aliceRepo);
      const thread = (await aliceServer.callTool("pact_do", {
        action: "view_thread",
        thread_id: requestId,
      })) as any;
      expect(thread.summary.latest_status).toBe("completed");
    });
  });
});

// ============================================================================
// Priority 3: pact-loader.ts (flat-file store)
// ============================================================================

describe("Mutation hardening: pact-loader.ts", () => {
  let ctx: TestRepoContext;

  afterEach(() => {
    ctx?.cleanup();
  });

  it("pact with multi_round: false is included with multi_round exactly false", async () => {
    ctx = createTestRepos();

    await given("pact-store has ask pact with multi_round: false", () => {
      seedFlatFilePacts(ctx.aliceRepo, [
        { path: "ask.md", content: ASK_PACT },
      ]);
    });

    let result: any;

    await when("an agent calls pact_discover", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_discover", {});
    });

    await thenAssert("the ask pact has multi_round set to exactly false", () => {
      const ask = result.pacts.find((p: any) => p.name === "ask");
      expect(ask).toBeDefined();
      expect(ask.multi_round).toBe(false);
    });
  });

  it("pact with all optional fields present includes them in catalog entry", async () => {
    ctx = createTestRepos();

    const fullPact = `---
name: full-featured
description: Pact with every optional field
version: "2.0.0"
scope: team
when_to_use:
  - Testing all optional fields
multi_round: true
registered_for: [team:platform, repo:core]
defaults:
  visibility: private
  claimable: true
attachments:
  - slot: screenshot
    required: true
    convention: "screenshot.png"
    description: A screenshot attachment
context_bundle:
  required: [what]
  fields:
    what: { type: string, description: "What to do" }
response_bundle:
  required: [status]
  fields:
    status: { type: string, description: "Outcome" }
---

# Full Featured
`;

    await given("pact-store has a pact with all optional fields", () => {
      seedFlatFilePacts(ctx.aliceRepo, [
        { path: "full-featured.md", content: fullPact },
      ]);
    });

    let result: any;

    await when("an agent calls pact_discover", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_discover", {});
    });

    await thenAssert("all optional fields are present with correct values", () => {
      const pact = result.pacts.find((p: any) => p.name === "full-featured");
      expect(pact).toBeDefined();
      expect(pact.version).toBeUndefined(); // version is not in toEntry
      expect(pact.scope).toBe("team");
      expect(pact.multi_round).toBe(true);
      expect(pact.registered_for).toEqual(["team:platform", "repo:core"]);
      expect(pact.defaults).toEqual({ visibility: "private", claimable: true });
      expect(pact.attachments).toHaveLength(1);
      expect(pact.attachments[0].slot).toBe("screenshot");
      expect(pact.attachments[0].required).toBe(true);
      expect(pact.attachments[0].convention).toBe("screenshot.png");
      expect(pact.attachments[0].description).toBe("A screenshot attachment");
      expect(pact.has_hooks).toBe(false);
    });
  });

  it("pact with empty attachments array omits attachments from output", async () => {
    ctx = createTestRepos();

    const emptyAttachmentsPact = `---
name: no-attachments
description: Pact with empty attachments array
scope: global
when_to_use:
  - Testing empty attachments
attachments: []
context_bundle:
  required: [what]
  fields:
    what: { type: string, description: "What to do" }
response_bundle:
  required: []
  fields: {}
---

# No Attachments
`;

    await given("pact-store has a pact with empty attachments array", () => {
      seedFlatFilePacts(ctx.aliceRepo, [
        { path: "no-attachments.md", content: emptyAttachmentsPact },
      ]);
    });

    let result: any;

    await when("an agent calls pact_discover", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_discover", {});
    });

    await thenAssert("attachments field is not present (empty array treated as undefined)", () => {
      const pact = result.pacts.find((p: any) => p.name === "no-attachments");
      expect(pact).toBeDefined();
      expect(pact.attachments).toBeUndefined();
    });
  });

  it("inheritance merge where child has response_bundle fields uses child response_bundle", async () => {
    ctx = createTestRepos();

    await given("pact-store has request base and backend variant with response_bundle fields", () => {
      seedFlatFilePacts(ctx.aliceRepo, [
        { path: "request.md", content: REQUEST_PACT },
        { path: "backend/request:backend.md", content: REQUEST_BACKEND_VARIANT },
      ]);
    });

    let result: any;

    await when("an agent calls pact_discover", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_discover", {});
    });

    await thenAssert("variant uses child response_bundle since child has fields", () => {
      const variant = result.pacts.find((p: any) => p.name === "request:backend");
      expect(variant).toBeDefined();
      // Child has response_bundle fields (status, result, deploy_notes), so child's should be used
      expect(variant.response_bundle.required).toContain("deploy_notes");
      expect(variant.response_bundle.fields).toHaveProperty("deploy_notes");
      // Child also has status and result
      expect(variant.response_bundle.required).toContain("status");
      expect(variant.response_bundle.required).toContain("result");
    });
  });

  it("dot-prefixed entries in pact-store directory are skipped", async () => {
    ctx = createTestRepos();

    await given("pact-store has a .hidden directory and a valid pact", () => {
      seedFlatFilePacts(ctx.aliceRepo, [
        { path: "ask.md", content: ASK_PACT },
      ]);
      // Add a dot-prefixed directory with a pact inside
      const hiddenDir = join(ctx.aliceRepo, "pact-store", ".hidden");
      mkdirSync(hiddenDir, { recursive: true });
      writeFileSync(join(hiddenDir, "secret.md"), ASK_PACT.replace("name: ask", "name: secret"));
      execSync(
        `cd "${ctx.aliceRepo}" && git add -A && git commit -m "add hidden dir" && git push`,
        { stdio: "pipe" },
      );
    });

    let result: any;

    await when("an agent calls pact_discover", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_discover", {});
    });

    await thenAssert("pacts from dot-prefixed directories are excluded", () => {
      const names = result.pacts.map((p: any) => p.name);
      expect(names).toContain("ask");
      expect(names).not.toContain("secret");
    });
  });

  it("path traversal entry with .. in directory name is skipped", async () => {
    ctx = createTestRepos();

    await given("pact-store has a directory entry containing '..'", () => {
      seedFlatFilePacts(ctx.aliceRepo, [
        { path: "ask.md", content: ASK_PACT },
      ]);
      // Create a directory with path-traversal-like name
      const traversalDir = join(ctx.aliceRepo, "pact-store", "..sneaky");
      mkdirSync(traversalDir, { recursive: true });
      writeFileSync(
        join(traversalDir, "evil.md"),
        ASK_PACT.replace("name: ask", "name: evil"),
      );
      execSync(
        `cd "${ctx.aliceRepo}" && git add -A && git commit -m "add traversal dir" && git push`,
        { stdio: "pipe" },
      );
    });

    let result: any;

    await when("an agent calls pact_discover", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_discover", {});
    });

    await thenAssert("pacts from path-traversal directories are excluded", () => {
      const names = result.pacts.map((p: any) => p.name);
      expect(names).toContain("ask");
      expect(names).not.toContain("evil");
    });
  });

  it("review pact with multiple attachment slots returns all slots", async () => {
    ctx = createTestRepos();

    await given("pact-store has a review pact with 2 attachment slots", () => {
      seedFlatFilePacts(ctx.aliceRepo, [
        { path: "review.md", content: REVIEW_PACT },
      ]);
    });

    let result: any;

    await when("an agent calls pact_discover", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_discover", {});
    });

    await thenAssert("review pact has exactly 2 attachment slots with correct details", () => {
      const review = result.pacts.find((p: any) => p.name === "review");
      expect(review).toBeDefined();
      expect(review.attachments).toHaveLength(2);
      const diffSlot = review.attachments.find((a: any) => a.slot === "diff-file");
      const screenshotSlot = review.attachments.find((a: any) => a.slot === "screenshot");
      expect(diffSlot).toBeDefined();
      expect(diffSlot.required).toBe(false);
      expect(diffSlot.convention).toBe("{branch-name}.diff");
      expect(screenshotSlot).toBeDefined();
      expect(screenshotSlot.required).toBe(true);
    });
  });

  it("pact with empty when_to_use returns empty array", async () => {
    ctx = createTestRepos();

    const noWhenPact = `---
name: minimal
description: Pact with no when_to_use
scope: global
context_bundle:
  required: []
  fields: {}
response_bundle:
  required: []
  fields: {}
---

# Minimal
`;

    await given("pact-store has a pact without when_to_use", () => {
      seedFlatFilePacts(ctx.aliceRepo, [
        { path: "minimal.md", content: noWhenPact },
      ]);
    });

    let result: any;

    await when("an agent calls pact_discover", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_discover", {});
    });

    await thenAssert("pact when_to_use is an empty array", () => {
      const pact = result.pacts.find((p: any) => p.name === "minimal");
      expect(pact).toBeDefined();
      expect(pact.when_to_use).toEqual([]);
    });
  });

  it("pact with empty name string is excluded from catalog", async () => {
    ctx = createTestRepos();

    const emptyNamePact = `---
name: ""
description: Pact with empty name
scope: global
context_bundle:
  required: []
  fields: {}
response_bundle:
  required: []
  fields: {}
---

# Empty Name
`;

    await given("pact-store has a pact with empty string name", () => {
      seedFlatFilePacts(ctx.aliceRepo, [
        { path: "empty-name.md", content: emptyNamePact },
        { path: "ask.md", content: ASK_PACT },
      ]);
    });

    let result: any;

    await when("an agent calls pact_discover", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_discover", {});
    });

    await thenAssert("the empty-name pact is excluded but valid pacts remain", () => {
      expect(result.pacts).toHaveLength(1);
      expect(result.pacts[0].name).toBe("ask");
    });
  });

  it("pact without frontmatter delimiters is excluded", async () => {
    ctx = createTestRepos();

    const noFrontmatter = `# Just Markdown

This file has no YAML frontmatter delimiters.

## Context Bundle Fields
| Field | Required | Description |
|-------|----------|-------------|
`;

    await given("pact-store has an md file without frontmatter", () => {
      seedFlatFilePacts(ctx.aliceRepo, [
        { path: "no-frontmatter.md", content: noFrontmatter },
        { path: "ask.md", content: ASK_PACT },
      ]);
    });

    let result: any;

    await when("an agent calls pact_discover", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_discover", {});
    });

    await thenAssert("only the valid pact is returned", () => {
      const names = result.pacts.map((p: any) => p.name);
      expect(names).toEqual(["ask"]);
    });
  });
});

// ============================================================================
// Priority 4: pact-discover.ts
// ============================================================================

describe("Mutation hardening: pact-discover.ts", () => {
  let ctx: TestRepoContext;

  afterEach(() => {
    ctx?.cleanup();
  });

  it("compressed format uses pipe delimiter, arrow character, and correct field order", async () => {
    ctx = createTestRepos();

    await given("pact-store has ask pact", () => {
      seedFlatFilePacts(ctx.aliceRepo, [
        { path: "ask.md", content: ASK_PACT },
      ]);
    });

    let result: any;

    await when("an agent calls pact_discover with format: 'compressed'", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_discover", { format: "compressed" });
    });

    await thenAssert("catalog line has exact format: name|description|scope|ctx_req->res_req", () => {
      const lines = result.catalog.split("\n").filter((l: string) => l.trim());
      expect(lines).toHaveLength(1);
      const line = lines[0];
      // Should contain the arrow character (Unicode right arrow)
      expect(line).toContain("\u2192");
      // Parse fields
      const parts = line.split("|");
      expect(parts).toHaveLength(4);
      expect(parts[0]).toBe("ask");
      expect(parts[1]).toBe("Get input that unblocks current work");
      expect(parts[2]).toBe("global");
      // Fourth part: context_required→response_required
      expect(parts[3]).toContain("question");
      expect(parts[3]).toContain("answer");
      // Verify arrow separates context from response required
      const [ctxReq, resReq] = parts[3].split("\u2192");
      expect(ctxReq).toBe("question");
      expect(resReq).toBe("answer");
    });
  });

  it("compressed format with scope filter produces filtered output", async () => {
    ctx = createTestRepos();

    const teamPact = `---
name: deploy-approval
description: Request deployment approval from platform team
scope: team
when_to_use:
  - You need approval before deploying to production
context_bundle:
  required: [service, environment]
  fields:
    service: { type: string, description: "Service to deploy" }
    environment: { type: string, description: "Target environment" }
response_bundle:
  required: [approved]
  fields:
    approved: { type: boolean, description: "Whether deployment is approved" }
---

# Deploy Approval
`;

    await given("pact-store has global and team-scoped pacts", () => {
      seedFlatFilePacts(ctx.aliceRepo, [
        { path: "ask.md", content: ASK_PACT },
        { path: "deploy-approval.md", content: teamPact },
      ]);
    });

    let result: any;

    await when("an agent calls pact_discover with format: 'compressed' and scope: 'team'", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_discover", { format: "compressed", scope: "team" });
    });

    await thenAssert("only team-scoped pact appears in compressed catalog", () => {
      const lines = result.catalog.split("\n").filter((l: string) => l.trim());
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain("deploy-approval");
      expect(lines[0]).not.toContain("ask");
    });
  });

  it("query filter combined with scope filter returns intersection", async () => {
    ctx = createTestRepos();

    const teamPact1 = `---
name: deploy-approval
description: Request deployment approval
scope: team
when_to_use:
  - deployment approvals
context_bundle:
  required: [service]
  fields:
    service: { type: string, description: "Service" }
response_bundle:
  required: [approved]
  fields:
    approved: { type: boolean, description: "Approved" }
---
# Deploy Approval
`;

    const teamPact2 = `---
name: team-standup
description: Daily standup notes
scope: team
when_to_use:
  - daily standup
context_bundle:
  required: [updates]
  fields:
    updates: { type: string, description: "Updates" }
response_bundle:
  required: []
  fields: {}
---
# Standup
`;

    await given("pact-store has two team pacts and one global pact", () => {
      seedFlatFilePacts(ctx.aliceRepo, [
        { path: "ask.md", content: ASK_PACT },
        { path: "deploy-approval.md", content: teamPact1 },
        { path: "team-standup.md", content: teamPact2 },
      ]);
    });

    let result: any;

    await when("an agent filters by scope: 'team' and query: 'deploy'", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_discover", { scope: "team", query: "deploy" });
    });

    await thenAssert("only the team pact matching the query is returned", () => {
      expect(result.pacts).toHaveLength(1);
      expect(result.pacts[0].name).toBe("deploy-approval");
    });
  });

  it("toEntry maps all extended metadata fields correctly", async () => {
    ctx = createTestRepos();

    await given("pact-store has a review pact with all extended fields", () => {
      seedFlatFilePacts(ctx.aliceRepo, [
        { path: "review.md", content: REVIEW_PACT },
      ]);
    });

    let result: any;

    await when("an agent calls pact_discover", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_discover", {});
    });

    await thenAssert("catalog entry includes all extended fields with correct types", () => {
      const review = result.pacts.find((p: any) => p.name === "review");
      // Core fields
      expect(review.name).toBe("review");
      expect(review.description).toBe("Get structured feedback with blocking/advisory split");
      expect(review.when_to_use).toEqual(["You want structured review feedback"]);
      expect(review.has_hooks).toBe(true);
      // Extended fields
      expect(review.scope).toBe("global");
      expect(review.multi_round).toBe(true);
      expect(review.defaults).toEqual({ visibility: "private" });
      expect(review.attachments).toHaveLength(2);
      // Bundle fields
      expect(review.context_bundle.required).toEqual(["artifact", "what_to_focus_on"]);
      expect(review.context_bundle.fields).toHaveProperty("artifact");
      expect(review.response_bundle.required).toEqual(["overall", "must_change", "suggestions"]);
    });
  });

  it("compressed catalog with no scope returns empty string for scope field", async () => {
    ctx = createTestRepos();

    const noScopePact = `---
name: quick-ask
description: A quick question with no scope set
when_to_use:
  - Quick questions
context_bundle:
  required: [question]
  fields:
    question: { type: string, description: "The question" }
response_bundle:
  required: [answer]
  fields:
    answer: { type: string, description: "The answer" }
---

# Quick Ask
`;

    await given("pact-store has a pact without scope", () => {
      seedFlatFilePacts(ctx.aliceRepo, [
        { path: "quick-ask.md", content: noScopePact },
      ]);
    });

    let result: any;

    await when("an agent calls pact_discover with format: 'compressed'", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_discover", { format: "compressed" });
    });

    await thenAssert("the scope position in pipe-delimited output is empty", () => {
      const lines = result.catalog.split("\n").filter((l: string) => l.trim());
      expect(lines).toHaveLength(1);
      const parts = lines[0].split("|");
      expect(parts[0]).toBe("quick-ask");
      // scope is index 2, should be empty string
      expect(parts[2]).toBe("");
    });
  });

  it("discover results are sorted by name for consistent ordering", async () => {
    ctx = createTestRepos();

    await given("pact-store has pacts that would sort in reverse alphabetical order", () => {
      seedFlatFilePacts(ctx.aliceRepo, [
        { path: "ask.md", content: ASK_PACT },
        { path: "request.md", content: REQUEST_PACT },
      ]);
    });

    let result: any;

    await when("an agent calls pact_discover", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_discover", {});
    });

    await thenAssert("pacts are returned in alphabetical name order", () => {
      const names = result.pacts.map((p: any) => p.name);
      expect(names).toEqual(["ask", "request"]);
      // Verify it's actually sorted (not just by chance)
      const sorted = [...names].sort();
      expect(names).toEqual(sorted);
    });
  });
});

// ============================================================================
// Cross-cutting: malformed envelope handling
// ============================================================================

describe("Mutation hardening: malformed envelope handling", () => {
  let ctx: ReturnType<typeof createGroupTestRepos>;

  afterEach(() => {
    ctx?.cleanup();
  });

  it("thread scan skips malformed envelopes without crashing", async () => {
    ctx = createGroupTestRepos();

    const aliceServer = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });

    let requestId: string;

    await given("a valid request exists and a malformed file is in the same directory", async () => {
      const result = (await aliceServer.callTool("pact_do", {
        action: "send",
        request_type: "sanity-check",
        recipients: ["bob"],
        context_bundle: { customer: "Acme Corp", question: "Malformed neighbor test" },
      })) as { request_id: string };
      requestId = result.request_id;

      // Write a malformed envelope file into pending directory
      writeFileSync(
        join(ctx.aliceRepo, "requests", "pending", "malformed-junk.json"),
        '{"not_a_valid": "envelope", "missing": "required_fields"}',
      );
      execSync(
        `cd "${ctx.aliceRepo}" && git add -A && git commit -m "add malformed file" && git push`,
        { stdio: "pipe" },
      );
    });

    await thenAssert("view_thread still returns the valid request entry", async () => {
      const thread = (await aliceServer.callTool("pact_do", {
        action: "view_thread",
        thread_id: requestId,
      })) as any;
      expect(thread.entries).toHaveLength(1);
      expect(thread.entries[0].request.request_id).toBe(requestId);
    });
  });

  it("malformed response envelope in per-respondent directory is still returned (raw)", async () => {
    ctx = createGroupTestRepos();

    const aliceServer = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
    const bobServer = createPactServer({ repoPath: ctx.bobRepo, userId: "bob" });

    let requestId: string;

    await given("a group request exists and bob's response file is manually corrupted", async () => {
      const result = (await aliceServer.callTool("pact_do", {
        action: "send",
        request_type: "sanity-check",
        recipients: ["bob", "carol"],
        context_bundle: { customer: "Acme Corp", question: "Corrupt response test" },
      })) as { request_id: string };
      requestId = result.request_id;

      // Bob responds normally first
      gitPull(ctx.bobRepo);
      await bobServer.callTool("pact_do", {
        action: "respond",
        request_id: requestId,
        response_bundle: { answer: "Normal response" },
      });

      // Now manually add a malformed response file for carol
      gitPull(ctx.aliceRepo);
      const responseDir = join(ctx.aliceRepo, "responses", requestId);
      writeFileSync(
        join(responseDir, "carol.json"),
        '{"malformed": true, "not_a_valid_response": "missing responder and responded_at"}',
      );
      execSync(
        `cd "${ctx.aliceRepo}" && git add -A && git commit -m "add malformed carol response" && git push`,
        { stdio: "pipe" },
      );
    });

    await thenAssert("status returns both responses, malformed one included as raw data", async () => {
      gitPull(ctx.aliceRepo);
      const status = (await aliceServer.callTool("pact_do", {
        action: "check_status",
        request_id: requestId,
      })) as any;
      expect(status.responses).toBeDefined();
      expect(status.responses).toHaveLength(2);
      // One should be the valid response from bob
      const bobResponse = status.responses.find((r: any) => r.responder?.user_id === "bob");
      expect(bobResponse).toBeDefined();
      // The other should be the raw malformed data (still included, not dropped)
      const carolResponse = status.responses.find((r: any) => r.malformed === true);
      expect(carolResponse).toBeDefined();
      expect(carolResponse.not_a_valid_response).toBe("missing responder and responded_at");
    });
  });
});

// ============================================================================
// Priority 5: response-loader.ts — tolerateMissing branch hardening
// ============================================================================

describe("Mutation hardening: response-loader tolerateMissing branch", () => {
  let ctx: ReturnType<typeof createGroupTestRepos>;

  afterEach(() => {
    ctx?.cleanup();
  });

  it("check_status on completed request with missing response file throws (tolerateMissing=false default)", async () => {
    ctx = createGroupTestRepos();

    const aliceServer = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });

    await given("a request is manually moved to completed/ without a response file", () => {
      // Seed a request in pending
      seedPendingRequest(ctx.aliceRepo, "req-missing-response", "bob", "alice");
      // Manually move it to completed/ without creating a response file
      const pendingPath = join(ctx.aliceRepo, "requests", "pending", "req-missing-response.json");
      const completedPath = join(ctx.aliceRepo, "requests", "completed", "req-missing-response.json");
      const content = require("node:fs").readFileSync(pendingPath, "utf-8");
      writeFileSync(completedPath, content);
      require("node:fs").unlinkSync(pendingPath);
      execSync(
        `cd "${ctx.aliceRepo}" && git add -A && git commit -m "move to completed without response" && git push`,
        { stdio: "pipe" },
      );
    });

    await thenAssert("check_status throws an error about missing response file", async () => {
      await expect(
        aliceServer.callTool("pact_do", {
          action: "check_status",
          request_id: "req-missing-response",
        }),
      ).rejects.toThrow("Response file not found for request req-missing-response");
    });
  });

  it("valid response envelope has typed responder field, malformed response is returned raw", async () => {
    ctx = createGroupTestRepos();

    const aliceServer = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
    const bobServer = createPactServer({ repoPath: ctx.bobRepo, userId: "bob" });

    let requestId: string;

    await given("Alice sends a single-recipient request and Bob responds normally", async () => {
      const result = (await aliceServer.callTool("pact_do", {
        action: "send",
        request_type: "sanity-check",
        recipient: "bob",
        context_bundle: { customer: "Acme Corp", question: "Typed response test" },
      })) as { request_id: string };
      requestId = result.request_id;

      gitPull(ctx.bobRepo);
      await bobServer.callTool("pact_do", {
        action: "respond",
        request_id: requestId,
        response_bundle: { answer: "Typed answer" },
      });
    });

    await thenAssert("response has responder.user_id, responded_at, request_id, and response_bundle fields", async () => {
      gitPull(ctx.aliceRepo);
      const status = (await aliceServer.callTool("pact_do", {
        action: "check_status",
        request_id: requestId,
      })) as any;
      // Verify it was parsed by ResponseEnvelopeSchema (typed path)
      expect(status.response.responder).toBeDefined();
      expect(status.response.responder.user_id).toBe("bob");
      expect(status.response.responder.display_name).toBe("bob");
      expect(typeof status.response.responded_at).toBe("string");
      expect(status.response.request_id).toBe(requestId);
      expect(status.response.response_bundle.answer).toBe("Typed answer");
    });
  });

  it("flat response that is malformed (no responder) is returned raw with original fields", async () => {
    ctx = createGroupTestRepos();

    const aliceServer = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });

    let requestId: string;

    await given("a completed request has a malformed flat response file", () => {
      requestId = "req-malformed-flat";
      // Seed the request directly in completed/
      const envelope = {
        request_id: requestId,
        request_type: "sanity-check",
        sender: { user_id: "alice", display_name: "Alice" },
        recipient: { user_id: "bob", display_name: "Bob" },
        status: "completed",
        created_at: "2026-02-21T14:30:22.000Z",
        context_bundle: { question: "malformed flat test" },
      };
      writeFileSync(
        join(ctx.aliceRepo, "requests", "completed", `${requestId}.json`),
        JSON.stringify(envelope, null, 2),
      );
      // Write a malformed flat response (missing responder and responded_at)
      writeFileSync(
        join(ctx.aliceRepo, "responses", `${requestId}.json`),
        JSON.stringify({ raw_field: "I am raw data", another: 42 }),
      );
      execSync(
        `cd "${ctx.aliceRepo}" && git add -A && git commit -m "seed malformed flat response" && git push`,
        { stdio: "pipe" },
      );
    });

    await thenAssert("status returns the raw response object with its original fields", async () => {
      const status = (await aliceServer.callTool("pact_do", {
        action: "check_status",
        request_id: requestId,
      })) as any;
      expect(status.status).toBe("completed");
      expect(status.response).toBeDefined();
      // Raw fields are preserved (not parsed into typed response)
      expect(status.response.raw_field).toBe("I am raw data");
      expect(status.response.another).toBe(42);
      // Typed fields should NOT be present since it failed schema validation
      expect(status.response.responder).toBeUndefined();
      expect(status.response.responded_at).toBeUndefined();
    });
  });

  it("empty per-respondent directory returns empty object (no responses key)", async () => {
    ctx = createGroupTestRepos();

    const aliceServer = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });

    let requestId: string;

    await given("a completed request has an empty responses directory", () => {
      requestId = "req-empty-dir";
      // Seed the request in completed/
      const envelope = {
        request_id: requestId,
        request_type: "sanity-check",
        sender: { user_id: "alice", display_name: "Alice" },
        recipients: [{ user_id: "bob", display_name: "Bob" }],
        status: "completed",
        created_at: "2026-02-21T14:30:22.000Z",
        context_bundle: { question: "empty dir test" },
      };
      writeFileSync(
        join(ctx.aliceRepo, "requests", "completed", `${requestId}.json`),
        JSON.stringify(envelope, null, 2),
      );
      // Create the per-respondent directory but leave it empty
      mkdirSync(join(ctx.aliceRepo, "responses", requestId), { recursive: true });
      writeFileSync(join(ctx.aliceRepo, "responses", requestId, ".gitkeep"), "");
      execSync(
        `cd "${ctx.aliceRepo}" && git add -A && git commit -m "seed empty response dir" && git push`,
        { stdio: "pipe" },
      );
    });

    await thenAssert("status returns completed with no response or responses key", async () => {
      const status = (await aliceServer.callTool("pact_do", {
        action: "check_status",
        request_id: requestId,
      })) as any;
      expect(status.status).toBe("completed");
      // loadPerRespondentResponses returns {} when no valid response files
      // (only .gitkeep which would fail JSON parse — or empty after filtering)
      // The responses key should not be present
      expect(status.response).toBeUndefined();
      expect(status.responses).toBeUndefined();
    });
  });
});

// ============================================================================
// Priority 6: pact-thread.ts — multi-round, sort order, DIR_STATUS hardening
// ============================================================================

describe("Mutation hardening: pact-thread multi-round and sort order", () => {
  let ctx: ReturnType<typeof createGroupTestRepos>;

  afterEach(() => {
    ctx?.cleanup();
  });

  it("multi-round thread (2 entries each with a response) returns responses[] at top level", async () => {
    ctx = createGroupTestRepos();

    const aliceServer = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
    const bobServer = createPactServer({ repoPath: ctx.bobRepo, userId: "bob" });

    const threadId = "thread-multi-round";

    await given("two requests share the same thread_id, each with a single response", () => {
      // Round 1: alice sends, bob responds
      const envelope1 = {
        request_id: "req-round1",
        thread_id: threadId,
        request_type: "sanity-check",
        sender: { user_id: "alice", display_name: "Alice" },
        recipient: { user_id: "bob", display_name: "Bob" },
        status: "completed",
        created_at: "2026-02-20T10:00:00.000Z",
        context_bundle: { question: "Round 1 question" },
      };
      writeFileSync(
        join(ctx.aliceRepo, "requests", "completed", "req-round1.json"),
        JSON.stringify(envelope1, null, 2),
      );
      // Response for round 1
      writeFileSync(
        join(ctx.aliceRepo, "responses", "req-round1.json"),
        JSON.stringify({
          request_id: "req-round1",
          responder: { user_id: "bob", display_name: "Bob" },
          responded_at: "2026-02-20T11:00:00.000Z",
          response_bundle: { answer: "Round 1 answer" },
        }),
      );

      // Round 2: alice sends again on same thread, bob responds again
      const envelope2 = {
        request_id: "req-round2",
        thread_id: threadId,
        request_type: "sanity-check",
        sender: { user_id: "alice", display_name: "Alice" },
        recipient: { user_id: "bob", display_name: "Bob" },
        status: "completed",
        created_at: "2026-02-21T10:00:00.000Z",
        context_bundle: { question: "Round 2 question" },
      };
      writeFileSync(
        join(ctx.aliceRepo, "requests", "completed", "req-round2.json"),
        JSON.stringify(envelope2, null, 2),
      );
      // Response for round 2
      writeFileSync(
        join(ctx.aliceRepo, "responses", "req-round2.json"),
        JSON.stringify({
          request_id: "req-round2",
          responder: { user_id: "bob", display_name: "Bob" },
          responded_at: "2026-02-21T11:00:00.000Z",
          response_bundle: { answer: "Round 2 answer" },
        }),
      );

      execSync(
        `cd "${ctx.aliceRepo}" && git add -A && git commit -m "seed multi-round thread" && git push`,
        { stdio: "pipe" },
      );
    });

    await thenAssert("thread has 2 entries sorted chronologically, top-level responses[] with 2 entries", async () => {
      const thread = (await aliceServer.callTool("pact_do", {
        action: "view_thread",
        thread_id: threadId,
      })) as any;

      expect(thread.thread_id).toBe(threadId);
      expect(thread.summary.round_count).toBe(2);
      expect(thread.summary.latest_status).toBe("completed");
      expect(thread.entries).toHaveLength(2);

      // Verify chronological sort: round1 before round2
      expect((thread.entries[0].request as any).request_id).toBe("req-round1");
      expect((thread.entries[1].request as any).request_id).toBe("req-round2");

      // Each entry has a single response
      expect(thread.entries[0].response).toBeDefined();
      expect(thread.entries[0].response.response_bundle.answer).toBe("Round 1 answer");
      expect(thread.entries[1].response).toBeDefined();
      expect(thread.entries[1].response.response_bundle.answer).toBe("Round 2 answer");

      // Top-level: allResponses.length > 1, so responses[] should be present
      expect(thread.responses).toBeDefined();
      expect(thread.responses).toHaveLength(2);
      const answers = thread.responses.map((r: any) => r.response_bundle.answer);
      expect(answers).toEqual(["Round 1 answer", "Round 2 answer"]);

      // response (singular) should NOT be present when > 1 total
      expect(thread.response).toBeUndefined();
    });
  });

  it("thread entries with some having no response show correct aggregation", async () => {
    ctx = createGroupTestRepos();

    const aliceServer = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });

    const threadId = "thread-partial-resp";

    await given("a thread with 2 entries, only one has a response", () => {
      // Round 1: completed with response
      const envelope1 = {
        request_id: "req-partial1",
        thread_id: threadId,
        request_type: "sanity-check",
        sender: { user_id: "alice", display_name: "Alice" },
        recipient: { user_id: "bob", display_name: "Bob" },
        status: "completed",
        created_at: "2026-02-20T10:00:00.000Z",
        context_bundle: { question: "First question" },
      };
      writeFileSync(
        join(ctx.aliceRepo, "requests", "completed", "req-partial1.json"),
        JSON.stringify(envelope1, null, 2),
      );
      writeFileSync(
        join(ctx.aliceRepo, "responses", "req-partial1.json"),
        JSON.stringify({
          request_id: "req-partial1",
          responder: { user_id: "bob", display_name: "Bob" },
          responded_at: "2026-02-20T11:00:00.000Z",
          response_bundle: { answer: "Got it" },
        }),
      );

      // Round 2: pending, no response
      const envelope2 = {
        request_id: "req-partial2",
        thread_id: threadId,
        request_type: "sanity-check",
        sender: { user_id: "alice", display_name: "Alice" },
        recipient: { user_id: "bob", display_name: "Bob" },
        status: "pending",
        created_at: "2026-02-21T10:00:00.000Z",
        context_bundle: { question: "Second question" },
      };
      writeFileSync(
        join(ctx.aliceRepo, "requests", "pending", "req-partial2.json"),
        JSON.stringify(envelope2, null, 2),
      );

      execSync(
        `cd "${ctx.aliceRepo}" && git add -A && git commit -m "seed partial response thread" && git push`,
        { stdio: "pipe" },
      );
    });

    await thenAssert("thread has 2 entries, only one with response, top-level response (singular) since total=1", async () => {
      const thread = (await aliceServer.callTool("pact_do", {
        action: "view_thread",
        thread_id: threadId,
      })) as any;

      expect(thread.summary.round_count).toBe(2);
      // latest_status should be from the last entry chronologically (pending)
      expect(thread.summary.latest_status).toBe("pending");
      expect(thread.entries).toHaveLength(2);

      // First entry (completed) has a response
      expect(thread.entries[0].response).toBeDefined();
      expect(thread.entries[0].response.response_bundle.answer).toBe("Got it");

      // Second entry (pending) has no response
      expect(thread.entries[1].response).toBeUndefined();
      expect(thread.entries[1].responses).toBeUndefined();

      // Top-level: only 1 total response, singleResponse is set → response (singular)
      expect(thread.response).toBeDefined();
      expect(thread.response.response_bundle.answer).toBe("Got it");
      expect(thread.responses).toBeUndefined();
    });
  });

  it("thread sort order: entries are sorted by created_at ascending (earliest first)", async () => {
    ctx = createGroupTestRepos();

    const aliceServer = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });

    const threadId = "thread-sort-order";

    await given("two thread entries with later entry created first (reverse order in directory)", () => {
      // Write the LATER request first to ensure sort is by created_at, not directory order
      const laterEnvelope = {
        request_id: "req-later",
        thread_id: threadId,
        request_type: "sanity-check",
        sender: { user_id: "alice", display_name: "Alice" },
        recipient: { user_id: "bob", display_name: "Bob" },
        status: "pending",
        created_at: "2026-02-22T10:00:00.000Z",
        context_bundle: { question: "Later question" },
      };
      writeFileSync(
        join(ctx.aliceRepo, "requests", "pending", "req-later.json"),
        JSON.stringify(laterEnvelope, null, 2),
      );

      const earlierEnvelope = {
        request_id: "req-earlier",
        thread_id: threadId,
        request_type: "sanity-check",
        sender: { user_id: "alice", display_name: "Alice" },
        recipient: { user_id: "bob", display_name: "Bob" },
        status: "completed",
        created_at: "2026-02-20T10:00:00.000Z",
        context_bundle: { question: "Earlier question" },
      };
      writeFileSync(
        join(ctx.aliceRepo, "requests", "completed", "req-earlier.json"),
        JSON.stringify(earlierEnvelope, null, 2),
      );

      execSync(
        `cd "${ctx.aliceRepo}" && git add -A && git commit -m "seed sort order thread" && git push`,
        { stdio: "pipe" },
      );
    });

    await thenAssert("entries are ordered earliest-first regardless of directory scan order", async () => {
      const thread = (await aliceServer.callTool("pact_do", {
        action: "view_thread",
        thread_id: threadId,
      })) as any;

      expect(thread.entries).toHaveLength(2);
      expect((thread.entries[0].request as any).request_id).toBe("req-earlier");
      expect((thread.entries[1].request as any).request_id).toBe("req-later");
      // latest_status should be from the last (most recent) entry → pending
      expect(thread.summary.latest_status).toBe("pending");
    });
  });

  it("cancelled request in thread shows cancelled status", async () => {
    ctx = createGroupTestRepos();

    const aliceServer = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });

    const threadId = "thread-cancelled";

    await given("a thread entry is in the cancelled/ directory", () => {
      const envelope = {
        request_id: "req-cancelled",
        thread_id: threadId,
        request_type: "sanity-check",
        sender: { user_id: "alice", display_name: "Alice" },
        recipient: { user_id: "bob", display_name: "Bob" },
        status: "cancelled",
        created_at: "2026-02-20T10:00:00.000Z",
        context_bundle: { question: "Cancelled question" },
        cancel_reason: "No longer needed",
      };
      writeFileSync(
        join(ctx.aliceRepo, "requests", "cancelled", "req-cancelled.json"),
        JSON.stringify(envelope, null, 2),
      );
      execSync(
        `cd "${ctx.aliceRepo}" && git add -A && git commit -m "seed cancelled thread" && git push`,
        { stdio: "pipe" },
      );
    });

    await thenAssert("thread summary shows cancelled as latest_status", async () => {
      const thread = (await aliceServer.callTool("pact_do", {
        action: "view_thread",
        thread_id: threadId,
      })) as any;

      expect(thread.thread_id).toBe(threadId);
      expect(thread.summary.latest_status).toBe("cancelled");
      expect(thread.summary.round_count).toBe(1);
      expect(thread.entries).toHaveLength(1);
      expect(thread.response).toBeUndefined();
      expect(thread.responses).toBeUndefined();
    });
  });
});

// ============================================================================
// Priority 7: pact-loader.ts — parseBundleSpec, extractFrontmatter, mergeChildOverParent
// ============================================================================

describe("Mutation hardening: pact-loader parseBundleSpec and extractFrontmatter", () => {
  let ctx: TestRepoContext;

  afterEach(() => {
    ctx?.cleanup();
  });

  it("field with no type defaults to 'string'", async () => {
    ctx = createTestRepos();

    const noTypePact = `---
name: no-type-field
description: Field without explicit type
scope: global
context_bundle:
  required: [query]
  fields:
    query:
      description: "A search query"
response_bundle:
  required: []
  fields: {}
---

# No Type Field
`;

    await given("pact-store has a pact where a field has no type", () => {
      seedFlatFilePacts(ctx.aliceRepo, [
        { path: "no-type-field.md", content: noTypePact },
      ]);
    });

    let result: any;

    await when("an agent calls pact_discover", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_discover", {});
    });

    await thenAssert("field type defaults to 'string'", () => {
      const pact = result.pacts.find((p: any) => p.name === "no-type-field");
      expect(pact).toBeDefined();
      expect(pact.context_bundle.fields.query.type).toBe("string");
      expect(pact.context_bundle.fields.query.description).toBe("A search query");
    });
  });

  it("field with no description defaults to empty string", async () => {
    ctx = createTestRepos();

    const noDescPact = `---
name: no-desc-field
description: Field without explicit description
scope: global
context_bundle:
  required: [query]
  fields:
    query:
      type: string
response_bundle:
  required: []
  fields: {}
---

# No Desc Field
`;

    await given("pact-store has a pact where a field has no description", () => {
      seedFlatFilePacts(ctx.aliceRepo, [
        { path: "no-desc-field.md", content: noDescPact },
      ]);
    });

    let result: any;

    await when("an agent calls pact_discover", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_discover", {});
    });

    await thenAssert("field description defaults to empty string", () => {
      const pact = result.pacts.find((p: any) => p.name === "no-desc-field");
      expect(pact).toBeDefined();
      expect(pact.context_bundle.fields.query.description).toBe("");
      expect(pact.context_bundle.fields.query.type).toBe("string");
    });
  });

  it("PACT.md with empty frontmatter (---\\n---) returns undefined (excluded from catalog)", async () => {
    ctx = createTestRepos();

    const emptyFrontmatter = `---
---

# Empty Frontmatter

This pact has frontmatter delimiters but nothing between them.
`;

    await given("pact-store has a file with empty frontmatter", () => {
      seedFlatFilePacts(ctx.aliceRepo, [
        { path: "empty-fm.md", content: emptyFrontmatter },
        { path: "ask.md", content: ASK_PACT },
      ]);
    });

    let result: any;

    await when("an agent calls pact_discover", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_discover", {});
    });

    await thenAssert("only the valid pact is returned, empty frontmatter pact is excluded", () => {
      const names = result.pacts.map((p: any) => p.name);
      expect(names).toEqual(["ask"]);
      expect(names).not.toContain("empty-fm");
    });
  });

  it("content starting with --- but no closing --- returns undefined (excluded)", async () => {
    ctx = createTestRepos();

    const noClosingDelim = `---
name: broken-frontmatter
description: This has opening but no closing delimiter
scope: global

# Broken Frontmatter

The closing --- is missing so this should not parse.
`;

    await given("pact-store has a file with opening --- but no closing ---", () => {
      seedFlatFilePacts(ctx.aliceRepo, [
        { path: "broken.md", content: noClosingDelim },
        { path: "ask.md", content: ASK_PACT },
      ]);
    });

    let result: any;

    await when("an agent calls pact_discover", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_discover", {});
    });

    await thenAssert("only the valid pact is returned, broken frontmatter is excluded", () => {
      const names = result.pacts.map((p: any) => p.name);
      expect(names).toEqual(["ask"]);
    });
  });

  it("pact where YAML parses to null (non-object) is excluded from catalog", async () => {
    ctx = createTestRepos();

    const nullYaml = `---
~
---

# Null YAML

This YAML parses to null (tilde is YAML null).
`;

    await given("pact-store has a file with YAML that parses to null", () => {
      seedFlatFilePacts(ctx.aliceRepo, [
        { path: "null-yaml.md", content: nullYaml },
        { path: "ask.md", content: ASK_PACT },
      ]);
    });

    let result: any;

    await when("an agent calls pact_discover", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_discover", {});
    });

    await thenAssert("only the valid pact is returned", () => {
      const names = result.pacts.map((p: any) => p.name);
      expect(names).toEqual(["ask"]);
    });
  });
});

describe("Mutation hardening: pact-loader mergeChildOverParent branches", () => {
  let ctx: TestRepoContext;

  afterEach(() => {
    ctx?.cleanup();
  });

  it("child multi_round: true overrides parent multi_round: false", async () => {
    ctx = createTestRepos();

    const parent = `---
name: base-mr
description: Base pact with multi_round false
scope: global
multi_round: false
context_bundle:
  required: [what]
  fields:
    what: { type: string, description: "What" }
response_bundle:
  required: [status]
  fields:
    status: { type: string, description: "Status" }
---

# Base MR
`;

    const child = `---
name: child-mr
extends: base-mr
description: Child with multi_round true
multi_round: true
context_bundle:
  required: [what]
  fields: {}
response_bundle:
  required: []
  fields: {}
---

# Child MR
`;

    await given("parent has multi_round: false, child has multi_round: true", () => {
      seedFlatFilePacts(ctx.aliceRepo, [
        { path: "base-mr.md", content: parent },
        { path: "child-mr.md", content: child },
      ]);
    });

    let result: any;

    await when("an agent calls pact_discover", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_discover", {});
    });

    await thenAssert("child multi_round wins (true), parent is false", () => {
      const parent = result.pacts.find((p: any) => p.name === "base-mr");
      const child = result.pacts.find((p: any) => p.name === "child-mr");
      expect(parent.multi_round).toBe(false);
      expect(child.multi_round).toBe(true);
    });
  });

  it("child without multi_round inherits parent multi_round: true", async () => {
    ctx = createTestRepos();

    const parent = `---
name: base-inherit-mr
description: Base pact with multi_round true
scope: global
multi_round: true
context_bundle:
  required: [what]
  fields:
    what: { type: string, description: "What" }
response_bundle:
  required: [status]
  fields:
    status: { type: string, description: "Status" }
---

# Base Inherit MR
`;

    const child = `---
name: child-inherit-mr
extends: base-inherit-mr
description: Child without multi_round
context_bundle:
  required: [what]
  fields: {}
response_bundle:
  required: []
  fields: {}
---

# Child Inherit MR
`;

    await given("parent has multi_round: true, child omits multi_round", () => {
      seedFlatFilePacts(ctx.aliceRepo, [
        { path: "base-inherit-mr.md", content: parent },
        { path: "child-inherit-mr.md", content: child },
      ]);
    });

    let result: any;

    await when("an agent calls pact_discover", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_discover", {});
    });

    await thenAssert("child inherits multi_round: true from parent", () => {
      const child = result.pacts.find((p: any) => p.name === "child-inherit-mr");
      expect(child).toBeDefined();
      expect(child.multi_round).toBe(true);
    });
  });

  it("child attachments override parent attachments entirely", async () => {
    ctx = createTestRepos();

    const parent = `---
name: base-attach
description: Base pact with parent attachments
scope: global
attachments:
  - slot: parent-doc
    required: true
    convention: "doc.pdf"
    description: Parent document
context_bundle:
  required: [what]
  fields:
    what: { type: string, description: "What" }
response_bundle:
  required: [status]
  fields:
    status: { type: string, description: "Status" }
---

# Base Attach
`;

    const child = `---
name: child-attach
extends: base-attach
description: Child with different attachments
attachments:
  - slot: child-screenshot
    required: false
    convention: "screenshot.png"
    description: Child screenshot
context_bundle:
  required: [what]
  fields: {}
response_bundle:
  required: []
  fields: {}
---

# Child Attach
`;

    await given("parent has attachments, child has different attachments", () => {
      seedFlatFilePacts(ctx.aliceRepo, [
        { path: "base-attach.md", content: parent },
        { path: "child-attach.md", content: child },
      ]);
    });

    let result: any;

    await when("an agent calls pact_discover", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_discover", {});
    });

    await thenAssert("child attachments replace parent attachments entirely", () => {
      const child = result.pacts.find((p: any) => p.name === "child-attach");
      expect(child).toBeDefined();
      expect(child.attachments).toHaveLength(1);
      expect(child.attachments[0].slot).toBe("child-screenshot");
      expect(child.attachments[0].required).toBe(false);
      expect(child.attachments[0].convention).toBe("screenshot.png");
      // Parent attachment should NOT be present
      const parentSlot = child.attachments.find((a: any) => a.slot === "parent-doc");
      expect(parentSlot).toBeUndefined();
    });
  });

  it("child without attachments inherits parent attachments", async () => {
    ctx = createTestRepos();

    const parent = `---
name: base-attach-inherit
description: Base pact with attachments
scope: global
attachments:
  - slot: inherited-doc
    required: true
    convention: "doc.pdf"
    description: Should be inherited
context_bundle:
  required: [what]
  fields:
    what: { type: string, description: "What" }
response_bundle:
  required: [status]
  fields:
    status: { type: string, description: "Status" }
---

# Base Attach Inherit
`;

    const child = `---
name: child-attach-inherit
extends: base-attach-inherit
description: Child without attachments
context_bundle:
  required: [what]
  fields: {}
response_bundle:
  required: []
  fields: {}
---

# Child Attach Inherit
`;

    await given("parent has attachments, child omits attachments", () => {
      seedFlatFilePacts(ctx.aliceRepo, [
        { path: "base-attach-inherit.md", content: parent },
        { path: "child-attach-inherit.md", content: child },
      ]);
    });

    let result: any;

    await when("an agent calls pact_discover", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_discover", {});
    });

    await thenAssert("child inherits parent attachments", () => {
      const child = result.pacts.find((p: any) => p.name === "child-attach-inherit");
      expect(child).toBeDefined();
      expect(child.attachments).toHaveLength(1);
      expect(child.attachments[0].slot).toBe("inherited-doc");
      expect(child.attachments[0].required).toBe(true);
    });
  });

  it("child with non-empty when_to_use overrides parent; child with empty inherits parent", async () => {
    ctx = createTestRepos();

    const parent = `---
name: base-wtu
description: Base with when_to_use
scope: global
when_to_use:
  - Parent use case
context_bundle:
  required: [what]
  fields:
    what: { type: string, description: "What" }
response_bundle:
  required: [status]
  fields:
    status: { type: string, description: "Status" }
---

# Base WTU
`;

    const childOverride = `---
name: child-wtu-override
extends: base-wtu
description: Child with own when_to_use
when_to_use:
  - Child specific use case
context_bundle:
  required: [what]
  fields: {}
response_bundle:
  required: []
  fields: {}
---

# Child WTU Override
`;

    const childInherit = `---
name: child-wtu-inherit
extends: base-wtu
description: Child without when_to_use
context_bundle:
  required: [what]
  fields: {}
response_bundle:
  required: []
  fields: {}
---

# Child WTU Inherit
`;

    await given("parent has when_to_use, one child overrides, another omits", () => {
      seedFlatFilePacts(ctx.aliceRepo, [
        { path: "base-wtu.md", content: parent },
        { path: "child-wtu-override.md", content: childOverride },
        { path: "child-wtu-inherit.md", content: childInherit },
      ]);
    });

    let result: any;

    await when("an agent calls pact_discover", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_discover", {});
    });

    await thenAssert("child with when_to_use uses its own; child without inherits parent", () => {
      const childOverride = result.pacts.find((p: any) => p.name === "child-wtu-override");
      const childInherit = result.pacts.find((p: any) => p.name === "child-wtu-inherit");

      expect(childOverride).toBeDefined();
      expect(childOverride.when_to_use).toEqual(["Child specific use case"]);

      expect(childInherit).toBeDefined();
      expect(childInherit.when_to_use).toEqual(["Parent use case"]);
    });
  });

  it("child with empty response_bundle inherits parent response_bundle", async () => {
    ctx = createTestRepos();

    const parent = `---
name: base-rb
description: Base with response_bundle
scope: global
context_bundle:
  required: [what]
  fields:
    what: { type: string, description: "What" }
response_bundle:
  required: [status, result]
  fields:
    status: { type: string, description: "Outcome status" }
    result: { type: string, description: "The result" }
---

# Base RB
`;

    const child = `---
name: child-rb
extends: base-rb
description: Child with empty response_bundle
context_bundle:
  required: [what]
  fields: {}
response_bundle:
  required: []
  fields: {}
---

# Child RB
`;

    await given("parent has response_bundle fields, child has empty response_bundle", () => {
      seedFlatFilePacts(ctx.aliceRepo, [
        { path: "base-rb.md", content: parent },
        { path: "child-rb.md", content: child },
      ]);
    });

    let result: any;

    await when("an agent calls pact_discover", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_discover", {});
    });

    await thenAssert("child inherits parent response_bundle since child has no fields or required", () => {
      const child = result.pacts.find((p: any) => p.name === "child-rb");
      expect(child).toBeDefined();
      expect(child.response_bundle.required).toEqual(["status", "result"]);
      expect(child.response_bundle.fields).toHaveProperty("status");
      expect(child.response_bundle.fields.status.description).toBe("Outcome status");
      expect(child.response_bundle.fields).toHaveProperty("result");
    });
  });

  it("orphan variant (parent not found) is excluded from catalog", async () => {
    ctx = createTestRepos();

    const orphan = `---
name: orphan-variant
extends: nonexistent-parent
description: Orphan variant whose parent does not exist
context_bundle:
  required: [what]
  fields:
    what: { type: string, description: "What" }
response_bundle:
  required: []
  fields: {}
---

# Orphan Variant
`;

    await given("pact-store has a variant whose parent does not exist", () => {
      seedFlatFilePacts(ctx.aliceRepo, [
        { path: "orphan.md", content: orphan },
        { path: "ask.md", content: ASK_PACT },
      ]);
    });

    let result: any;

    await when("an agent calls pact_discover", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_discover", {});
    });

    await thenAssert("orphan variant is excluded, only valid pacts remain", () => {
      const names = result.pacts.map((p: any) => p.name);
      expect(names).toEqual(["ask"]);
      expect(names).not.toContain("orphan-variant");
    });
  });

  it("deep inheritance (grandchild) is excluded from catalog", async () => {
    ctx = createTestRepos();

    const grandparent = `---
name: grandparent
description: Top-level base pact
scope: global
context_bundle:
  required: [what]
  fields:
    what: { type: string, description: "What" }
response_bundle:
  required: [status]
  fields:
    status: { type: string, description: "Status" }
---

# Grandparent
`;

    const parent = `---
name: parent-deep
extends: grandparent
description: First-level child
context_bundle:
  required: [what]
  fields: {}
response_bundle:
  required: []
  fields: {}
---

# Parent Deep
`;

    const grandchild = `---
name: grandchild
extends: parent-deep
description: Second-level child (grandchild)
context_bundle:
  required: [what]
  fields: {}
response_bundle:
  required: []
  fields: {}
---

# Grandchild
`;

    await given("pact-store has grandparent -> parent -> grandchild chain", () => {
      seedFlatFilePacts(ctx.aliceRepo, [
        { path: "grandparent.md", content: grandparent },
        { path: "parent-deep.md", content: parent },
        { path: "grandchild.md", content: grandchild },
      ]);
    });

    let result: any;

    await when("an agent calls pact_discover", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_discover", {});
    });

    await thenAssert("grandchild is excluded (deep inheritance rejected), parent is resolved", () => {
      const names = result.pacts.map((p: any) => p.name).sort();
      expect(names).toContain("grandparent");
      expect(names).toContain("parent-deep");
      expect(names).not.toContain("grandchild");
    });
  });

  it("child description empty inherits parent description", async () => {
    ctx = createTestRepos();

    const parent = `---
name: base-desc
description: Parent description value
scope: global
context_bundle:
  required: [what]
  fields:
    what: { type: string, description: "What" }
response_bundle:
  required: [status]
  fields:
    status: { type: string, description: "Status" }
---

# Base Desc
`;

    const child = `---
name: child-desc
extends: base-desc
description: ""
context_bundle:
  required: [what]
  fields: {}
response_bundle:
  required: []
  fields: {}
---

# Child Desc
`;

    await given("parent has description, child has empty description", () => {
      seedFlatFilePacts(ctx.aliceRepo, [
        { path: "base-desc.md", content: parent },
        { path: "child-desc.md", content: child },
      ]);
    });

    let result: any;

    await when("an agent calls pact_discover", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_discover", {});
    });

    await thenAssert("child inherits parent description since child description is empty (falsy)", () => {
      const child = result.pacts.find((p: any) => p.name === "child-desc");
      expect(child).toBeDefined();
      expect(child.description).toBe("Parent description value");
    });
  });

  it("defaults shallow-merge: child overrides specific keys, parent provides others", async () => {
    ctx = createTestRepos();

    const parent = `---
name: base-defaults
description: Base with defaults
scope: global
defaults:
  visibility: shared
  claimable: false
  response_mode: any
context_bundle:
  required: [what]
  fields:
    what: { type: string, description: "What" }
response_bundle:
  required: [status]
  fields:
    status: { type: string, description: "Status" }
---

# Base Defaults
`;

    const child = `---
name: child-defaults
extends: base-defaults
description: Child overriding some defaults
defaults:
  claimable: true
context_bundle:
  required: [what]
  fields: {}
response_bundle:
  required: []
  fields: {}
---

# Child Defaults
`;

    await given("parent has 3 defaults keys, child overrides one", () => {
      seedFlatFilePacts(ctx.aliceRepo, [
        { path: "base-defaults.md", content: parent },
        { path: "child-defaults.md", content: child },
      ]);
    });

    let result: any;

    await when("an agent calls pact_discover", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_discover", {});
    });

    await thenAssert("merged defaults have parent keys + child override", () => {
      const child = result.pacts.find((p: any) => p.name === "child-defaults");
      expect(child).toBeDefined();
      // Parent's keys inherited
      expect(child.defaults.visibility).toBe("shared");
      expect(child.defaults.response_mode).toBe("any");
      // Child's override wins
      expect(child.defaults.claimable).toBe(true);
    });
  });

  it("when_to_use as a single string becomes a one-element array", async () => {
    ctx = createTestRepos();

    const singleStringWtu = `---
name: single-wtu
description: Pact with when_to_use as a single string
scope: global
when_to_use: "Just a single string use case"
context_bundle:
  required: []
  fields: {}
response_bundle:
  required: []
  fields: {}
---

# Single WTU
`;

    await given("pact-store has a pact with when_to_use as a single string", () => {
      seedFlatFilePacts(ctx.aliceRepo, [
        { path: "single-wtu.md", content: singleStringWtu },
      ]);
    });

    let result: any;

    await when("an agent calls pact_discover", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_discover", {});
    });

    await thenAssert("when_to_use is a one-element array", () => {
      const pact = result.pacts.find((p: any) => p.name === "single-wtu");
      expect(pact).toBeDefined();
      expect(pact.when_to_use).toEqual(["Just a single string use case"]);
    });
  });

  it("context_bundle with no fields or required returns empty spec", async () => {
    ctx = createTestRepos();

    const noBundlePact = `---
name: no-bundle
description: Pact with no context_bundle defined
scope: global
response_bundle:
  required: []
  fields: {}
---

# No Bundle
`;

    await given("pact-store has a pact without context_bundle", () => {
      seedFlatFilePacts(ctx.aliceRepo, [
        { path: "no-bundle.md", content: noBundlePact },
      ]);
    });

    let result: any;

    await when("an agent calls pact_discover", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_discover", {});
    });

    await thenAssert("context_bundle defaults to empty required and empty fields", () => {
      const pact = result.pacts.find((p: any) => p.name === "no-bundle");
      expect(pact).toBeDefined();
      expect(pact.context_bundle.required).toEqual([]);
      expect(pact.context_bundle.fields).toEqual({});
    });
  });
});
