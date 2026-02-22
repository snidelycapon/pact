/**
 * Acceptance Tests -- Inbox Skill Enrichment
 *
 * Traces to: US-020
 *
 * Tests exercise the garp_inbox driving port (tool handler) against
 * real local git repos to verify skill enrichment of inbox entries.
 * Scenarios verify:
 *   - Inbox entries include skill_description extracted from skill metadata
 *   - Inbox entries include response_fields listing expected response field names
 *   - Enrichment prefers schema.json when available for response_fields
 *   - Enrichment falls back to SKILL.md when no schema.json exists
 *   - Missing or unreadable skill files cause enrichment fields to be omitted (not error)
 *   - Existing inbox fields remain unchanged after enrichment
 *   - Skill metadata is cached per request_type during a single inbox scan
 *   - Thread groups include enrichment from the latest entry's skill
 *
 * Error/edge scenarios: 4 of 9 total (44%)
 */

import { describe, it, expect, afterEach } from "vitest";
import {
  createTestRepos,
  type TestRepoContext,
} from "./helpers/setup-test-repos";
import { given, when, thenAssert } from "./helpers/gwt";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { createGarpServer } from "../../src/server.ts";

// ---------------------------------------------------------------------------
// Skill content fixtures
// ---------------------------------------------------------------------------

const ASK_SKILL = `# Ask

A general question needing another person's view.

## When To Use
When you have a question that needs human judgment.

## Context Bundle Fields
| Field | Required | Description |
|-------|----------|-------------|
| question | yes | The question to ask |
| background | no | Background context |

## Response Structure
| Field | Description |
|-------|-------------|
| answer | The answer to the question |
| reasoning | Reasoning behind the answer |
| caveats | Any caveats or limitations |
`;

const SANITY_CHECK_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  skill_name: "sanity-check",
  skill_version: "1.0.0",
  context_bundle: {
    type: "object",
    required: ["customer", "product", "issue_summary", "involved_files", "investigation_so_far", "question"],
    properties: {
      customer: { type: "string", description: "Customer name" },
      product: { type: "string", description: "Product name and version" },
      issue_summary: { type: "string", description: "Brief description" },
      involved_files: { type: "string", description: "Files examined" },
      investigation_so_far: { type: "string", description: "What you found" },
      question: { type: "string", description: "Question for reviewer" },
    },
    additionalProperties: true,
  },
  response_bundle: {
    type: "object",
    required: ["answer", "evidence", "recommendation"],
    properties: {
      answer: { type: "string", description: "YES / NO / PARTIALLY" },
      evidence: { type: "string", description: "What you compared" },
      concerns: { type: "string", description: "Risks or caveats" },
      recommendation: { type: "string", description: "Suggested next step" },
    },
    additionalProperties: true,
  },
};

/** Seed a pending request directly into the repo. */
function seedRequest(
  repoPath: string,
  opts: {
    requestId: string;
    recipient: string;
    sender: string;
    senderName: string;
    requestType?: string;
    createdAt?: string;
    question?: string;
    threadId?: string;
  },
): void {
  const envelope: Record<string, unknown> = {
    request_id: opts.requestId,
    request_type: opts.requestType ?? "sanity-check",
    sender: { user_id: opts.sender, display_name: opts.senderName },
    recipient: {
      user_id: opts.recipient,
      display_name: opts.recipient.charAt(0).toUpperCase() + opts.recipient.slice(1),
    },
    status: "pending",
    created_at: opts.createdAt ?? new Date().toISOString(),
    context_bundle: { question: opts.question ?? "Test question" },
  };
  if (opts.threadId) {
    envelope.thread_id = opts.threadId;
  }
  const filePath = join(repoPath, "requests", "pending", `${opts.requestId}.json`);
  writeFileSync(filePath, JSON.stringify(envelope, null, 2));
  execSync(`cd "${repoPath}" && git add -A && git commit -m "seed ${opts.requestId}" && git push`, {
    stdio: "pipe",
  });
}

describe("inbox enrichment: skill description and response fields in inbox entries", () => {
  let ctx: TestRepoContext;

  afterEach(() => {
    ctx?.cleanup();
  });

  // =========================================================================
  // Walking Skeleton
  // =========================================================================

  it("includes skill_description and response_fields in inbox entries for existing skills", async () => {
    ctx = createTestRepos();

    await given("Cory sent a sanity-check request to Bob", () => {
      seedRequest(ctx.aliceRepo, {
        requestId: "req-20260222-100000-alice-e001",
        recipient: "bob",
        sender: "alice",
        senderName: "Alice",
        requestType: "sanity-check",
        question: "Does this memory leak match the session service pattern?",
      });
    });

    let inbox: any;

    await when("Bob checks his inbox", async () => {
      const bobServer = createGarpServer({ repoPath: ctx.bobRepo, userId: "bob" });
      inbox = await bobServer.callTool("garp_inbox", {});
    });

    await thenAssert("the inbox entry includes skill_description", () => {
      expect(inbox.requests).toHaveLength(1);
      expect(inbox.requests[0].skill_description).toBeDefined();
      expect(typeof inbox.requests[0].skill_description).toBe("string");
      expect(inbox.requests[0].skill_description.length).toBeGreaterThan(0);
    });

    await thenAssert("the inbox entry includes response_fields as an array of field names", () => {
      expect(inbox.requests[0].response_fields).toBeDefined();
      expect(Array.isArray(inbox.requests[0].response_fields)).toBe(true);
      expect(inbox.requests[0].response_fields).toEqual(
        expect.arrayContaining(["answer", "evidence", "recommendation"]),
      );
    });

    await thenAssert("existing inbox fields remain unchanged", () => {
      expect(inbox.requests[0].request_id).toBe("req-20260222-100000-alice-e001");
      expect(inbox.requests[0].request_type).toBe("sanity-check");
      expect(inbox.requests[0].sender).toBe("Alice");
      expect(inbox.requests[0].skill_path).toContain("skills/sanity-check/SKILL.md");
    });
  });

  // =========================================================================
  // Happy Path -- Schema Preference
  // =========================================================================

  it("extracts response_fields from schema.json when available", async () => {
    ctx = createTestRepos();

    await given("the sanity-check skill has both SKILL.md and schema.json", () => {
      writeFileSync(
        join(ctx.aliceRepo, "skills", "sanity-check", "schema.json"),
        JSON.stringify(SANITY_CHECK_SCHEMA, null, 2),
      );
      execSync(
        `cd "${ctx.aliceRepo}" && git add -A && git commit -m "add schema" && git push`,
        { stdio: "pipe" },
      );
    });

    await given("Cory sent a sanity-check request to Bob", () => {
      seedRequest(ctx.aliceRepo, {
        requestId: "req-20260222-100000-alice-e002",
        recipient: "bob",
        sender: "alice",
        senderName: "Alice",
        requestType: "sanity-check",
      });
    });

    let inbox: any;

    await when("Bob checks his inbox", async () => {
      const bobServer = createGarpServer({ repoPath: ctx.bobRepo, userId: "bob" });
      inbox = await bobServer.callTool("garp_inbox", {});
    });

    await thenAssert("response_fields are extracted from schema.json response_bundle properties", () => {
      expect(inbox.requests[0].response_fields).toEqual(
        expect.arrayContaining(["answer", "evidence", "concerns", "recommendation"]),
      );
    });
  });

  it("falls back to SKILL.md for response_fields when no schema.json exists", async () => {
    ctx = createTestRepos();

    await given("the ask skill has SKILL.md but no schema.json", () => {
      mkdirSync(join(ctx.aliceRepo, "skills", "ask"), { recursive: true });
      writeFileSync(join(ctx.aliceRepo, "skills", "ask", "SKILL.md"), ASK_SKILL);
      execSync(
        `cd "${ctx.aliceRepo}" && git add -A && git commit -m "add ask skill" && git push`,
        { stdio: "pipe" },
      );
    });

    await given("Cory sent an ask request to Bob", () => {
      seedRequest(ctx.aliceRepo, {
        requestId: "req-20260222-110000-alice-e003",
        recipient: "bob",
        sender: "alice",
        senderName: "Alice",
        requestType: "ask",
        question: "What do you think about the migration plan?",
      });
    });

    let inbox: any;

    await when("Bob checks his inbox", async () => {
      const bobServer = createGarpServer({ repoPath: ctx.bobRepo, userId: "bob" });
      inbox = await bobServer.callTool("garp_inbox", {});
    });

    await thenAssert("the ask entry includes skill_description", () => {
      expect(inbox.requests[0].skill_description).toBeDefined();
      expect(inbox.requests[0].skill_description.length).toBeGreaterThan(0);
    });

    await thenAssert("response_fields are extracted from the SKILL.md Response Structure table", () => {
      expect(inbox.requests[0].response_fields).toEqual(
        expect.arrayContaining(["answer", "reasoning", "caveats"]),
      );
    });
  });

  // =========================================================================
  // Happy Path -- Multiple Request Types
  // =========================================================================

  it("enriches multiple inbox entries of different skill types independently", async () => {
    ctx = createTestRepos();

    await given("the repo has sanity-check and ask skills", () => {
      mkdirSync(join(ctx.aliceRepo, "skills", "ask"), { recursive: true });
      writeFileSync(join(ctx.aliceRepo, "skills", "ask", "SKILL.md"), ASK_SKILL);
      execSync(
        `cd "${ctx.aliceRepo}" && git add -A && git commit -m "add ask skill" && git push`,
        { stdio: "pipe" },
      );
    });

    await given("Bob has a sanity-check and an ask request pending", () => {
      seedRequest(ctx.aliceRepo, {
        requestId: "req-20260222-100000-alice-m001",
        recipient: "bob",
        sender: "alice",
        senderName: "Alice",
        requestType: "sanity-check",
        createdAt: "2026-02-22T10:00:00Z",
        question: "Sanity check question",
      });
      seedRequest(ctx.aliceRepo, {
        requestId: "req-20260222-110000-alice-m002",
        recipient: "bob",
        sender: "alice",
        senderName: "Alice",
        requestType: "ask",
        createdAt: "2026-02-22T11:00:00Z",
        question: "General ask question",
      });
    });

    let inbox: any;

    await when("Bob checks his inbox", async () => {
      const bobServer = createGarpServer({ repoPath: ctx.bobRepo, userId: "bob" });
      inbox = await bobServer.callTool("garp_inbox", {});
    });

    await thenAssert("each entry has enrichment from its own skill type", () => {
      expect(inbox.requests).toHaveLength(2);

      const sc = inbox.requests.find((r: any) => r.request_type === "sanity-check");
      expect(sc.skill_description).toBeDefined();
      expect(sc.response_fields).toEqual(
        expect.arrayContaining(["answer", "evidence", "recommendation"]),
      );

      const ask = inbox.requests.find((r: any) => r.request_type === "ask");
      expect(ask.skill_description).toBeDefined();
      expect(ask.response_fields).toEqual(
        expect.arrayContaining(["answer", "reasoning", "caveats"]),
      );
    });
  });

  it("caches skill metadata so duplicate request types do not re-read files", async () => {
    ctx = createTestRepos();

    await given("Bob has 3 sanity-check requests pending", () => {
      for (let i = 1; i <= 3; i++) {
        seedRequest(ctx.aliceRepo, {
          requestId: `req-20260222-${String(100000 + i)}-alice-c00${i}`,
          recipient: "bob",
          sender: "alice",
          senderName: "Alice",
          requestType: "sanity-check",
          createdAt: `2026-02-22T${10 + i}:00:00Z`,
          question: `Question ${i}`,
        });
      }
    });

    let inbox: any;

    await when("Bob checks his inbox", async () => {
      const bobServer = createGarpServer({ repoPath: ctx.bobRepo, userId: "bob" });
      inbox = await bobServer.callTool("garp_inbox", {});
    });

    await thenAssert("all 3 entries have identical enrichment (proving cache consistency)", () => {
      expect(inbox.requests).toHaveLength(3);
      const descriptions = inbox.requests.map((r: any) => r.skill_description);
      const fieldSets = inbox.requests.map((r: any) => JSON.stringify(r.response_fields));

      // All 3 should have the same enrichment from the same skill
      expect(new Set(descriptions).size).toBe(1);
      expect(new Set(fieldSets).size).toBe(1);
    });
  });

  // =========================================================================
  // Edge Cases / Error Paths
  // =========================================================================

  it("omits enrichment fields when skill file is missing without breaking inbox", async () => {
    ctx = createTestRepos();

    await given("a request with an unknown skill type exists for Bob", () => {
      seedRequest(ctx.aliceRepo, {
        requestId: "req-20260222-100000-alice-u001",
        recipient: "bob",
        sender: "alice",
        senderName: "Alice",
        requestType: "unknown-skill",
        question: "Request for nonexistent skill type",
      });
    });

    let inbox: any;

    await when("Bob checks his inbox", async () => {
      const bobServer = createGarpServer({ repoPath: ctx.bobRepo, userId: "bob" });
      inbox = await bobServer.callTool("garp_inbox", {});
    });

    await thenAssert("the inbox entry omits skill_description and response_fields", () => {
      expect(inbox.requests).toHaveLength(1);
      expect(inbox.requests[0].skill_description).toBeUndefined();
      expect(inbox.requests[0].response_fields).toBeUndefined();
    });

    await thenAssert("existing inbox fields are still present and correct", () => {
      expect(inbox.requests[0].request_id).toBe("req-20260222-100000-alice-u001");
      expect(inbox.requests[0].request_type).toBe("unknown-skill");
      expect(inbox.requests[0].sender).toBe("Alice");
      expect(inbox.requests[0].summary).toBeDefined();
    });
  });

  it("omits enrichment when SKILL.md exists but is empty or unparseable", async () => {
    ctx = createTestRepos();

    await given("the repo has a skill with an empty SKILL.md", () => {
      mkdirSync(join(ctx.aliceRepo, "skills", "empty-skill"), { recursive: true });
      writeFileSync(join(ctx.aliceRepo, "skills", "empty-skill", "SKILL.md"), "");
      execSync(
        `cd "${ctx.aliceRepo}" && git add -A && git commit -m "empty skill" && git push`,
        { stdio: "pipe" },
      );
    });

    await given("a request for the empty skill exists for Bob", () => {
      seedRequest(ctx.aliceRepo, {
        requestId: "req-20260222-100000-alice-ep01",
        recipient: "bob",
        sender: "alice",
        senderName: "Alice",
        requestType: "empty-skill",
        question: "Empty skill test",
      });
    });

    let inbox: any;

    await when("Bob checks his inbox", async () => {
      const bobServer = createGarpServer({ repoPath: ctx.bobRepo, userId: "bob" });
      inbox = await bobServer.callTool("garp_inbox", {});
    });

    await thenAssert("enrichment fields are omitted but inbox does not error", () => {
      expect(inbox.requests).toHaveLength(1);
      // With an empty SKILL.md, enrichment should gracefully degrade
      expect(inbox.requests[0].request_id).toBe("req-20260222-100000-alice-ep01");
    });
  });

  it("thread groups include enrichment from the skill metadata", async () => {
    ctx = createTestRepos();
    const threadId = "req-20260222-100000-alice-tg01";

    await given("Bob has 2 threaded sanity-check requests", () => {
      seedRequest(ctx.aliceRepo, {
        requestId: "req-20260222-100000-alice-tg01",
        recipient: "bob",
        sender: "alice",
        senderName: "Alice",
        requestType: "sanity-check",
        createdAt: "2026-02-22T10:00:00Z",
        question: "Round 1 question",
        threadId,
      });
      seedRequest(ctx.aliceRepo, {
        requestId: "req-20260222-110000-alice-tg02",
        recipient: "bob",
        sender: "alice",
        senderName: "Alice",
        requestType: "sanity-check",
        createdAt: "2026-02-22T11:00:00Z",
        question: "Round 2 question",
        threadId,
      });
    });

    let inbox: any;

    await when("Bob checks his inbox", async () => {
      const bobServer = createGarpServer({ repoPath: ctx.bobRepo, userId: "bob" });
      inbox = await bobServer.callTool("garp_inbox", {});
    });

    await thenAssert("the thread group includes skill_description and response_fields", () => {
      expect(inbox.requests).toHaveLength(1);
      const group = inbox.requests[0];
      expect(group.is_thread_group).toBe(true);
      expect(group.skill_description).toBeDefined();
      expect(group.response_fields).toBeDefined();
      expect(Array.isArray(group.response_fields)).toBe(true);
      expect(group.response_fields).toEqual(
        expect.arrayContaining(["answer", "evidence", "recommendation"]),
      );
    });
  });

  it("mixed inbox with enrichable and non-enrichable entries does not error", async () => {
    ctx = createTestRepos();

    await given("Bob has a sanity-check request and an unknown-skill request", () => {
      seedRequest(ctx.aliceRepo, {
        requestId: "req-20260222-100000-alice-mx01",
        recipient: "bob",
        sender: "alice",
        senderName: "Alice",
        requestType: "sanity-check",
        createdAt: "2026-02-22T10:00:00Z",
        question: "Known skill question",
      });
      seedRequest(ctx.aliceRepo, {
        requestId: "req-20260222-110000-alice-mx02",
        recipient: "bob",
        sender: "alice",
        senderName: "Alice",
        requestType: "nonexistent-type",
        createdAt: "2026-02-22T11:00:00Z",
        question: "Unknown skill question",
      });
    });

    let inbox: any;

    await when("Bob checks his inbox", async () => {
      const bobServer = createGarpServer({ repoPath: ctx.bobRepo, userId: "bob" });
      inbox = await bobServer.callTool("garp_inbox", {});
    });

    await thenAssert("both entries are returned", () => {
      expect(inbox.requests).toHaveLength(2);
    });

    await thenAssert("the sanity-check entry has enrichment", () => {
      const sc = inbox.requests.find((r: any) => r.request_type === "sanity-check");
      expect(sc.skill_description).toBeDefined();
      expect(sc.response_fields).toBeDefined();
    });

    await thenAssert("the unknown-skill entry omits enrichment gracefully", () => {
      const unknown = inbox.requests.find((r: any) => r.request_type === "nonexistent-type");
      expect(unknown.skill_description).toBeUndefined();
      expect(unknown.response_fields).toBeUndefined();
      // But other fields are present
      expect(unknown.request_id).toBe("req-20260222-110000-alice-mx02");
      expect(unknown.sender).toBe("Alice");
    });
  });
});
