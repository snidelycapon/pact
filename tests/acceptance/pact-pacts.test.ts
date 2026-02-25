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
 *   - Extracts field definitions from YAML frontmatter including optional fields
 *   - Extracts fields from YAML frontmatter when pact has no schema.json
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
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { createPactServer } from "../../src/server.ts";

// ---------------------------------------------------------------------------
// Pact content fixtures (YAML frontmatter format for pact-store/)
// ---------------------------------------------------------------------------

const ASK_PACT = `---
name: ask
description: A general question needing another person's view
scope: global
when_to_use:
  - When you have a question that needs human judgment or context that an LLM cannot provide
context_bundle:
  required: [question]
  fields:
    question: { type: string, description: "The question to ask" }
    background: { type: string, description: "Background context for the question" }
response_bundle:
  required: [answer]
  fields:
    answer: { type: string, description: "The answer to the question" }
    reasoning: { type: string, description: "Reasoning behind the answer" }
    caveats: { type: string, description: "Any caveats or limitations" }
---

# Ask

A general question needing another person's view.
`;

const CODE_REVIEW_PACT = `---
name: code-review
description: Request a code review on a branch or changeset
scope: global
when_to_use:
  - When you need a teammate to review code changes before merging
context_bundle:
  required: [repository, branch, language, description]
  fields:
    repository: { type: string, description: "Repository name" }
    branch: { type: string, description: "Branch to review" }
    language: { type: string, description: "Primary language" }
    description: { type: string, description: "What the changes do" }
    areas_of_concern: { type: string, description: "Specific areas to focus on" }
    related_tickets: { type: string, description: "Related ticket references" }
response_bundle:
  required: [status, summary]
  fields:
    status: { type: string, description: "approve / request-changes / comment" }
    summary: { type: string, description: "Overall assessment" }
    blocking_feedback: { type: string, description: "Issues that must be fixed" }
    advisory_feedback: { type: string, description: "Suggestions for improvement" }
    questions: { type: string, description: "Questions for the author" }
---

# Code Review

Request a code review on a branch or changeset.
`;

const DESIGN_PACT = `---
name: design-pact
description: Collaboratively design a new pact
scope: global
when_to_use:
  - When you want to create a new PACT pact type with a colleague
context_bundle:
  required: [pact_name, use_case]
  fields:
    pact_name: { type: string, description: "Name for the new pact" }
    use_case: { type: string, description: "When this pact would be used" }
    draft_fields: { type: string, description: "Initial field ideas" }
response_bundle:
  required: [feedback]
  fields:
    feedback: { type: string, description: "Assessment of the proposed pact" }
    suggested_fields: { type: string, description: "Recommended field structure" }
    concerns: { type: string, description: "Any concerns about the design" }
---

# Design Pact

Collaboratively design a new pact.
`;

const SANITY_CHECK_PACT = `---
name: sanity-check
description: Get a colleague to validate your findings on a bug investigation
scope: global
when_to_use:
  - You need a colleague to validate your findings on a bug investigation
context_bundle:
  required: [customer, product, issue_summary, involved_files, investigation_so_far, question]
  fields:
    customer: { type: string, description: "Customer name" }
    product: { type: string, description: "Product name and version" }
    issue_summary: { type: string, description: "Brief description of the issue" }
    involved_files: { type: string, description: "Files examined" }
    investigation_so_far: { type: string, description: "What you have found" }
    question: { type: string, description: "Specific question for the reviewer" }
    zendesk_ticket: { type: string, description: "Related Zendesk ticket ID" }
response_bundle:
  required: [answer, evidence, recommendation]
  fields:
    answer: { type: string, description: "YES / NO / PARTIALLY with brief explanation" }
    evidence: { type: string, description: "What you compared or examined" }
    concerns: { type: string, description: "Any risks or caveats" }
    recommendation: { type: string, description: "Suggested next step" }
---

# Sanity Check

Get a colleague to validate your findings on a bug investigation.
`;

/** Set up a multi-pact repo with flat .md files in pact-store/. */
function seedPacts(
  repoPath: string,
): void {
  // Clear pact-store/ to remove default sanity-check from createTestRepos
  const pactStorePath = join(repoPath, "pact-store");
  rmSync(pactStorePath, { recursive: true, force: true });
  mkdirSync(pactStorePath, { recursive: true });

  // Write pact flat files
  writeFileSync(join(repoPath, "pact-store", "ask.md"), ASK_PACT);
  writeFileSync(join(repoPath, "pact-store", "code-review.md"), CODE_REVIEW_PACT);
  writeFileSync(join(repoPath, "pact-store", "design-pact.md"), DESIGN_PACT);
  writeFileSync(join(repoPath, "pact-store", "sanity-check.md"), SANITY_CHECK_PACT);

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
  // Happy Path -- YAML Frontmatter Field Extraction
  // =========================================================================

  it("extracts field definitions from YAML frontmatter including optional fields", async () => {
    ctx = createTestRepos();

    await given("the sanity-check pact has YAML frontmatter with required and optional fields", () => {
      seedPacts(ctx.aliceRepo);
    });

    let result: any;

    await when("Cory's agent calls pact_discover with no query", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_discover", {});
    });

    await thenAssert("the sanity-check entry has context_bundle.fields from YAML frontmatter", () => {
      const sc = result.pacts.find((s: any) => s.name === "sanity-check");
      expect(sc).toBeDefined();
      const fieldNames = Object.keys(sc.context_bundle.fields);
      expect(fieldNames).toEqual(
        expect.arrayContaining(["customer", "product", "issue_summary", "involved_files", "investigation_so_far", "question", "zendesk_ticket"]),
      );
    });

    await thenAssert("the sanity-check entry has required fields from YAML frontmatter", () => {
      const sc = result.pacts.find((s: any) => s.name === "sanity-check");
      expect(sc.context_bundle.required).toEqual(
        expect.arrayContaining(["customer", "product", "issue_summary"]),
      );
    });
  });

  it("extracts fields from YAML frontmatter when pact has no schema.json", async () => {
    ctx = createTestRepos();

    await given("the ask pact has YAML frontmatter", () => {
      seedPacts(ctx.aliceRepo);
    });

    let result: any;

    await when("Cory's agent calls pact_discover with no query", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_discover", {});
    });

    await thenAssert("the ask entry has context_bundle.fields extracted from YAML frontmatter", () => {
      const ask = result.pacts.find((s: any) => s.name === "ask");
      expect(ask).toBeDefined();
      const fieldNames = Object.keys(ask.context_bundle.fields);
      expect(fieldNames).toEqual(
        expect.arrayContaining(["question"]),
      );
    });

    await thenAssert("the ask entry has has_hooks set to false (no hooks in YAML)", () => {
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
      execSync(`cd "${ctx.bobRepo}" && git pull --rebase`, { stdio: "pipe" });
      writeFileSync(
        join(ctx.bobRepo, "pact-store", "bug-report.md"),
        `---
name: bug-report
description: File a bug report for triage
scope: global
when_to_use:
  - When you find a bug
context_bundle:
  required: [title]
  fields:
    title: { type: string, description: "Bug title" }
response_bundle:
  required: [status]
  fields:
    status: { type: string, description: "Triage status" }
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

    await given("the pact-store has a .hidden file and a file ending with dot", () => {
      seedPacts(ctx.aliceRepo);
      // .hidden should be excluded (starts with dot)
      mkdirSync(join(ctx.aliceRepo, "pact-store", ".hidden-pact"), { recursive: true });
      writeFileSync(
        join(ctx.aliceRepo, "pact-store", ".hidden-pact", "secret.md"),
        `---\nname: hidden\ndescription: Should not appear\nwhen_to_use:\n  - Never\ncontext_bundle:\n  required: [x]\n  fields:\n    x: { type: string, description: "x" }\nresponse_bundle:\n  required: [y]\n  fields:\n    y: { type: string, description: "y" }\n---\n\n# Hidden\n`,
      );
      // "ends-with-dot." — write a pact in a directory named "ends-with-dot."
      mkdirSync(join(ctx.aliceRepo, "pact-store", "ends-with-dot."), { recursive: true });
      writeFileSync(
        join(ctx.aliceRepo, "pact-store", "ends-with-dot.", "visible.md"),
        `---\nname: ends-with-dot.\ndescription: Should appear\nwhen_to_use:\n  - Always\ncontext_bundle:\n  required: [z]\n  fields:\n    z: { type: string, description: "z" }\nresponse_bundle:\n  required: [w]\n  fields:\n    w: { type: string, description: "w" }\n---\n\n# Ends With Dot\n`,
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

  it("silently skips pact-store files that have no YAML frontmatter", async () => {
    ctx = createTestRepos();

    await given("pact-store has a .md file without YAML frontmatter", () => {
      seedPacts(ctx.aliceRepo);
      writeFileSync(
        join(ctx.aliceRepo, "pact-store", "broken-pact.md"),
        "# Broken Pact\n\nNo frontmatter at all.\n",
      );
      // Also add a non-.md file
      writeFileSync(join(ctx.aliceRepo, "pact-store", "README.txt"), "Not a pact file");
      execSync(
        `cd "${ctx.aliceRepo}" && git add -A && git commit -m "broken pact file" && git push`,
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
