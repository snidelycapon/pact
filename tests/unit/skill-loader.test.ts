/**
 * Unit tests for skill-loader module.
 *
 * Tests YAML frontmatter parsing from SKILL.md files.
 * Uses an in-memory FilePort test double (no real filesystem).
 *
 * Scenarios cover:
 *   - Valid YAML frontmatter (ask skill fixture)
 *   - brain_processing section present (code-review fixture)
 *   - brain_processing section absent
 *   - context_bundle with all 7 fields (sanity-check fixture)
 *   - response_bundle with required fields
 *   - Missing SKILL.md returns undefined
 *   - Malformed YAML returns undefined
 *   - Empty frontmatter returns undefined
 *   - SKILL.md without frontmatter delimiters returns undefined
 *   - when_to_use normalizes single string to array
 *   - getRequiredContextFieldsFromYaml convenience function
 */

import { describe, it, expect } from "vitest";
import type { FilePort } from "../../src/ports.ts";

// ---------------------------------------------------------------------------
// In-memory FilePort test double
// ---------------------------------------------------------------------------

interface InMemoryFiles {
  [path: string]: string | Record<string, unknown>;
}

function createInMemoryFilePort(files: InMemoryFiles): FilePort {
  return {
    async readJSON<T>(path: string): Promise<T> {
      const content = files[path];
      if (content === undefined) throw new Error(`File not found: ${path}`);
      if (typeof content === "string") return JSON.parse(content) as T;
      return content as T;
    },
    async writeJSON(_path: string, _data: unknown): Promise<void> {
      throw new Error("writeJSON not implemented in test double");
    },
    async writeText(_path: string, _content: string): Promise<void> {
      throw new Error("writeText not implemented in test double");
    },
    async readText(path: string): Promise<string> {
      const content = files[path];
      if (content === undefined) throw new Error(`File not found: ${path}`);
      if (typeof content === "string") return content;
      return JSON.stringify(content, null, 2);
    },
    async listDirectory(path: string): Promise<string[]> {
      const prefix = path.endsWith("/") ? path : path + "/";
      const entries = new Set<string>();
      for (const key of Object.keys(files)) {
        if (key.startsWith(prefix)) {
          const rest = key.slice(prefix.length);
          const firstSegment = rest.split("/")[0];
          if (firstSegment) entries.add(firstSegment);
        }
      }
      return Array.from(entries);
    },
    async moveFile(_from: string, _to: string): Promise<void> {
      throw new Error("moveFile not implemented in test double");
    },
    async fileExists(path: string): Promise<boolean> {
      return path in files;
    },
  };
}

// ---------------------------------------------------------------------------
// YAML frontmatter fixtures
// ---------------------------------------------------------------------------

const ASK_SKILL_MD = `---
name: ask
description: A general-purpose request for when you need input, an opinion, or an answer from a teammate.
when_to_use:
  - You have a question that needs another person's perspective
  - You want a gut check, recommendation, or decision from someone
  - The question doesn't fit a more structured skill type
context_bundle:
  required:
    - question
  fields:
    question:
      type: string
      description: The question you're asking -- be specific
    background:
      type: string
      description: Relevant context the recipient needs to answer well
    options:
      type: string
      description: If you've identified possible answers, list them here
    urgency:
      type: string
      description: low, normal, or high -- defaults to normal
response_bundle:
  required:
    - answer
  fields:
    answer:
      type: string
      description: Direct answer to the question
    reasoning:
      type: string
      description: Why this answer, briefly
    caveats:
      type: string
      description: Anything the sender should keep in mind
---

# Ask a Question

A general-purpose request for when you need input, an opinion, or an answer from a teammate.
`;

const CODE_REVIEW_SKILL_MD = `---
name: code-review
version: "1.0.0"
description: Request a code review on a branch, PR, or changeset.
when_to_use:
  - You finished a feature branch or bug fix and want a teammate to review before merging
  - You want to flag specific areas of concern so the reviewer knows where to focus
  - You need structured feedback that distinguishes blocking issues from suggestions
context_bundle:
  required:
    - repository
    - branch
    - language
    - description
  fields:
    repository:
      type: string
      description: Repository name
    branch:
      type: string
      description: Branch name or PR reference
    language:
      type: string
      description: Primary programming language
    description:
      type: string
      description: What changed and why
    areas_of_concern:
      type: string
      description: Specific areas the sender is uncertain about
    related_tickets:
      type: string
      description: Related issue or ticket IDs
response_bundle:
  required:
    - status
    - summary
    - blocking_feedback
  fields:
    status:
      type: string
      description: approved, changes_requested, or questions
    summary:
      type: string
      description: Overall assessment in 1-2 sentences
    blocking_feedback:
      type: array
      description: Issues that must be fixed before merging
    advisory_feedback:
      type: array
      description: Suggestions and style notes that are non-blocking
    questions:
      type: array
      description: Clarifying questions for the sender
brain_processing:
  model: claude-sonnet-4-20250514
  system_prompt: |
    You are a senior code reviewer. Analyze the diff and provide structured feedback.
  output_fields:
    - status
    - summary
    - blocking_feedback
    - advisory_feedback
---

# Code Review

Request a code review on a branch, PR, or changeset.
`;

const SANITY_CHECK_SKILL_MD = `---
name: sanity-check
description: Validate findings on a bug investigation.
when_to_use:
  - You are investigating a bug and found something suspicious
  - You need to confirm whether a pattern matches a known issue
  - You want a colleague's domain expertise on a specific question
  - You have done the initial investigation and need validation
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
      description: Customer name
    product:
      type: string
      description: Product name and version
    issue_summary:
      type: string
      description: Brief description of the issue being investigated
    involved_files:
      type: string
      description: Files examined during investigation
    investigation_so_far:
      type: string
      description: What you have found
    question:
      type: string
      description: Specific question for the reviewer
    zendesk_ticket:
      type: string
      description: Related Zendesk ticket ID
response_bundle:
  required:
    - answer
    - evidence
    - recommendation
  fields:
    answer:
      type: string
      description: YES / NO / PARTIALLY with brief explanation
    evidence:
      type: string
      description: What you compared or examined
    concerns:
      type: string
      description: Any risks or caveats
    recommendation:
      type: string
      description: Suggested next step
---

# Sanity Check

Validate findings on a bug investigation.
`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("skill-loader: valid YAML frontmatter", () => {

  it("parses ask skill metadata from YAML frontmatter", async () => {
    const file = createInMemoryFilePort({
      "skills/ask/SKILL.md": ASK_SKILL_MD,
    });

    const { loadSkillMetadata } = await import("../../src/skill-loader.ts");
    const result = await loadSkillMetadata(file, "ask");

    expect(result).toBeDefined();
    expect(result!.name).toBe("ask");
    expect(result!.description).toBe(
      "A general-purpose request for when you need input, an opinion, or an answer from a teammate.",
    );
    expect(result!.when_to_use).toEqual([
      "You have a question that needs another person's perspective",
      "You want a gut check, recommendation, or decision from someone",
      "The question doesn't fit a more structured skill type",
    ]);
  });

  it("extracts context_bundle fields and required list", async () => {
    const file = createInMemoryFilePort({
      "skills/ask/SKILL.md": ASK_SKILL_MD,
    });

    const { loadSkillMetadata } = await import("../../src/skill-loader.ts");
    const result = await loadSkillMetadata(file, "ask");

    expect(result).toBeDefined();
    expect(result!.context_bundle.required).toEqual(["question"]);
    expect(Object.keys(result!.context_bundle.fields)).toEqual([
      "question", "background", "options", "urgency",
    ]);
    expect(result!.context_bundle.fields["question"]).toEqual({
      type: "string",
      description: "The question you're asking -- be specific",
    });
  });

  it("extracts response_bundle fields and required list", async () => {
    const file = createInMemoryFilePort({
      "skills/ask/SKILL.md": ASK_SKILL_MD,
    });

    const { loadSkillMetadata } = await import("../../src/skill-loader.ts");
    const result = await loadSkillMetadata(file, "ask");

    expect(result).toBeDefined();
    expect(result!.response_bundle.required).toEqual(["answer"]);
    expect(Object.keys(result!.response_bundle.fields)).toEqual([
      "answer", "reasoning", "caveats",
    ]);
  });
});

describe("skill-loader: brain_processing", () => {

  it("sets has_brain to true when brain_processing section is present", async () => {
    const file = createInMemoryFilePort({
      "skills/code-review/SKILL.md": CODE_REVIEW_SKILL_MD,
    });

    const { loadSkillMetadata } = await import("../../src/skill-loader.ts");
    const result = await loadSkillMetadata(file, "code-review");

    expect(result).toBeDefined();
    expect(result!.has_brain).toBe(true);
  });

  it("sets has_brain to false when brain_processing section is absent", async () => {
    const file = createInMemoryFilePort({
      "skills/ask/SKILL.md": ASK_SKILL_MD,
    });

    const { loadSkillMetadata } = await import("../../src/skill-loader.ts");
    const result = await loadSkillMetadata(file, "ask");

    expect(result).toBeDefined();
    expect(result!.has_brain).toBe(false);
  });
});

describe("skill-loader: context_bundle with all 7 fields", () => {

  it("extracts all 7 context fields from sanity-check fixture", async () => {
    const file = createInMemoryFilePort({
      "skills/sanity-check/SKILL.md": SANITY_CHECK_SKILL_MD,
    });

    const { loadSkillMetadata } = await import("../../src/skill-loader.ts");
    const result = await loadSkillMetadata(file, "sanity-check");

    expect(result).toBeDefined();
    expect(Object.keys(result!.context_bundle.fields)).toEqual([
      "customer", "product", "issue_summary",
      "involved_files", "investigation_so_far", "question", "zendesk_ticket",
    ]);
    expect(result!.context_bundle.required).toEqual([
      "customer", "product", "issue_summary",
      "involved_files", "investigation_so_far", "question",
    ]);
  });
});

describe("skill-loader: response_bundle with required fields", () => {

  it("extracts response_bundle required fields from sanity-check fixture", async () => {
    const file = createInMemoryFilePort({
      "skills/sanity-check/SKILL.md": SANITY_CHECK_SKILL_MD,
    });

    const { loadSkillMetadata } = await import("../../src/skill-loader.ts");
    const result = await loadSkillMetadata(file, "sanity-check");

    expect(result).toBeDefined();
    expect(result!.response_bundle.required).toEqual([
      "answer", "evidence", "recommendation",
    ]);
    expect(Object.keys(result!.response_bundle.fields)).toEqual([
      "answer", "evidence", "concerns", "recommendation",
    ]);
  });
});

describe("skill-loader: error handling", () => {

  it("returns undefined when SKILL.md does not exist", async () => {
    const file = createInMemoryFilePort({});

    const { loadSkillMetadata } = await import("../../src/skill-loader.ts");
    const result = await loadSkillMetadata(file, "nonexistent");

    expect(result).toBeUndefined();
  });

  it("returns undefined for malformed YAML frontmatter", async () => {
    const malformedYaml = `---
name: broken
description: [this is not valid yaml
  when_to_use: {{{bad
---

# Broken Skill
`;
    const file = createInMemoryFilePort({
      "skills/broken/SKILL.md": malformedYaml,
    });

    const { loadSkillMetadata } = await import("../../src/skill-loader.ts");
    const result = await loadSkillMetadata(file, "broken");

    expect(result).toBeUndefined();
  });

  it("returns undefined for empty frontmatter", async () => {
    const emptyFrontmatter = `---
---

# Empty Frontmatter Skill
`;
    const file = createInMemoryFilePort({
      "skills/empty-fm/SKILL.md": emptyFrontmatter,
    });

    const { loadSkillMetadata } = await import("../../src/skill-loader.ts");
    const result = await loadSkillMetadata(file, "empty-fm");

    expect(result).toBeUndefined();
  });

  it("returns undefined for SKILL.md without frontmatter delimiters", async () => {
    const noFrontmatter = `# No Frontmatter

This SKILL.md has no YAML frontmatter delimiters at all.

## When To Use
When you want to test.
`;
    const file = createInMemoryFilePort({
      "skills/no-fm/SKILL.md": noFrontmatter,
    });

    const { loadSkillMetadata } = await import("../../src/skill-loader.ts");
    const result = await loadSkillMetadata(file, "no-fm");

    expect(result).toBeUndefined();
  });
});

describe("skill-loader: when_to_use normalization", () => {

  it("normalizes single string when_to_use to array", async () => {
    const singleWhenToUse = `---
name: single-wtu
description: Skill with single when_to_use string.
when_to_use: When you need to do a single thing
context_bundle:
  required: []
  fields: {}
response_bundle:
  required: []
  fields: {}
---

# Single WTU
`;
    const file = createInMemoryFilePort({
      "skills/single-wtu/SKILL.md": singleWhenToUse,
    });

    const { loadSkillMetadata } = await import("../../src/skill-loader.ts");
    const result = await loadSkillMetadata(file, "single-wtu");

    expect(result).toBeDefined();
    expect(result!.when_to_use).toEqual(["When you need to do a single thing"]);
  });
});

describe("skill-loader: version field", () => {

  it("extracts version when present", async () => {
    const file = createInMemoryFilePort({
      "skills/code-review/SKILL.md": CODE_REVIEW_SKILL_MD,
    });

    const { loadSkillMetadata } = await import("../../src/skill-loader.ts");
    const result = await loadSkillMetadata(file, "code-review");

    expect(result).toBeDefined();
    expect(result!.version).toBe("1.0.0");
  });

  it("leaves version undefined when not present", async () => {
    const file = createInMemoryFilePort({
      "skills/ask/SKILL.md": ASK_SKILL_MD,
    });

    const { loadSkillMetadata } = await import("../../src/skill-loader.ts");
    const result = await loadSkillMetadata(file, "ask");

    expect(result).toBeDefined();
    expect(result!.version).toBeUndefined();
  });
});

describe("skill-loader: getRequiredContextFieldsFromYaml", () => {

  it("returns required context fields from YAML frontmatter", async () => {
    const file = createInMemoryFilePort({
      "skills/sanity-check/SKILL.md": SANITY_CHECK_SKILL_MD,
    });

    const { getRequiredContextFieldsFromYaml } = await import("../../src/skill-loader.ts");
    const result = await getRequiredContextFieldsFromYaml(file, "sanity-check");

    expect(result).toBeDefined();
    expect(result).toEqual([
      "customer", "product", "issue_summary",
      "involved_files", "investigation_so_far", "question",
    ]);
  });

  it("returns undefined when SKILL.md does not exist", async () => {
    const file = createInMemoryFilePort({});

    const { getRequiredContextFieldsFromYaml } = await import("../../src/skill-loader.ts");
    const result = await getRequiredContextFieldsFromYaml(file, "nonexistent");

    expect(result).toBeUndefined();
  });

  it("returns undefined when SKILL.md lacks frontmatter", async () => {
    const file = createInMemoryFilePort({
      "skills/no-fm/SKILL.md": "# No Frontmatter\n\nJust markdown.",
    });

    const { getRequiredContextFieldsFromYaml } = await import("../../src/skill-loader.ts");
    const result = await getRequiredContextFieldsFromYaml(file, "no-fm");

    expect(result).toBeUndefined();
  });
});
