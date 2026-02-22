/**
 * Acceptance Tests -- pact_discover (Pact & Team Discovery Tool)
 *
 * Traces to: US-019
 *
 * Tests exercise the pact_discover driving port (tool handler) against
 * real local git repos. Scenarios verify:
 *   - Lists all available pacts with metadata (name, description, when_to_use, context_bundle, response_bundle)
 *   - Keyword search filters pacts by name, description, and when_to_use content
 *   - Search returns empty array when no pacts match (not an error)
 *   - Search matches against when_to_use section content
 *   - Prefers schema.json for field extraction when available
 *   - Falls back to PACT.md parsing when no schema.json exists
 *   - Pulls latest from remote before scanning
 *   - Falls back to local data with warning when git pull fails
 *   - Returns team members alongside pacts
 *
 * Error/edge scenarios: 4 of 10 total (40%)
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
// Pact content fixtures (old-format Markdown, no YAML frontmatter)
// ---------------------------------------------------------------------------

const ASK_PACT = `# Ask

A general question needing another person's view.

## When To Use
When you have a question that needs human judgment or context that an LLM cannot provide.

## Context Bundle Fields
| Field | Required | Description |
|-------|----------|-------------|
| question | yes | The question to ask |
| background | no | Background context for the question |

## Response Structure
| Field | Description |
|-------|-------------|
| answer | The answer to the question |
| reasoning | Reasoning behind the answer |
| caveats | Any caveats or limitations |
`;

const CODE_REVIEW_PACT = `# Code Review

Request a code review on a branch or changeset.

## When To Use
When you need a teammate to review code changes before merging.

## Context Bundle Fields
| Field | Required | Description |
|-------|----------|-------------|
| repository | yes | Repository name |
| branch | yes | Branch to review |
| language | yes | Primary language |
| description | yes | What the changes do |
| areas_of_concern | no | Specific areas to focus on |
| related_tickets | no | Related ticket references |

## Response Structure
| Field | Description |
|-------|-------------|
| status | approve / request-changes / comment |
| summary | Overall assessment |
| blocking_feedback | Issues that must be fixed |
| advisory_feedback | Suggestions for improvement |
| questions | Questions for the author |
`;

const DESIGN_PACT = `# Design Pact

Collaboratively design a new pact.

## When To Use
When you want to create a new PACT pact type with a colleague.

## Context Bundle Fields
| Field | Required | Description |
|-------|----------|-------------|
| pact_name | yes | Name for the new pact |
| use_case | yes | When this pact would be used |
| draft_fields | no | Initial field ideas |

## Response Structure
| Field | Description |
|-------|-------------|
| feedback | Assessment of the proposed pact |
| suggested_fields | Recommended field structure |
| concerns | Any concerns about the design |
`;

const SANITY_CHECK_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  pact_name: "sanity-check",
  pact_version: "1.0.0",
  context_bundle: {
    type: "object",
    required: ["customer", "product", "issue_summary", "involved_files", "investigation_so_far", "question"],
    properties: {
      customer: { type: "string", description: "Customer name" },
      product: { type: "string", description: "Product name and version" },
      issue_summary: { type: "string", description: "Brief description of the issue" },
      involved_files: { type: "string", description: "Files examined" },
      investigation_so_far: { type: "string", description: "What you have found" },
      question: { type: "string", description: "Specific question for the reviewer" },
      zendesk_ticket: { type: "string", description: "Related Zendesk ticket ID" },
    },
    additionalProperties: true,
  },
  response_bundle: {
    type: "object",
    required: ["answer", "evidence", "recommendation"],
    properties: {
      answer: { type: "string", description: "YES / NO / PARTIALLY with brief explanation" },
      evidence: { type: "string", description: "What you compared or examined" },
      concerns: { type: "string", description: "Any risks or caveats" },
      recommendation: { type: "string", description: "Suggested next step" },
    },
    additionalProperties: true,
  },
};

/** Set up a multi-pact repo with PACT.md files and optional schema.json. */
function seedPacts(
  repoPath: string,
  opts?: { includeSchema?: boolean },
): void {
  // ask pact
  mkdirSync(join(repoPath, "pacts", "ask"), { recursive: true });
  writeFileSync(join(repoPath, "pacts", "ask", "PACT.md"), ASK_PACT);

  // code-review pact
  mkdirSync(join(repoPath, "pacts", "code-review"), { recursive: true });
  writeFileSync(join(repoPath, "pacts", "code-review", "PACT.md"), CODE_REVIEW_PACT);

  // design-pact
  mkdirSync(join(repoPath, "pacts", "design-pact"), { recursive: true });
  writeFileSync(join(repoPath, "pacts", "design-pact", "PACT.md"), DESIGN_PACT);

  // sanity-check already exists from createTestRepos, but we overwrite for consistency

  // Optionally add schema.json for sanity-check
  if (opts?.includeSchema) {
    writeFileSync(
      join(repoPath, "pacts", "sanity-check", "schema.json"),
      JSON.stringify(SANITY_CHECK_SCHEMA, null, 2),
    );
  }

  execSync(
    `cd "${repoPath}" && git add -A && git commit -m "seed pacts" && git push`,
    { stdio: "pipe" },
  );
}

describe("pact_discover: discover available request types and team", () => {
  let ctx: TestRepoContext;

  afterEach(() => {
    ctx?.cleanup();
  });

  // =========================================================================
  // Walking Skeleton
  // =========================================================================

  it("lists all available pacts with metadata when called with no query", async () => {
    ctx = createTestRepos();

    await given("the PACT repo has 4 pacts installed", () => {
      seedPacts(ctx.aliceRepo);
    });

    let result: any;

    await when("Cory's agent calls pact_discover with no query", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_discover", {});
    });

    await thenAssert("the result contains 4 pact entries sorted alphabetically by name", () => {
      expect(result.pacts).toHaveLength(4);
      // Verify alphabetical sort order (kills sort removal and comparator mutants)
      const names = result.pacts.map((s: any) => s.name);
      expect(names).toEqual(["ask", "code-review", "design-pact", "sanity-check"]);
    });

    await thenAssert("each entry includes name, description, when_to_use (array), context_bundle, and response_bundle", () => {
      for (const pact of result.pacts) {
        expect(pact.name).toBeTruthy();
        expect(pact.description).toBeTruthy();
        expect(Array.isArray(pact.when_to_use)).toBe(true);
        expect(pact.when_to_use.length).toBeGreaterThan(0);
        expect(pact.context_bundle).toBeDefined();
        expect(typeof pact.context_bundle.fields).toBe("object");
        expect(pact.response_bundle).toBeDefined();
        expect(typeof pact.response_bundle.fields).toBe("object");
      }
    });

    await thenAssert("the result includes team members", () => {
      expect(Array.isArray(result.team)).toBe(true);
      expect(result.team.length).toBeGreaterThan(0);
      expect(result.team[0]).toHaveProperty("user_id");
      expect(result.team[0]).toHaveProperty("display_name");
    });
  });

  // =========================================================================
  // Happy Path -- Field Extraction from PACT.md
  // =========================================================================

  it("extracts context and response field names from PACT.md tables", async () => {
    ctx = createTestRepos();

    await given("the PACT repo has pacts including sanity-check with PACT.md", () => {
      seedPacts(ctx.aliceRepo);
    });

    let result: any;

    await when("Cory's agent calls pact_discover with no query", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_discover", {});
    });

    await thenAssert("the sanity-check entry has context_bundle.fields from the PACT.md table", () => {
      const sc = result.pacts.find((s: any) => s.name === "sanity-check");
      expect(sc).toBeDefined();
      const fieldNames = Object.keys(sc.context_bundle.fields);
      expect(fieldNames).toEqual(
        expect.arrayContaining(["customer", "product", "issue_summary", "involved_files", "investigation_so_far", "question"]),
      );
    });

    await thenAssert("the sanity-check entry has response_bundle.fields from the PACT.md table", () => {
      const sc = result.pacts.find((s: any) => s.name === "sanity-check");
      const fieldNames = Object.keys(sc.response_bundle.fields);
      expect(fieldNames).toEqual(
        expect.arrayContaining(["answer", "evidence", "recommendation"]),
      );
    });
  });

  // =========================================================================
  // Happy Path -- Search
  // =========================================================================

  it("filters pacts by keyword matching against name and description", async () => {
    ctx = createTestRepos();

    await given("the PACT repo has 4 pacts", () => {
      seedPacts(ctx.aliceRepo);
    });

    let result: any;

    await when("Cory's agent calls pact_discover with query 'review code'", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_discover", { query: "review code" });
    });

    await thenAssert("the result includes the code-review pact", () => {
      const names = result.pacts.map((s: any) => s.name);
      expect(names).toContain("code-review");
    });

    await thenAssert("the result does not include unrelated pacts", () => {
      const names = result.pacts.map((s: any) => s.name);
      expect(names).not.toContain("ask");
      expect(names).not.toContain("design-pact");
    });
  });

  it("matches when any search term hits (OR semantics, not AND)", async () => {
    ctx = createTestRepos();

    await given("the PACT repo has 4 pacts", () => {
      seedPacts(ctx.aliceRepo);
    });

    let result: any;

    await when("the agent searches with 'sanity deploy' (sanity matches one pact, deploy matches none)", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_discover", { query: "sanity deploy" });
    });

    await thenAssert("the sanity-check pact is included (any term match = included)", () => {
      const names = result.pacts.map((s: any) => s.name);
      expect(names).toContain("sanity-check");
      // With AND semantics this would return 0 results since 'deploy' matches nothing
    });
  });

  it("matches search query against the when_to_use section content", async () => {
    ctx = createTestRepos();

    await given("the sanity-check pact's when_to_use says 'validate your findings'", () => {
      seedPacts(ctx.aliceRepo);
    });

    let result: any;

    await when("Cory's agent calls pact_discover with query 'validate findings'", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_discover", { query: "validate findings" });
    });

    await thenAssert("the result includes the sanity-check pact", () => {
      const names = result.pacts.map((s: any) => s.name);
      expect(names).toContain("sanity-check");
    });
  });

  // =========================================================================
  // Happy Path -- schema.json Preference
  // =========================================================================

  it("prefers schema.json for field extraction when schema.json exists", async () => {
    ctx = createTestRepos();

    await given("the sanity-check pact has both PACT.md and schema.json", () => {
      seedPacts(ctx.aliceRepo, { includeSchema: true });
    });

    let result: any;

    await when("Cory's agent calls pact_discover with no query", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_discover", {});
    });

    await thenAssert("the sanity-check entry has context_bundle.fields from schema.json", () => {
      const sc = result.pacts.find((s: any) => s.name === "sanity-check");
      expect(sc).toBeDefined();
      const fieldNames = Object.keys(sc.context_bundle.fields);
      // schema.json includes zendesk_ticket as a property (even though optional)
      expect(fieldNames).toEqual(
        expect.arrayContaining(["customer", "product", "issue_summary", "involved_files", "investigation_so_far", "question", "zendesk_ticket"]),
      );
    });

    await thenAssert("the sanity-check entry has required fields from schema.json", () => {
      const sc = result.pacts.find((s: any) => s.name === "sanity-check");
      expect(sc.context_bundle.required).toEqual(
        expect.arrayContaining(["customer", "product", "issue_summary"]),
      );
    });
  });

  it("falls back to PACT.md parsing when no schema.json exists", async () => {
    ctx = createTestRepos();

    await given("the ask pact has PACT.md but no schema.json", () => {
      seedPacts(ctx.aliceRepo);
    });

    let result: any;

    await when("Cory's agent calls pact_discover with no query", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_discover", {});
    });

    await thenAssert("the ask entry has context_bundle.fields extracted from PACT.md", () => {
      const ask = result.pacts.find((s: any) => s.name === "ask");
      expect(ask).toBeDefined();
      const fieldNames = Object.keys(ask.context_bundle.fields);
      expect(fieldNames).toEqual(
        expect.arrayContaining(["question"]),
      );
    });

    await thenAssert("the ask entry has has_hooks set to false (no brain processing)", () => {
      const ask = result.pacts.find((s: any) => s.name === "ask");
      expect(ask.has_hooks).toBe(false);
    });
  });

  // =========================================================================
  // Edge Cases / Error Paths
  // =========================================================================

  it("handles multi-space query terms by splitting on whitespace runs", async () => {
    ctx = createTestRepos();

    await given("the PACT repo has 4 pacts", () => {
      seedPacts(ctx.aliceRepo);
    });

    let result: any;

    await when("the agent searches with 'code  review' (double space)", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_discover", { query: "code  review" });
    });

    await thenAssert("the result includes code-review (extra spaces are handled)", () => {
      const names = result.pacts.map((s: any) => s.name);
      expect(names).toContain("code-review");
      // With /\s/ instead of /\s+/, splitting "code  review" produces ["code", "", "review"]
      // The empty string "" would match everything, so ALL pacts would appear
      // With correct /\s+/, we get ["code", "review"] - only matching code-review
      expect(result.pacts.length).toBeLessThanOrEqual(2);
    });
  });

  it("returns empty pacts array when query matches nothing", async () => {
    ctx = createTestRepos();

    await given("the PACT repo has 4 pacts", () => {
      seedPacts(ctx.aliceRepo);
    });

    let result: any;

    await when("Maria Santos's agent calls pact_discover with query 'deploy pipeline'", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_discover", { query: "deploy pipeline" });
    });

    await thenAssert("the result contains 0 pacts and is not an error", () => {
      expect(result.pacts).toHaveLength(0);
      // result should be a valid response object, not thrown error
      expect(result.pacts).toEqual([]);
    });
  });

  it("pulls latest from remote before scanning pacts directory", async () => {
    ctx = createTestRepos();

    await given("Alice has a pact catalog and Bob adds a new pact", async () => {
      seedPacts(ctx.aliceRepo);
      // Bob adds a new pact directly to the remote via his clone
      const pactDir = join(ctx.bobRepo, "pacts", "bug-report");
      execSync(`cd "${ctx.bobRepo}" && git pull --rebase`, { stdio: "pipe" });
      mkdirSync(pactDir, { recursive: true });
      writeFileSync(
        join(pactDir, "PACT.md"),
        `# Bug Report\n\nFile a bug report for triage.\n\n## When To Use\nWhen you find a bug.\n\n## Context Bundle Fields\n| Field | Required | Description |\n|-------|----------|-------------|\n| title | yes | Bug title |\n\n## Response Structure\n| Field | Description |\n|-------|-------------|\n| status | Triage status |\n`,
      );
      execSync(
        `cd "${ctx.bobRepo}" && git add -A && git commit -m "add bug-report pact" && git push`,
        { stdio: "pipe" },
      );
    });

    let result: any;

    await when("Alice calls pact_discover (her local is behind)", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_discover", {});
    });

    await thenAssert("the result includes the new bug-report pact added by Bob", () => {
      const names = result.pacts.map((s: any) => s.name);
      expect(names).toContain("bug-report");
      expect(result.pacts.length).toBe(5);
    });
  });

  it("falls back to local data with warning when git pull fails", async () => {
    ctx = createTestRepos();

    await given("Alice has pacts locally but the remote is unreachable", async () => {
      seedPacts(ctx.aliceRepo);
      // Break the remote
      execSync(`mv "${ctx.remotePath}" "${ctx.remotePath}.broken"`, { stdio: "pipe" });
    });

    let result: any;

    await when("Alice calls pact_discover with a broken remote", async () => {
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

  it("excludes hidden directories (dot-prefixed) from pact listing", async () => {
    ctx = createTestRepos();

    await given("the pacts directory has a .hidden directory and a directory ending with dot", () => {
      seedPacts(ctx.aliceRepo);
      // .hidden should be excluded (starts with dot)
      mkdirSync(join(ctx.aliceRepo, "pacts", ".hidden-pact"), { recursive: true });
      writeFileSync(
        join(ctx.aliceRepo, "pacts", ".hidden-pact", "PACT.md"),
        `# Hidden\n\nShould not appear.\n\n## When To Use\nNever.\n\n## Context Bundle Fields\n| Field | Required |\n|-------|----------|\n| x | yes |\n\n## Response Structure\n| Field | Description |\n|-------|-------------|\n| y | result |\n`,
      );
      // "ends-with-dot." should NOT be excluded (the filter is startsWith, not endsWith)
      mkdirSync(join(ctx.aliceRepo, "pacts", "ends-with-dot."), { recursive: true });
      writeFileSync(
        join(ctx.aliceRepo, "pacts", "ends-with-dot.", "PACT.md"),
        `# Ends With Dot\n\nShould appear.\n\n## When To Use\nAlways.\n\n## Context Bundle Fields\n| Field | Required |\n|-------|----------|\n| z | yes |\n\n## Response Structure\n| Field | Description |\n|-------|-------------|\n| w | result |\n`,
      );
      execSync(
        `cd "${ctx.aliceRepo}" && git add -A && git commit -m "hidden and dot-end pacts" && git push`,
        { stdio: "pipe" },
      );
    });

    let result: any;

    await when("the agent calls pact_discover", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_discover", {});
    });

    await thenAssert("the .hidden-pact is excluded but ends-with-dot. is included", () => {
      const names = result.pacts.map((s: any) => s.name);
      expect(names).not.toContain(".hidden-pact");
      expect(names).toContain("ends-with-dot.");
    });
  });

  it("silently skips pact directories that have no PACT.md file", async () => {
    ctx = createTestRepos();

    await given("a pact directory exists with no PACT.md", () => {
      seedPacts(ctx.aliceRepo);
      mkdirSync(join(ctx.aliceRepo, "pacts", "broken-pact"), { recursive: true });
      writeFileSync(join(ctx.aliceRepo, "pacts", "broken-pact", ".gitkeep"), "");
      execSync(
        `cd "${ctx.aliceRepo}" && git add -A && git commit -m "broken pact dir" && git push`,
        { stdio: "pipe" },
      );
    });

    let result: any;

    await when("Cory's agent calls pact_discover", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_discover", {});
    });

    await thenAssert("the broken-pact is not in the results", () => {
      const names = result.pacts.map((s: any) => s.name);
      expect(names).not.toContain("broken-pact");
    });

    await thenAssert("other valid pacts are still returned", () => {
      expect(result.pacts.length).toBe(4);
    });
  });
});
