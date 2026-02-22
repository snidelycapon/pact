/**
 * Acceptance Tests -- garp_skills (Skill Discovery Tool)
 *
 * Traces to: US-019
 *
 * Tests exercise the garp_skills driving port (tool handler) against
 * real local git repos. Scenarios verify:
 *   - Lists all available skills with metadata (name, description, when_to_use, context_fields, response_fields, skill_path)
 *   - Keyword search filters skills by name, description, and when_to_use content
 *   - Search returns empty array when no skills match (not an error)
 *   - Search matches against when_to_use section content
 *   - Prefers schema.json for field extraction when available
 *   - Falls back to SKILL.md parsing when no schema.json exists
 *   - Pulls latest from remote before scanning
 *   - Falls back to local data with warning when git pull fails
 *   - Includes has_schema flag indicating schema.json presence
 *
 * Error/edge scenarios: 4 of 10 total (40%)
 */

import { describe, it, expect, afterEach } from "vitest";
import {
  createTestRepos,
  fileExists,
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

const CODE_REVIEW_SKILL = `# Code Review

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

const DESIGN_SKILL = `# Design Skill

Collaboratively design a new skill contract.

## When To Use
When you want to create a new GARP skill type with a colleague.

## Context Bundle Fields
| Field | Required | Description |
|-------|----------|-------------|
| skill_name | yes | Name for the new skill |
| use_case | yes | When this skill would be used |
| draft_fields | no | Initial field ideas |

## Response Structure
| Field | Description |
|-------|-------------|
| feedback | Assessment of the proposed skill |
| suggested_fields | Recommended field structure |
| concerns | Any concerns about the design |
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

/** Set up a multi-skill repo with SKILL.md files and optional schema.json. */
function seedSkills(
  repoPath: string,
  opts?: { includeSchema?: boolean },
): void {
  // ask skill
  mkdirSync(join(repoPath, "skills", "ask"), { recursive: true });
  writeFileSync(join(repoPath, "skills", "ask", "SKILL.md"), ASK_SKILL);

  // code-review skill
  mkdirSync(join(repoPath, "skills", "code-review"), { recursive: true });
  writeFileSync(join(repoPath, "skills", "code-review", "SKILL.md"), CODE_REVIEW_SKILL);

  // design-skill
  mkdirSync(join(repoPath, "skills", "design-skill"), { recursive: true });
  writeFileSync(join(repoPath, "skills", "design-skill", "SKILL.md"), DESIGN_SKILL);

  // sanity-check already exists from createTestRepos, but we overwrite for consistency

  // Optionally add schema.json for sanity-check
  if (opts?.includeSchema) {
    writeFileSync(
      join(repoPath, "skills", "sanity-check", "schema.json"),
      JSON.stringify(SANITY_CHECK_SCHEMA, null, 2),
    );
  }

  execSync(
    `cd "${repoPath}" && git add -A && git commit -m "seed skills" && git push`,
    { stdio: "pipe" },
  );
}

describe("garp_skills: discover available request types", () => {
  let ctx: TestRepoContext;

  afterEach(() => {
    ctx?.cleanup();
  });

  // =========================================================================
  // Walking Skeleton
  // =========================================================================

  it("lists all available skills with metadata when called with no query", async () => {
    ctx = createTestRepos();

    await given("the GARP repo has 4 skills installed", () => {
      seedSkills(ctx.aliceRepo);
    });

    let result: any;

    await when("Cory's agent calls garp_skills with no query", async () => {
      const server = createGarpServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("garp_skills", {});
    });

    await thenAssert("the result contains 4 skill entries", () => {
      expect(result.skills).toHaveLength(4);
    });

    await thenAssert("each entry includes name, description, when_to_use, context_fields, response_fields, and skill_path", () => {
      for (const skill of result.skills) {
        expect(skill.name).toBeTruthy();
        expect(skill.description).toBeTruthy();
        expect(skill.when_to_use).toBeTruthy();
        expect(Array.isArray(skill.context_fields)).toBe(true);
        expect(Array.isArray(skill.response_fields)).toBe(true);
        expect(skill.skill_path).toBeTruthy();
      }
    });
  });

  // =========================================================================
  // Happy Path -- Field Extraction from SKILL.md
  // =========================================================================

  it("extracts context and response field names from SKILL.md tables", async () => {
    ctx = createTestRepos();

    await given("the GARP repo has skills including sanity-check with SKILL.md", () => {
      seedSkills(ctx.aliceRepo);
    });

    let result: any;

    await when("Cory's agent calls garp_skills with no query", async () => {
      const server = createGarpServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("garp_skills", {});
    });

    await thenAssert("the sanity-check entry has context_fields from the SKILL.md table", () => {
      const sc = result.skills.find((s: any) => s.name === "sanity-check");
      expect(sc).toBeDefined();
      expect(sc.context_fields).toEqual(
        expect.arrayContaining(["customer", "product", "issue_summary", "involved_files", "investigation_so_far", "question"]),
      );
    });

    await thenAssert("the sanity-check entry has response_fields from the SKILL.md table", () => {
      const sc = result.skills.find((s: any) => s.name === "sanity-check");
      expect(sc.response_fields).toEqual(
        expect.arrayContaining(["answer", "evidence", "recommendation"]),
      );
    });
  });

  // =========================================================================
  // Happy Path -- Search
  // =========================================================================

  it("filters skills by keyword matching against name and description", async () => {
    ctx = createTestRepos();

    await given("the GARP repo has 4 skills", () => {
      seedSkills(ctx.aliceRepo);
    });

    let result: any;

    await when("Cory's agent calls garp_skills with query 'review code'", async () => {
      const server = createGarpServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("garp_skills", { query: "review code" });
    });

    await thenAssert("the result includes the code-review skill", () => {
      const names = result.skills.map((s: any) => s.name);
      expect(names).toContain("code-review");
    });

    await thenAssert("the result does not include unrelated skills", () => {
      const names = result.skills.map((s: any) => s.name);
      expect(names).not.toContain("ask");
      expect(names).not.toContain("design-skill");
    });
  });

  it("matches search query against the when_to_use section content", async () => {
    ctx = createTestRepos();

    await given("the sanity-check skill's when_to_use says 'validate your findings'", () => {
      seedSkills(ctx.aliceRepo);
    });

    let result: any;

    await when("Cory's agent calls garp_skills with query 'validate findings'", async () => {
      const server = createGarpServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("garp_skills", { query: "validate findings" });
    });

    await thenAssert("the result includes the sanity-check skill", () => {
      const names = result.skills.map((s: any) => s.name);
      expect(names).toContain("sanity-check");
    });
  });

  // =========================================================================
  // Happy Path -- schema.json Preference
  // =========================================================================

  it("prefers schema.json for field extraction when schema.json exists", async () => {
    ctx = createTestRepos();

    await given("the sanity-check skill has both SKILL.md and schema.json", () => {
      seedSkills(ctx.aliceRepo, { includeSchema: true });
    });

    let result: any;

    await when("Cory's agent calls garp_skills with no query", async () => {
      const server = createGarpServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("garp_skills", {});
    });

    await thenAssert("the sanity-check entry has context_fields from schema.json", () => {
      const sc = result.skills.find((s: any) => s.name === "sanity-check");
      expect(sc).toBeDefined();
      // schema.json includes zendesk_ticket as a property (even though optional)
      expect(sc.context_fields).toEqual(
        expect.arrayContaining(["customer", "product", "issue_summary", "involved_files", "investigation_so_far", "question", "zendesk_ticket"]),
      );
    });

    await thenAssert("the sanity-check entry has has_schema set to true", () => {
      const sc = result.skills.find((s: any) => s.name === "sanity-check");
      expect(sc.has_schema).toBe(true);
    });
  });

  it("falls back to SKILL.md parsing when no schema.json exists", async () => {
    ctx = createTestRepos();

    await given("the ask skill has SKILL.md but no schema.json", () => {
      seedSkills(ctx.aliceRepo);
    });

    let result: any;

    await when("Cory's agent calls garp_skills with no query", async () => {
      const server = createGarpServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("garp_skills", {});
    });

    await thenAssert("the ask entry has context_fields extracted from SKILL.md", () => {
      const ask = result.skills.find((s: any) => s.name === "ask");
      expect(ask).toBeDefined();
      expect(ask.context_fields).toEqual(
        expect.arrayContaining(["question"]),
      );
    });

    await thenAssert("the ask entry has has_schema set to false", () => {
      const ask = result.skills.find((s: any) => s.name === "ask");
      expect(ask.has_schema).toBe(false);
    });
  });

  // =========================================================================
  // Edge Cases / Error Paths
  // =========================================================================

  it("returns empty skills array when query matches nothing", async () => {
    ctx = createTestRepos();

    await given("the GARP repo has 4 skills", () => {
      seedSkills(ctx.aliceRepo);
    });

    let result: any;

    await when("Maria Santos's agent calls garp_skills with query 'deploy pipeline'", async () => {
      const server = createGarpServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("garp_skills", { query: "deploy pipeline" });
    });

    await thenAssert("the result contains 0 skills and is not an error", () => {
      expect(result.skills).toHaveLength(0);
      // result should be a valid response object, not thrown error
      expect(result.skills).toEqual([]);
    });
  });

  it("pulls latest from remote before scanning skills directory", async () => {
    ctx = createTestRepos();

    await given("Alice has a skill catalog and Bob adds a new skill", async () => {
      seedSkills(ctx.aliceRepo);
      // Bob adds a new skill directly to the remote via his clone
      const skillDir = join(ctx.bobRepo, "skills", "bug-report");
      execSync(`cd "${ctx.bobRepo}" && git pull --rebase`, { stdio: "pipe" });
      mkdirSync(skillDir, { recursive: true });
      writeFileSync(
        join(skillDir, "SKILL.md"),
        `# Bug Report\n\nFile a bug report for triage.\n\n## When To Use\nWhen you find a bug.\n\n## Context Bundle Fields\n| Field | Required | Description |\n|-------|----------|-------------|\n| title | yes | Bug title |\n\n## Response Structure\n| Field | Description |\n|-------|-------------|\n| status | Triage status |\n`,
      );
      execSync(
        `cd "${ctx.bobRepo}" && git add -A && git commit -m "add bug-report skill" && git push`,
        { stdio: "pipe" },
      );
    });

    let result: any;

    await when("Alice calls garp_skills (her local is behind)", async () => {
      const server = createGarpServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("garp_skills", {});
    });

    await thenAssert("the result includes the new bug-report skill added by Bob", () => {
      const names = result.skills.map((s: any) => s.name);
      expect(names).toContain("bug-report");
      expect(result.skills.length).toBe(5);
    });
  });

  it("falls back to local data with warning when git pull fails", async () => {
    ctx = createTestRepos();

    await given("Alice has skills locally but the remote is unreachable", async () => {
      seedSkills(ctx.aliceRepo);
      // Break the remote
      execSync(`mv "${ctx.remotePath}" "${ctx.remotePath}.broken"`, { stdio: "pipe" });
    });

    let result: any;

    await when("Alice calls garp_skills with a broken remote", async () => {
      const server = createGarpServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("garp_skills", {});
    });

    await thenAssert("skills are returned from local data", () => {
      expect(result.skills.length).toBeGreaterThan(0);
    });

    await thenAssert("a staleness warning is included", () => {
      expect(result.warning).toMatch(/stale|local/i);
    });

    // Restore remote for cleanup
    await thenAssert("(cleanup) restore remote", () => {
      execSync(`mv "${ctx.remotePath}.broken" "${ctx.remotePath}"`, { stdio: "pipe" });
    });
  });

  it("silently skips skill directories that have no SKILL.md file", async () => {
    ctx = createTestRepos();

    await given("a skill directory exists with no SKILL.md", () => {
      seedSkills(ctx.aliceRepo);
      mkdirSync(join(ctx.aliceRepo, "skills", "broken-skill"), { recursive: true });
      writeFileSync(join(ctx.aliceRepo, "skills", "broken-skill", ".gitkeep"), "");
      execSync(
        `cd "${ctx.aliceRepo}" && git add -A && git commit -m "broken skill dir" && git push`,
        { stdio: "pipe" },
      );
    });

    let result: any;

    await when("Cory's agent calls garp_skills", async () => {
      const server = createGarpServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("garp_skills", {});
    });

    await thenAssert("the broken-skill is not in the results", () => {
      const names = result.skills.map((s: any) => s.name);
      expect(names).not.toContain("broken-skill");
    });

    await thenAssert("other valid skills are still returned", () => {
      expect(result.skills.length).toBe(4);
    });
  });
});
