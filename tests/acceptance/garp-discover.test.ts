/**
 * Acceptance Tests -- garp_discover (Collapsed Skill Discovery)
 *
 * Feature: collapsed-tools-brain
 *
 * Tests exercise the garp_discover driving port (tool handler) against
 * real local git repos with YAML frontmatter skill contracts. Scenarios verify:
 *   - Discovers all skills with structured metadata from YAML frontmatter
 *   - Returns context_bundle and response_bundle field definitions
 *   - Indicates brain processing capability with has_brain flag
 *   - Filters by keyword query across name, description, and when_to_use
 *   - Returns team members from config
 *   - Pulls latest from remote before returning catalog
 *   - Falls back to local data with warning when remote is unreachable
 *   - Gracefully handles missing/malformed SKILL.md files
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
import { createGarpServer } from "../../src/server.ts";

// ---------------------------------------------------------------------------
// YAML frontmatter skill fixtures
// ---------------------------------------------------------------------------

const ASK_SKILL_YAML = `---
name: ask
version: "1.0.0"
description: "A general-purpose request for when you need input, an opinion, or an answer from a teammate."
when_to_use:
  - "You have a question that needs another person's perspective"
  - "You want to get a gut check, recommendation, or decision"
  - "The question doesn't fit a more structured skill type"
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

const SANITY_CHECK_SKILL_YAML = `---
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

const CODE_REVIEW_SKILL_YAML = `---
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
brain_processing:
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

const MALFORMED_YAML_SKILL = `---
name: broken
version: "1.0.0"
description: [this is not valid yaml
  missing: closing bracket
---

# Broken Skill

This skill has malformed YAML frontmatter.
`;

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

/** Seed skills in YAML frontmatter format and push to remote. */
function seedYamlSkills(
  repoPath: string,
  opts?: { includeBrain?: boolean },
): void {
  // ask skill (no brain processing)
  mkdirSync(join(repoPath, "skills", "ask"), { recursive: true });
  writeFileSync(join(repoPath, "skills", "ask", "SKILL.md"), ASK_SKILL_YAML);

  // sanity-check -- overwrite old markdown format with YAML frontmatter
  writeFileSync(
    join(repoPath, "skills", "sanity-check", "SKILL.md"),
    SANITY_CHECK_SKILL_YAML,
  );

  if (opts?.includeBrain) {
    // code-review skill (with brain_processing)
    mkdirSync(join(repoPath, "skills", "code-review"), { recursive: true });
    writeFileSync(
      join(repoPath, "skills", "code-review", "SKILL.md"),
      CODE_REVIEW_SKILL_YAML,
    );
  }

  execSync(
    `cd "${repoPath}" && git add -A && git commit -m "seed YAML skills" && git push`,
    { stdio: "pipe" },
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("garp_discover: discover available request types and team", () => {
  let ctx: TestRepoContext;

  afterEach(() => {
    ctx?.cleanup();
  });

  // =========================================================================
  // Walking Skeleton
  // =========================================================================

  it("discovers available request types and team members from YAML skill contracts", async () => {
    ctx = createTestRepos();

    await given("the team has YAML skill contracts installed", () => {
      seedYamlSkills(ctx.aliceRepo, { includeBrain: true });
    });

    let result: any;

    await when("an agent calls garp_discover", async () => {
      const server = createGarpServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("garp_discover", {});
    });

    await thenAssert("the catalog includes all installed skills sorted by name", () => {
      expect(result.skills).toHaveLength(3);
      const names = result.skills.map((s: any) => s.name);
      expect(names).toEqual(["ask", "code-review", "sanity-check"]);
    });

    await thenAssert("each skill has name, description, and when_to_use from YAML frontmatter", () => {
      const ask = result.skills.find((s: any) => s.name === "ask");
      expect(ask.description).toBe(
        "A general-purpose request for when you need input, an opinion, or an answer from a teammate.",
      );
      expect(ask.when_to_use).toEqual(expect.arrayContaining([
        "You have a question that needs another person's perspective",
      ]));
    });

    await thenAssert("each skill has context_bundle with required fields and field definitions", () => {
      const ask = result.skills.find((s: any) => s.name === "ask");
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
  // Milestone 1: Skill Catalog Details
  // =========================================================================

  it.skip("returns response_bundle schema with required fields and field definitions", async () => {
    ctx = createTestRepos();

    await given("the team has YAML skill contracts installed", () => {
      seedYamlSkills(ctx.aliceRepo);
    });

    let result: any;

    await when("an agent calls garp_discover", async () => {
      const server = createGarpServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("garp_discover", {});
    });

    await thenAssert("the sanity-check skill has response_bundle with required fields", () => {
      const sc = result.skills.find((s: any) => s.name === "sanity-check");
      expect(sc.response_bundle.required).toEqual(["answer", "recommendation"]);
    });

    await thenAssert("response_bundle fields include type and description", () => {
      const sc = result.skills.find((s: any) => s.name === "sanity-check");
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

  it.skip("reports has_brain as true when skill has brain_processing section", async () => {
    ctx = createTestRepos();

    await given("the team has a code-review skill with brain processing rules", () => {
      seedYamlSkills(ctx.aliceRepo, { includeBrain: true });
    });

    let result: any;

    await when("an agent calls garp_discover", async () => {
      const server = createGarpServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("garp_discover", {});
    });

    await thenAssert("the code-review skill has has_brain set to true", () => {
      const cr = result.skills.find((s: any) => s.name === "code-review");
      expect(cr.has_brain).toBe(true);
    });
  });

  it.skip("reports has_brain as false when skill has no brain_processing section", async () => {
    ctx = createTestRepos();

    await given("the team has an ask skill without brain processing rules", () => {
      seedYamlSkills(ctx.aliceRepo);
    });

    let result: any;

    await when("an agent calls garp_discover", async () => {
      const server = createGarpServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("garp_discover", {});
    });

    await thenAssert("the ask skill has has_brain set to false", () => {
      const ask = result.skills.find((s: any) => s.name === "ask");
      expect(ask.has_brain).toBe(false);
    });
  });

  it.skip("returns context_bundle with all defined field metadata", async () => {
    ctx = createTestRepos();

    await given("the sanity-check skill defines 7 context fields in YAML frontmatter", () => {
      seedYamlSkills(ctx.aliceRepo);
    });

    let result: any;

    await when("an agent calls garp_discover", async () => {
      const server = createGarpServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("garp_discover", {});
    });

    await thenAssert("the sanity-check context_bundle includes all required field names", () => {
      const sc = result.skills.find((s: any) => s.name === "sanity-check");
      expect(sc.context_bundle.required).toEqual([
        "customer", "product", "issue_summary",
        "involved_files", "investigation_so_far", "question",
      ]);
    });

    await thenAssert("the context_bundle includes optional fields in the fields map", () => {
      const sc = result.skills.find((s: any) => s.name === "sanity-check");
      expect(sc.context_bundle.fields).toHaveProperty("zendesk_ticket");
      expect(sc.context_bundle.fields.zendesk_ticket.type).toBe("string");
    });
  });

  it.skip("pulls latest skills from remote before returning catalog", async () => {
    ctx = createTestRepos();

    await given("Alice has YAML skills and Bob adds a new skill to the remote", async () => {
      seedYamlSkills(ctx.aliceRepo);
      // Bob adds a new skill directly to the remote via his clone
      execSync(`cd "${ctx.bobRepo}" && git pull --rebase`, { stdio: "pipe" });
      const skillDir = join(ctx.bobRepo, "skills", "bug-report");
      mkdirSync(skillDir, { recursive: true });
      writeFileSync(
        join(skillDir, "SKILL.md"),
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
        `cd "${ctx.bobRepo}" && git add -A && git commit -m "add bug-report skill" && git push`,
        { stdio: "pipe" },
      );
    });

    let result: any;

    await when("Alice's agent calls garp_discover (her local is behind)", async () => {
      const server = createGarpServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("garp_discover", {});
    });

    await thenAssert("the catalog includes the bug-report skill added by Bob", () => {
      const names = result.skills.map((s: any) => s.name);
      expect(names).toContain("bug-report");
      expect(result.skills).toHaveLength(3); // ask + sanity-check + bug-report
    });
  });

  // =========================================================================
  // Milestone 2: Discovery Filtering
  // =========================================================================

  it.skip("filters skills by keyword matching against name, description, and when_to_use", async () => {
    ctx = createTestRepos();

    await given("the team has multiple YAML skill contracts", () => {
      seedYamlSkills(ctx.aliceRepo, { includeBrain: true });
    });

    let result: any;

    await when("an agent calls garp_discover with query 'review code'", async () => {
      const server = createGarpServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("garp_discover", { query: "review code" });
    });

    await thenAssert("the result includes the code-review skill", () => {
      const names = result.skills.map((s: any) => s.name);
      expect(names).toContain("code-review");
    });

    await thenAssert("the result excludes unrelated skills", () => {
      const names = result.skills.map((s: any) => s.name);
      expect(names).not.toContain("ask");
    });
  });

  it.skip("returns empty skills when query matches no available types", async () => {
    ctx = createTestRepos();

    await given("the team has YAML skill contracts installed", () => {
      seedYamlSkills(ctx.aliceRepo);
    });

    let result: any;

    await when("an agent calls garp_discover with query 'deploy pipeline'", async () => {
      const server = createGarpServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("garp_discover", { query: "deploy pipeline" });
    });

    await thenAssert("the result contains 0 skills and is not an error", () => {
      expect(result.skills).toHaveLength(0);
      expect(result.skills).toEqual([]);
    });

    await thenAssert("team members are still returned even with empty skill results", () => {
      expect(result.team).toHaveLength(2);
    });
  });

  it.skip("matches query against when_to_use content for discovery", async () => {
    ctx = createTestRepos();

    await given("the sanity-check skill's when_to_use mentions 'validate your findings'", () => {
      seedYamlSkills(ctx.aliceRepo);
    });

    let result: any;

    await when("an agent calls garp_discover with query 'validate findings'", async () => {
      const server = createGarpServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("garp_discover", { query: "validate findings" });
    });

    await thenAssert("the sanity-check skill is included in results", () => {
      const names = result.skills.map((s: any) => s.name);
      expect(names).toContain("sanity-check");
    });
  });

  // =========================================================================
  // Milestone 3: Error Resilience
  // =========================================================================

  it.skip("falls back to local catalog with warning when remote is unreachable", async () => {
    ctx = createTestRepos();

    await given("Alice has YAML skills locally but the remote is unreachable", async () => {
      seedYamlSkills(ctx.aliceRepo);
      execSync(`mv "${ctx.remotePath}" "${ctx.remotePath}.broken"`, { stdio: "pipe" });
    });

    let result: any;

    await when("Alice's agent calls garp_discover with a broken remote", async () => {
      const server = createGarpServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("garp_discover", {});
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

  it.skip("skips skill directories that have no SKILL.md", async () => {
    ctx = createTestRepos();

    await given("a skill directory exists with no SKILL.md", () => {
      seedYamlSkills(ctx.aliceRepo);
      mkdirSync(join(ctx.aliceRepo, "skills", "empty-skill"), { recursive: true });
      writeFileSync(join(ctx.aliceRepo, "skills", "empty-skill", ".gitkeep"), "");
      execSync(
        `cd "${ctx.aliceRepo}" && git add -A && git commit -m "empty skill dir" && git push`,
        { stdio: "pipe" },
      );
    });

    let result: any;

    await when("an agent calls garp_discover", async () => {
      const server = createGarpServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("garp_discover", {});
    });

    await thenAssert("the empty-skill is not in the catalog", () => {
      const names = result.skills.map((s: any) => s.name);
      expect(names).not.toContain("empty-skill");
    });

    await thenAssert("other valid skills are still returned", () => {
      expect(result.skills).toHaveLength(2); // ask + sanity-check
    });
  });

  it.skip("skips skill with malformed YAML frontmatter without crashing", async () => {
    ctx = createTestRepos();

    await given("a skill has malformed YAML frontmatter alongside valid skills", () => {
      seedYamlSkills(ctx.aliceRepo);
      mkdirSync(join(ctx.aliceRepo, "skills", "broken"), { recursive: true });
      writeFileSync(
        join(ctx.aliceRepo, "skills", "broken", "SKILL.md"),
        MALFORMED_YAML_SKILL,
      );
      execSync(
        `cd "${ctx.aliceRepo}" && git add -A && git commit -m "malformed skill" && git push`,
        { stdio: "pipe" },
      );
    });

    let result: any;

    await when("an agent calls garp_discover", async () => {
      const server = createGarpServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("garp_discover", {});
    });

    await thenAssert("the broken skill is excluded from the catalog", () => {
      const names = result.skills.map((s: any) => s.name);
      expect(names).not.toContain("broken");
    });

    await thenAssert("valid skills are still returned", () => {
      expect(result.skills).toHaveLength(2); // ask + sanity-check
    });
  });

  it.skip("excludes hidden directories from skill listing", async () => {
    ctx = createTestRepos();

    await given("the skills directory has a hidden directory", () => {
      seedYamlSkills(ctx.aliceRepo);
      mkdirSync(join(ctx.aliceRepo, "skills", ".hidden-skill"), { recursive: true });
      writeFileSync(
        join(ctx.aliceRepo, "skills", ".hidden-skill", "SKILL.md"),
        ASK_SKILL_YAML,
      );
      execSync(
        `cd "${ctx.aliceRepo}" && git add -A && git commit -m "hidden skill" && git push`,
        { stdio: "pipe" },
      );
    });

    let result: any;

    await when("an agent calls garp_discover", async () => {
      const server = createGarpServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("garp_discover", {});
    });

    await thenAssert("the hidden directory is excluded from results", () => {
      const names = result.skills.map((s: any) => s.name);
      expect(names).not.toContain(".hidden-skill");
      expect(result.skills).toHaveLength(2); // ask + sanity-check
    });
  });

  it.skip("returns empty catalog when no skills are installed", async () => {
    ctx = createTestRepos();

    await given("the skills directory contains only .gitkeep", () => {
      // Remove the default sanity-check skill that createTestRepos adds
      execSync(
        `cd "${ctx.aliceRepo}" && rm -rf skills/sanity-check && git add -A && git commit -m "remove skills" && git push`,
        { stdio: "pipe" },
      );
    });

    let result: any;

    await when("an agent calls garp_discover", async () => {
      const server = createGarpServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("garp_discover", {});
    });

    await thenAssert("the skills array is empty", () => {
      expect(result.skills).toHaveLength(0);
    });

    await thenAssert("team members are still returned", () => {
      expect(result.team).toHaveLength(2);
    });
  });

  it.skip("handles SKILL.md with valid frontmatter delimiters but empty YAML", async () => {
    ctx = createTestRepos();

    await given("a skill has empty YAML between frontmatter delimiters", () => {
      seedYamlSkills(ctx.aliceRepo);
      mkdirSync(join(ctx.aliceRepo, "skills", "empty-yaml"), { recursive: true });
      writeFileSync(
        join(ctx.aliceRepo, "skills", "empty-yaml", "SKILL.md"),
        "---\n---\n\n# Empty YAML Skill\n",
      );
      execSync(
        `cd "${ctx.aliceRepo}" && git add -A && git commit -m "empty yaml skill" && git push`,
        { stdio: "pipe" },
      );
    });

    let result: any;

    await when("an agent calls garp_discover", async () => {
      const server = createGarpServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("garp_discover", {});
    });

    await thenAssert("the empty-yaml skill is excluded from the catalog", () => {
      const names = result.skills.map((s: any) => s.name);
      expect(names).not.toContain("empty-yaml");
    });

    await thenAssert("valid skills are still returned", () => {
      expect(result.skills).toHaveLength(2); // ask + sanity-check
    });
  });
});
