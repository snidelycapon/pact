/**
 * Milestone 1: Flat-File Pact Store and Inheritance
 *
 * pact-y30 epic — validates the new pact loader:
 *   - Loads pacts from {store_root}/[glob]/*.md via recursive glob
 *   - Parses extended metadata (scope, defaults, attachments, multi_round)
 *   - Resolves single-level inheritance at load time
 *   - Returns fully resolved flat metadata to consumers
 *
 * Exercises driving port: pact_discover
 * Integration contracts: IC4 (inheritance), IC5 (catalog), IC6 (backward compat)
 *
 * Error scenarios: 7 of 16 total (44%)
 *
 * @skip — Enable when flat-file loader is implemented.
 */

import { describe, it, expect, afterEach } from "vitest";
import {
  createTestRepos,
  type TestRepoContext,
} from "./helpers/setup-test-repos";
import { given, when, thenAssert } from "./helpers/gwt";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { createPactServer } from "../../src/server.ts";

// ---------------------------------------------------------------------------
// Flat-file pact fixtures (new format: {store_root}/*.md)
// ---------------------------------------------------------------------------

const ASK_PACT = `---
name: ask
description: Get input that unblocks current work
version: "1.0.0"
scope: global
when_to_use:
  - You have a question that needs another person's perspective
  - The question doesn't fit a more structured pact type
multi_round: false
context_bundle:
  required: [question]
  fields:
    question: { type: string, description: "The question — be specific" }
    background: { type: string, description: "Context the recipient needs" }
response_bundle:
  required: [answer]
  fields:
    answer: { type: string, description: "Direct answer to the question" }
    reasoning: { type: string, description: "Why this answer, briefly" }
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
hooks:
  on_respond: update-ticket
---

# Review

Get structured feedback with blocking/advisory split.
`;

const SHARE_PACT = `---
name: share
description: Push context to someone, no action required
version: "1.0.0"
scope: global
when_to_use:
  - You want to share information without expecting a response
context_bundle:
  required: [what]
  fields:
    what: { type: string, description: "Information to share" }
response_bundle:
  required: []
  fields:
    acknowledged: { type: boolean, description: "Whether the recipient acknowledged" }
defaults:
  response_mode: none_required
---

# Share

Push context to someone, no action required.
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Seed flat-file pacts in pact-store/ directory and push. */
function seedFlatFilePacts(
  repoPath: string,
  pacts: { path: string; content: string }[],
): void {
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Flat-file pact store and discovery (pact-y30)", () => {
  let ctx: TestRepoContext;

  afterEach(() => {
    ctx?.cleanup();
  });

  // =========================================================================
  // Walking Skeleton: flat-file discovery
  // =========================================================================

  it("discovers pacts from flat-file store with extended metadata", async () => {
    ctx = createTestRepos();

    await given("pact-store has flat-file pacts with scope and defaults", () => {
      seedFlatFilePacts(ctx.aliceRepo, [
        { path: "ask.md", content: ASK_PACT },
        { path: "request.md", content: REQUEST_PACT },
        { path: "share.md", content: SHARE_PACT },
      ]);
    });

    let result: any;

    await when("an agent calls pact_discover", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_discover", {});
    });

    await thenAssert("the catalog includes all 3 flat-file pacts", () => {
      expect(result.pacts).toHaveLength(3);
      const names = result.pacts.map((p: any) => p.name);
      expect(names).toContain("ask");
      expect(names).toContain("request");
      expect(names).toContain("share");
    });

    await thenAssert("each pact includes scope metadata", () => {
      const ask = result.pacts.find((p: any) => p.name === "ask");
      expect(ask.scope).toBe("global");
    });

    await thenAssert("pacts with defaults include them in metadata", () => {
      const request = result.pacts.find((p: any) => p.name === "request");
      expect(request.defaults).toEqual({
        response_mode: "any",
        visibility: "shared",
        claimable: false,
      });
    });

    await thenAssert("pacts without defaults omit the defaults field", () => {
      const ask = result.pacts.find((p: any) => p.name === "ask");
      expect(ask.defaults).toBeUndefined();
    });
  });

  // =========================================================================
  // Milestone 1: Extended metadata fields
  // =========================================================================

  it("discovers pact with multi_round, attachments, and hooks metadata", async () => {
    ctx = createTestRepos();

    await given("pact-store has a review pact with multi_round, attachments, and hooks", () => {
      seedFlatFilePacts(ctx.aliceRepo, [
        { path: "review.md", content: REVIEW_PACT },
      ]);
    });

    let result: any;

    await when("an agent calls pact_discover", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_discover", {});
    });

    await thenAssert("the review pact reports multi_round as true", () => {
      const review = result.pacts.find((p: any) => p.name === "review");
      expect(review.multi_round).toBe(true);
    });

    await thenAssert("the review pact includes attachment slot definitions", () => {
      const review = result.pacts.find((p: any) => p.name === "review");
      expect(review.attachments).toHaveLength(1);
      expect(review.attachments[0].slot).toBe("diff-file");
    });

    await thenAssert("the review pact reports has_hooks as true", () => {
      const review = result.pacts.find((p: any) => p.name === "review");
      expect(review.has_hooks).toBe(true);
    });

    await thenAssert("the review pact includes private visibility default", () => {
      const review = result.pacts.find((p: any) => p.name === "review");
      expect(review.defaults.visibility).toBe("private");
    });
  });

  it("discovers pacts from subdirectories within pact-store", async () => {
    ctx = createTestRepos();

    await given("pact-store has pacts in nested subdirectories", () => {
      seedFlatFilePacts(ctx.aliceRepo, [
        { path: "ask.md", content: ASK_PACT },
        { path: "backend/request:backend.md", content: REQUEST_BACKEND_VARIANT },
        { path: "request.md", content: REQUEST_PACT },
      ]);
    });

    let result: any;

    await when("an agent calls pact_discover", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_discover", {});
    });

    await thenAssert("pacts from subdirectories are included in the catalog", () => {
      const names = result.pacts.map((p: any) => p.name);
      expect(names).toContain("request:backend");
    });
  });

  // =========================================================================
  // Milestone 2: Pact Inheritance
  // =========================================================================

  it.skip("resolves child pact by merging with parent at load time", async () => {
    ctx = createTestRepos();

    await given("pact-store has a request base pact and a backend variant", () => {
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

    await thenAssert("the variant appears as a fully resolved entry", () => {
      const variant = result.pacts.find((p: any) => p.name === "request:backend");
      expect(variant).toBeDefined();
      // Child overrides
      expect(variant.description).toBe("Backend team request with service context");
      expect(variant.scope).toBe("team");
      expect(variant.registered_for).toEqual(["team:backend"]);
    });

    await thenAssert("variant context_bundle merges child fields over parent", () => {
      const variant = result.pacts.find((p: any) => p.name === "request:backend");
      // Child's required replaces parent's
      expect(variant.context_bundle.required).toEqual(["what", "service", "done_when"]);
      // Parent's fields are inherited
      expect(variant.context_bundle.fields).toHaveProperty("what");
      expect(variant.context_bundle.fields).toHaveProperty("done_when");
      // Child's fields are added
      expect(variant.context_bundle.fields).toHaveProperty("service");
      expect(variant.context_bundle.fields).toHaveProperty("runbook");
    });

    await thenAssert("variant response_bundle is inherited from parent", () => {
      const variant = result.pacts.find((p: any) => p.name === "request:backend");
      expect(variant.response_bundle.required).toEqual(["status", "result"]);
      expect(variant.response_bundle.fields).toHaveProperty("status");
    });

    await thenAssert("variant defaults merge child over parent", () => {
      const variant = result.pacts.find((p: any) => p.name === "request:backend");
      // Child overrides claimable
      expect(variant.defaults.claimable).toBe(true);
      // Parent values inherited
      expect(variant.defaults.response_mode).toBe("any");
      expect(variant.defaults.visibility).toBe("shared");
    });

    await thenAssert("the extends field is consumed and not present in output", () => {
      const variant = result.pacts.find((p: any) => p.name === "request:backend");
      expect(variant.extends).toBeUndefined();
    });
  });

  it.skip("catalog shows both base and variant as flat entries, no hierarchy", async () => {
    ctx = createTestRepos();

    await given("pact-store has a base pact and its variant", () => {
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

    await thenAssert("both base and variant appear in the flat catalog", () => {
      const names = result.pacts.map((p: any) => p.name);
      expect(names).toContain("request");
      expect(names).toContain("request:backend");
      expect(result.pacts).toHaveLength(2);
    });
  });

  // =========================================================================
  // Milestone 3: Error Paths and Edge Cases
  // =========================================================================

  it.skip("skips pact with missing parent in extends chain", async () => {
    ctx = createTestRepos();

    const orphanVariant = `---
name: "request:orphan"
extends: nonexistent-parent
description: Orphan variant
scope: team
when_to_use:
  - Never
context_bundle:
  required: [what]
  fields:
    what: { type: string, description: "Something" }
response_bundle:
  required: []
  fields: {}
---

# Orphan
`;

    await given("pact-store has a variant that references a nonexistent parent", () => {
      seedFlatFilePacts(ctx.aliceRepo, [
        { path: "ask.md", content: ASK_PACT },
        { path: "request:orphan.md", content: orphanVariant },
      ]);
    });

    let result: any;

    await when("an agent calls pact_discover", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_discover", {});
    });

    await thenAssert("the orphan variant is excluded from catalog", () => {
      const names = result.pacts.map((p: any) => p.name);
      expect(names).not.toContain("request:orphan");
    });

    await thenAssert("valid pacts are still returned", () => {
      const names = result.pacts.map((p: any) => p.name);
      expect(names).toContain("ask");
    });
  });

  it("skips flat-file pact with empty or missing name field", async () => {
    ctx = createTestRepos();

    const noNamePact = `---
description: A pact with no name field
scope: global
when_to_use:
  - Never
context_bundle:
  required: []
  fields: {}
response_bundle:
  required: []
  fields: {}
---

# Nameless
`;

    await given("pact-store has a pact file with no name in frontmatter", () => {
      seedFlatFilePacts(ctx.aliceRepo, [
        { path: "ask.md", content: ASK_PACT },
        { path: "nameless.md", content: noNamePact },
      ]);
    });

    let result: any;

    await when("an agent calls pact_discover", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_discover", {});
    });

    await thenAssert("the nameless pact is excluded", () => {
      const names = result.pacts.map((p: any) => p.name);
      expect(names).not.toContain("nameless");
    });
  });

  it.skip("rejects deep inheritance (grandchild extending a child)", async () => {
    ctx = createTestRepos();

    const grandchild = `---
name: "request:backend:urgent"
extends: "request:backend"
description: Urgent backend request
scope: team
when_to_use:
  - Urgent backend work
context_bundle:
  required: [what]
  fields:
    what: { type: string, description: "Something" }
response_bundle:
  required: []
  fields: {}
---

# Urgent Backend Request
`;

    await given("pact-store has a grandchild trying to extend a child variant", () => {
      seedFlatFilePacts(ctx.aliceRepo, [
        { path: "request.md", content: REQUEST_PACT },
        { path: "backend/request:backend.md", content: REQUEST_BACKEND_VARIANT },
        { path: "backend/request:backend:urgent.md", content: grandchild },
      ]);
    });

    let result: any;

    await when("an agent calls pact_discover", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_discover", {});
    });

    await thenAssert("the grandchild variant is excluded (single-level only)", () => {
      const names = result.pacts.map((p: any) => p.name);
      expect(names).not.toContain("request:backend:urgent");
    });

    await thenAssert("base and first-level variant are still returned", () => {
      const names = result.pacts.map((p: any) => p.name);
      expect(names).toContain("request");
      expect(names).toContain("request:backend");
    });
  });

  it("handles empty pact-store directory gracefully", async () => {
    ctx = createTestRepos();

    await given("pact-store directory exists but contains no .md files", () => {
      mkdirSync(join(ctx.aliceRepo, "pact-store"), { recursive: true });
      writeFileSync(join(ctx.aliceRepo, "pact-store", ".gitkeep"), "");
      execSync(
        `cd "${ctx.aliceRepo}" && git add -A && git commit -m "empty pact-store" && git push`,
        { stdio: "pipe" },
      );
    });

    let result: any;

    await when("an agent calls pact_discover", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_discover", {});
    });

    await thenAssert("catalog returns empty pacts array without error", () => {
      // May fall back to old pacts/ directory if it exists
      expect(Array.isArray(result.pacts)).toBe(true);
    });
  });

  it("malformed YAML in flat-file pact is skipped without crashing", async () => {
    ctx = createTestRepos();

    const malformed = `---
name: broken
description: [invalid yaml here
scope: global
---

# Broken
`;

    await given("pact-store has one valid and one malformed pact", () => {
      seedFlatFilePacts(ctx.aliceRepo, [
        { path: "ask.md", content: ASK_PACT },
        { path: "broken.md", content: malformed },
      ]);
    });

    let result: any;

    await when("an agent calls pact_discover", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_discover", {});
    });

    await thenAssert("the broken pact is excluded", () => {
      const names = result.pacts.map((p: any) => p.name);
      expect(names).not.toContain("broken");
    });

    await thenAssert("valid pacts are still returned", () => {
      const names = result.pacts.map((p: any) => p.name);
      expect(names).toContain("ask");
    });
  });

  it("non-.md files in pact-store are ignored", async () => {
    ctx = createTestRepos();

    await given("pact-store contains .md pacts and non-.md files", () => {
      seedFlatFilePacts(ctx.aliceRepo, [
        { path: "ask.md", content: ASK_PACT },
      ]);
      writeFileSync(join(ctx.aliceRepo, "pact-store", "README.txt"), "Not a pact");
      writeFileSync(join(ctx.aliceRepo, "pact-store", "notes.json"), "{}");
      execSync(
        `cd "${ctx.aliceRepo}" && git add -A && git commit -m "add non-md files" && git push`,
        { stdio: "pipe" },
      );
    });

    let result: any;

    await when("an agent calls pact_discover", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_discover", {});
    });

    await thenAssert("only .md pact files are in the catalog", () => {
      const names = result.pacts.map((p: any) => p.name);
      expect(names).toEqual(["ask"]);
    });
  });

  it.skip("falls back to old pacts/ directory when pact-store/ does not exist", async () => {
    ctx = createTestRepos();

    await given("repo has pacts in old pacts/{name}/PACT.md format only", () => {
      // createTestRepos already seeds pacts/sanity-check/PACT.md
      expect(true).toBe(true);
    });

    let result: any;

    await when("an agent calls pact_discover (no pact-store/ directory)", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_discover", {});
    });

    await thenAssert("old-format pacts are still discoverable", () => {
      const names = result.pacts.map((p: any) => p.name);
      expect(names).toContain("sanity-check");
    });
  });
});
