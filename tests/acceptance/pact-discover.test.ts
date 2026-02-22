/**
 * Acceptance Tests -- pact_discover (Collapsed Pact Discovery)
 *
 * Feature: collapsed-tools-brain
 *
 * Tests exercise the pact_discover driving port (tool handler) against
 * real local git repos with YAML frontmatter pacts. Scenarios verify:
 *   - Discovers all pacts with structured metadata from YAML frontmatter
 *   - Returns context_bundle and response_bundle field definitions
 *   - Indicates brain processing capability with has_hooks flag
 *   - Filters by keyword query across name, description, and when_to_use
 *   - Returns team members from config
 *   - Pulls latest from remote before returning catalog
 *   - Falls back to local data with warning when remote is unreachable
 *   - Gracefully handles missing/malformed PACT.md files
 *
 * Error/edge scenarios: 6 of 15 total (40%)
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
import { createPactServer } from "../../src/server.ts";

// ---------------------------------------------------------------------------
// YAML frontmatter pact fixtures
// ---------------------------------------------------------------------------

const ASK_PACT_YAML = `---
name: ask
version: "1.0.0"
description: "A general-purpose request for when you need input, an opinion, or an answer from a teammate."
when_to_use:
  - "You have a question that needs another person's perspective"
  - "You want to get a gut check, recommendation, or decision"
  - "The question doesn't fit a more structured pact type"
context_bundle:
  required:
    - question
  fields:
    question:
      type: string
      description: "The question you're asking -- be specific"
    background:
      type: string
      description: "Relevant context the recipient needs to answer well"
    urgency:
      type: string
      description: "low, normal, or high -- defaults to normal"
  additionalProperties: true
response_bundle:
  required:
    - answer
  fields:
    answer:
      type: string
      description: "Direct answer to the question"
    reasoning:
      type: string
      description: "Why this answer, briefly"
  additionalProperties: true
---

# Ask a Question

A general-purpose request for when you need input, an opinion, or an answer from a teammate.

## Tips

- Be specific in your question
- Include background context
`;

const SANITY_CHECK_PACT_YAML = `---
name: sanity-check
version: "1.0.0"
description: "Get a colleague to validate your findings on a bug investigation."
when_to_use:
  - "When you need a colleague to validate your findings on a bug investigation"
context_bundle:
  required:
    - customer
    - product
    - issue_summary
    - involved_files
    - investigation_so_far
    - question
  fields:
    customer:
      type: string
      description: "Customer name"
    product:
      type: string
      description: "Product name and version"
    issue_summary:
      type: string
      description: "Brief description of the issue"
    involved_files:
      type: string
      description: "Files examined"
    investigation_so_far:
      type: string
      description: "What you have found"
    question:
      type: string
      description: "Specific question for the reviewer"
    zendesk_ticket:
      type: string
      description: "Related Zendesk ticket ID"
  additionalProperties: true
response_bundle:
  required:
    - answer
    - recommendation
  fields:
    answer:
      type: string
      description: "YES / NO / PARTIALLY with brief explanation"
    evidence:
      type: string
      description: "What you compared or examined"
    recommendation:
      type: string
      description: "Suggested next step"
  additionalProperties: true
---

# Sanity Check

Get a colleague to validate your findings on a bug investigation.
`;

const CODE_REVIEW_PACT_YAML = `---
name: code-review
version: "1.0.0"
description: "Request a code review on a branch or changeset."
when_to_use:
  - "When you need a teammate to review code changes before merging"
context_bundle:
  required:
    - repository
    - branch
    - description
  fields:
    repository:
      type: string
      description: "Repository name"
    branch:
      type: string
      description: "Branch to review"
    description:
      type: string
      description: "What the changes do"
  additionalProperties: true
response_bundle:
  required:
    - status
    - summary
  fields:
    status:
      type: string
      description: "approve / request-changes / comment"
    summary:
      type: string
      description: "Overall assessment"
  additionalProperties: true
hooks:
  validation:
    - when:
        context_bundle.description:
          equals: ""
      then:
        warn: "Description is empty -- reviewer will lack context"
  enrichment:
    - when:
        context_bundle.repository:
          contains: "production"
      then:
        set:
          context_bundle.priority_flag: true
---

# Code Review

Request a code review on a branch or changeset.
`;

const MALFORMED_YAML_PACT = `---
name: broken
version: "1.0.0"
description: [this is not valid yaml
  missing: closing bracket
---

# Broken Pact

This pact has malformed YAML frontmatter.
`;

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

/** Seed pacts in YAML frontmatter format and push to remote. */
function seedYamlPacts(
  repoPath: string,
  opts?: { includeBrain?: boolean },
): void {
  // ask pact (no brain processing)
  mkdirSync(join(repoPath, "pacts", "ask"), { recursive: true });
  writeFileSync(join(repoPath, "pacts", "ask", "PACT.md"), ASK_PACT_YAML);

  // sanity-check -- overwrite old markdown format with YAML frontmatter
  writeFileSync(
    join(repoPath, "pacts", "sanity-check", "PACT.md"),
    SANITY_CHECK_PACT_YAML,
  );

  if (opts?.includeBrain) {
    // code-review pact (with hooks)
    mkdirSync(join(repoPath, "pacts", "code-review"), { recursive: true });
    writeFileSync(
      join(repoPath, "pacts", "code-review", "PACT.md"),
      CODE_REVIEW_PACT_YAML,
    );
  }

  execSync(
    `cd "${repoPath}" && git add -A && git commit -m "seed YAML pacts" && git push`,
    { stdio: "pipe" },
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("pact_discover: discover available request types and team", () => {
  let ctx: TestRepoContext;

  afterEach(() => {
    ctx?.cleanup();
  });

  // =========================================================================
  // Walking Skeleton
  // =========================================================================

  it("discovers available request types and team members from YAML pacts", async () => {
    ctx = createTestRepos();

    await given("the team has YAML pacts installed", () => {
      seedYamlPacts(ctx.aliceRepo, { includeBrain: true });
    });

    let result: any;

    await when("an agent calls pact_discover", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_discover", {});
    });

    await thenAssert("the catalog includes all installed pacts sorted by name", () => {
      expect(result.pacts).toHaveLength(3);
      const names = result.pacts.map((s: any) => s.name);
      expect(names).toEqual(["ask", "code-review", "sanity-check"]);
    });

    await thenAssert("each pact has name, description, and when_to_use from YAML frontmatter", () => {
      const ask = result.pacts.find((s: any) => s.name === "ask");
      expect(ask.description).toBe(
        "A general-purpose request for when you need input, an opinion, or an answer from a teammate.",
      );
      expect(ask.when_to_use).toEqual(expect.arrayContaining([
        "You have a question that needs another person's perspective",
      ]));
    });

    await thenAssert("each pact has context_bundle with required fields and field definitions", () => {
      const ask = result.pacts.find((s: any) => s.name === "ask");
      expect(ask.context_bundle.required).toEqual(["question"]);
      expect(ask.context_bundle.fields.question).toEqual({
        type: "string",
        description: "The question you're asking -- be specific",
      });
    });

    await thenAssert("the catalog includes team members from config", () => {
      expect(result.team).toHaveLength(2);
      expect(result.team).toEqual(
        expect.arrayContaining([
          { user_id: "alice", display_name: "Alice" },
          { user_id: "bob", display_name: "Bob" },
        ]),
      );
    });
  });

  // =========================================================================
  // Milestone 1: Pact Catalog Details
  // =========================================================================

  it("returns response_bundle schema with required fields and field definitions", async () => {
    ctx = createTestRepos();

    await given("the team has YAML pacts installed", () => {
      seedYamlPacts(ctx.aliceRepo);
    });

    let result: any;

    await when("an agent calls pact_discover", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_discover", {});
    });

    await thenAssert("the sanity-check pact has response_bundle with required fields", () => {
      const sc = result.pacts.find((s: any) => s.name === "sanity-check");
      expect(sc.response_bundle.required).toEqual(["answer", "recommendation"]);
    });

    await thenAssert("response_bundle fields include type and description", () => {
      const sc = result.pacts.find((s: any) => s.name === "sanity-check");
      expect(sc.response_bundle.fields.answer).toEqual({
        type: "string",
        description: "YES / NO / PARTIALLY with brief explanation",
      });
      expect(sc.response_bundle.fields.recommendation).toEqual({
        type: "string",
        description: "Suggested next step",
      });
    });
  });

  it("reports has_hooks as true when pact has hooks section", async () => {
    ctx = createTestRepos();

    await given("the team has a code-review pact with brain processing rules", () => {
      seedYamlPacts(ctx.aliceRepo, { includeBrain: true });
    });

    let result: any;

    await when("an agent calls pact_discover", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_discover", {});
    });

    await thenAssert("the code-review pact has has_hooks set to true", () => {
      const cr = result.pacts.find((s: any) => s.name === "code-review");
      expect(cr.has_hooks).toBe(true);
    });
  });

  it("reports has_hooks as false when pact has no hooks section", async () => {
    ctx = createTestRepos();

    await given("the team has an ask pact without brain processing rules", () => {
      seedYamlPacts(ctx.aliceRepo);
    });

    let result: any;

    await when("an agent calls pact_discover", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_discover", {});
    });

    await thenAssert("the ask pact has has_hooks set to false", () => {
      const ask = result.pacts.find((s: any) => s.name === "ask");
      expect(ask.has_hooks).toBe(false);
    });
  });

  it("returns context_bundle with all defined field metadata", async () => {
    ctx = createTestRepos();

    await given("the sanity-check pact defines 7 context fields in YAML frontmatter", () => {
      seedYamlPacts(ctx.aliceRepo);
    });

    let result: any;

    await when("an agent calls pact_discover", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_discover", {});
    });

    await thenAssert("the sanity-check context_bundle includes all required field names", () => {
      const sc = result.pacts.find((s: any) => s.name === "sanity-check");
      expect(sc.context_bundle.required).toEqual([
        "customer", "product", "issue_summary",
        "involved_files", "investigation_so_far", "question",
      ]);
    });

    await thenAssert("the context_bundle includes optional fields in the fields map", () => {
      const sc = result.pacts.find((s: any) => s.name === "sanity-check");
      expect(sc.context_bundle.fields).toHaveProperty("zendesk_ticket");
      expect(sc.context_bundle.fields.zendesk_ticket.type).toBe("string");
    });
  });

  it("pulls latest pacts from remote before returning catalog", async () => {
    ctx = createTestRepos();

    await given("Alice has YAML pacts and Bob adds a new pact to the remote", async () => {
      seedYamlPacts(ctx.aliceRepo);
      // Bob adds a new pact directly to the remote via his clone
      execSync(`cd "${ctx.bobRepo}" && git pull --rebase`, { stdio: "pipe" });
      const pactDir = join(ctx.bobRepo, "pacts", "bug-report");
      mkdirSync(pactDir, { recursive: true });
      writeFileSync(
        join(pactDir, "PACT.md"),
        `---
name: bug-report
version: "1.0.0"
description: "File a bug report for triage."
when_to_use:
  - "When you find a bug that needs to be triaged"
context_bundle:
  required:
    - title
  fields:
    title:
      type: string
      description: "Bug title"
  additionalProperties: true
response_bundle:
  required:
    - status
  fields:
    status:
      type: string
      description: "Triage status"
  additionalProperties: true
---

# Bug Report

File a bug report for triage.
`,
      );
      execSync(
        `cd "${ctx.bobRepo}" && git add -A && git commit -m "add bug-report pact" && git push`,
        { stdio: "pipe" },
      );
    });

    let result: any;

    await when("Alice's agent calls pact_discover (her local is behind)", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_discover", {});
    });

    await thenAssert("the catalog includes the bug-report pact added by Bob", () => {
      const names = result.pacts.map((s: any) => s.name);
      expect(names).toContain("bug-report");
      expect(result.pacts).toHaveLength(3); // ask + sanity-check + bug-report
    });
  });

  // =========================================================================
  // Milestone 2: Discovery Filtering
  // =========================================================================

  it("filters pacts by keyword matching against name, description, and when_to_use", async () => {
    ctx = createTestRepos();

    await given("the team has multiple YAML pacts", () => {
      seedYamlPacts(ctx.aliceRepo, { includeBrain: true });
    });

    let result: any;

    await when("an agent calls pact_discover with query 'review code'", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_discover", { query: "review code" });
    });

    await thenAssert("the result includes the code-review pact", () => {
      const names = result.pacts.map((s: any) => s.name);
      expect(names).toContain("code-review");
    });

    await thenAssert("the result excludes unrelated pacts", () => {
      const names = result.pacts.map((s: any) => s.name);
      expect(names).not.toContain("ask");
    });
  });

  it("returns empty pacts when query matches no available types", async () => {
    ctx = createTestRepos();

    await given("the team has YAML pacts installed", () => {
      seedYamlPacts(ctx.aliceRepo);
    });

    let result: any;

    await when("an agent calls pact_discover with query 'deploy pipeline'", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_discover", { query: "deploy pipeline" });
    });

    await thenAssert("the result contains 0 pacts and is not an error", () => {
      expect(result.pacts).toHaveLength(0);
      expect(result.pacts).toEqual([]);
    });

    await thenAssert("team members are still returned even with empty pact results", () => {
      expect(result.team).toHaveLength(2);
    });
  });

  it("matches query against when_to_use content for discovery", async () => {
    ctx = createTestRepos();

    await given("the sanity-check pact's when_to_use mentions 'validate your findings'", () => {
      seedYamlPacts(ctx.aliceRepo);
    });

    let result: any;

    await when("an agent calls pact_discover with query 'validate findings'", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_discover", { query: "validate findings" });
    });

    await thenAssert("the sanity-check pact is included in results", () => {
      const names = result.pacts.map((s: any) => s.name);
      expect(names).toContain("sanity-check");
    });
  });

  // =========================================================================
  // Milestone 3: Error Resilience
  // =========================================================================

  it("falls back to local catalog with warning when remote is unreachable", async () => {
    ctx = createTestRepos();

    await given("Alice has YAML pacts locally but the remote is unreachable", async () => {
      seedYamlPacts(ctx.aliceRepo);
      execSync(`mv "${ctx.remotePath}" "${ctx.remotePath}.broken"`, { stdio: "pipe" });
    });

    let result: any;

    await when("Alice's agent calls pact_discover with a broken remote", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_discover", {});
    });

    await thenAssert("pacts are returned from local data", () => {
      expect(result.pacts.length).toBeGreaterThan(0);
    });

    await thenAssert("a staleness warning is included", () => {
      expect(result.warning).toMatch(/stale|local/i);
    });

    // Restore remote for cleanup
    await thenAssert("(cleanup) restore remote", () => {
      execSync(`mv "${ctx.remotePath}.broken" "${ctx.remotePath}"`, { stdio: "pipe" });
    });
  });

  it("skips pact directories that have no PACT.md", async () => {
    ctx = createTestRepos();

    await given("a pact directory exists with no PACT.md", () => {
      seedYamlPacts(ctx.aliceRepo);
      mkdirSync(join(ctx.aliceRepo, "pacts", "empty-pact"), { recursive: true });
      writeFileSync(join(ctx.aliceRepo, "pacts", "empty-pact", ".gitkeep"), "");
      execSync(
        `cd "${ctx.aliceRepo}" && git add -A && git commit -m "empty pact dir" && git push`,
        { stdio: "pipe" },
      );
    });

    let result: any;

    await when("an agent calls pact_discover", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_discover", {});
    });

    await thenAssert("the empty-pact is not in the catalog", () => {
      const names = result.pacts.map((s: any) => s.name);
      expect(names).not.toContain("empty-pact");
    });

    await thenAssert("other valid pacts are still returned", () => {
      expect(result.pacts).toHaveLength(2); // ask + sanity-check
    });
  });

  it("skips pact with malformed YAML frontmatter without crashing", async () => {
    ctx = createTestRepos();

    await given("a pact has malformed YAML frontmatter alongside valid pacts", () => {
      seedYamlPacts(ctx.aliceRepo);
      mkdirSync(join(ctx.aliceRepo, "pacts", "broken"), { recursive: true });
      writeFileSync(
        join(ctx.aliceRepo, "pacts", "broken", "PACT.md"),
        MALFORMED_YAML_PACT,
      );
      execSync(
        `cd "${ctx.aliceRepo}" && git add -A && git commit -m "malformed pact" && git push`,
        { stdio: "pipe" },
      );
    });

    let result: any;

    await when("an agent calls pact_discover", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_discover", {});
    });

    await thenAssert("the broken pact is excluded from the catalog", () => {
      const names = result.pacts.map((s: any) => s.name);
      expect(names).not.toContain("broken");
    });

    await thenAssert("valid pacts are still returned", () => {
      expect(result.pacts).toHaveLength(2); // ask + sanity-check
    });
  });

  it("excludes hidden directories from pact listing", async () => {
    ctx = createTestRepos();

    await given("the pacts directory has a hidden directory", () => {
      seedYamlPacts(ctx.aliceRepo);
      mkdirSync(join(ctx.aliceRepo, "pacts", ".hidden-pact"), { recursive: true });
      writeFileSync(
        join(ctx.aliceRepo, "pacts", ".hidden-pact", "PACT.md"),
        ASK_PACT_YAML,
      );
      execSync(
        `cd "${ctx.aliceRepo}" && git add -A && git commit -m "hidden pact" && git push`,
        { stdio: "pipe" },
      );
    });

    let result: any;

    await when("an agent calls pact_discover", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_discover", {});
    });

    await thenAssert("the hidden directory is excluded from results", () => {
      const names = result.pacts.map((s: any) => s.name);
      expect(names).not.toContain(".hidden-pact");
      expect(result.pacts).toHaveLength(2); // ask + sanity-check
    });
  });

  it("returns empty catalog when no pacts are installed", async () => {
    ctx = createTestRepos();

    await given("the pacts directory contains only .gitkeep", () => {
      // Remove the default sanity-check pact that createTestRepos adds
      execSync(
        `cd "${ctx.aliceRepo}" && rm -rf pacts/sanity-check && git add -A && git commit -m "remove pacts" && git push`,
        { stdio: "pipe" },
      );
    });

    let result: any;

    await when("an agent calls pact_discover", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_discover", {});
    });

    await thenAssert("the pacts array is empty", () => {
      expect(result.pacts).toHaveLength(0);
    });

    await thenAssert("team members are still returned", () => {
      expect(result.team).toHaveLength(2);
    });
  });

  it("handles PACT.md with valid frontmatter delimiters but empty YAML", async () => {
    ctx = createTestRepos();

    await given("a pact has empty YAML between frontmatter delimiters", () => {
      seedYamlPacts(ctx.aliceRepo);
      mkdirSync(join(ctx.aliceRepo, "pacts", "empty-yaml"), { recursive: true });
      writeFileSync(
        join(ctx.aliceRepo, "pacts", "empty-yaml", "PACT.md"),
        "---\n---\n\n# Empty YAML Pact\n",
      );
      execSync(
        `cd "${ctx.aliceRepo}" && git add -A && git commit -m "empty yaml pact" && git push`,
        { stdio: "pipe" },
      );
    });

    let result: any;

    await when("an agent calls pact_discover", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_discover", {});
    });

    await thenAssert("the empty-yaml pact is excluded from the catalog", () => {
      const names = result.pacts.map((s: any) => s.name);
      expect(names).not.toContain("empty-yaml");
    });

    await thenAssert("valid pacts are still returned", () => {
      expect(result.pacts).toHaveLength(2); // ask + sanity-check
    });
  });
});
