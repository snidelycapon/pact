/**
 * Unit tests for pact-loader module.
 *
 * Tests YAML frontmatter parsing from PACT.md files.
 * Uses an in-memory FilePort test double (no real filesystem).
 *
 * Scenarios cover:
 *   - Valid YAML frontmatter (ask pact fixture)
 *   - hooks section present (code-review fixture)
 *   - hooks section absent
 *   - context_bundle with all 7 fields (sanity-check fixture)
 *   - response_bundle with required fields
 *   - Missing PACT.md returns undefined
 *   - Malformed YAML returns undefined
 *   - Empty frontmatter returns undefined
 *   - PACT.md without frontmatter delimiters returns undefined
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

const ASK_PACT_MD = `---
name: ask
description: A general-purpose request for when you need input, an opinion, or an answer from a teammate.
when_to_use:
  - You have a question that needs another person's perspective
  - You want a gut check, recommendation, or decision from someone
  - The question doesn't fit a more structured pact type
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

const CODE_REVIEW_PACT_MD = `---
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
hooks:
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

const SANITY_CHECK_PACT_MD = `---
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

describe("pact-loader: valid YAML frontmatter", () => {

  it("parses ask pact metadata from YAML frontmatter", async () => {
    const file = createInMemoryFilePort({
      "pacts/ask/PACT.md": ASK_PACT_MD,
    });

    const { loadPactMetadata } = await import("../../src/pact-loader.ts");
    const result = await loadPactMetadata(file, "ask");

    expect(result).toBeDefined();
    expect(result!.name).toBe("ask");
    expect(result!.description).toBe(
      "A general-purpose request for when you need input, an opinion, or an answer from a teammate.",
    );
    expect(result!.when_to_use).toEqual([
      "You have a question that needs another person's perspective",
      "You want a gut check, recommendation, or decision from someone",
      "The question doesn't fit a more structured pact type",
    ]);
  });

  it("extracts context_bundle fields and required list", async () => {
    const file = createInMemoryFilePort({
      "pacts/ask/PACT.md": ASK_PACT_MD,
    });

    const { loadPactMetadata } = await import("../../src/pact-loader.ts");
    const result = await loadPactMetadata(file, "ask");

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
      "pacts/ask/PACT.md": ASK_PACT_MD,
    });

    const { loadPactMetadata } = await import("../../src/pact-loader.ts");
    const result = await loadPactMetadata(file, "ask");

    expect(result).toBeDefined();
    expect(result!.response_bundle.required).toEqual(["answer"]);
    expect(Object.keys(result!.response_bundle.fields)).toEqual([
      "answer", "reasoning", "caveats",
    ]);
  });
});

describe("pact-loader: hooks", () => {

  it("sets has_hooks to true when hooks section is present", async () => {
    const file = createInMemoryFilePort({
      "pacts/code-review/PACT.md": CODE_REVIEW_PACT_MD,
    });

    const { loadPactMetadata } = await import("../../src/pact-loader.ts");
    const result = await loadPactMetadata(file, "code-review");

    expect(result).toBeDefined();
    expect(result!.has_hooks).toBe(true);
  });

  it("sets has_hooks to false when hooks section is absent", async () => {
    const file = createInMemoryFilePort({
      "pacts/ask/PACT.md": ASK_PACT_MD,
    });

    const { loadPactMetadata } = await import("../../src/pact-loader.ts");
    const result = await loadPactMetadata(file, "ask");

    expect(result).toBeDefined();
    expect(result!.has_hooks).toBe(false);
  });
});

describe("pact-loader: context_bundle with all 7 fields", () => {

  it("extracts all 7 context fields from sanity-check fixture", async () => {
    const file = createInMemoryFilePort({
      "pacts/sanity-check/PACT.md": SANITY_CHECK_PACT_MD,
    });

    const { loadPactMetadata } = await import("../../src/pact-loader.ts");
    const result = await loadPactMetadata(file, "sanity-check");

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

describe("pact-loader: response_bundle with required fields", () => {

  it("extracts response_bundle required fields from sanity-check fixture", async () => {
    const file = createInMemoryFilePort({
      "pacts/sanity-check/PACT.md": SANITY_CHECK_PACT_MD,
    });

    const { loadPactMetadata } = await import("../../src/pact-loader.ts");
    const result = await loadPactMetadata(file, "sanity-check");

    expect(result).toBeDefined();
    expect(result!.response_bundle.required).toEqual([
      "answer", "evidence", "recommendation",
    ]);
    expect(Object.keys(result!.response_bundle.fields)).toEqual([
      "answer", "evidence", "concerns", "recommendation",
    ]);
  });
});

describe("pact-loader: error handling", () => {

  it("returns undefined when PACT.md does not exist", async () => {
    const file = createInMemoryFilePort({});

    const { loadPactMetadata } = await import("../../src/pact-loader.ts");
    const result = await loadPactMetadata(file, "nonexistent");

    expect(result).toBeUndefined();
  });

  it("returns undefined for malformed YAML frontmatter", async () => {
    const malformedYaml = `---
name: broken
description: [this is not valid yaml
  when_to_use: {{{bad
---

# Broken Pact
`;
    const file = createInMemoryFilePort({
      "pacts/broken/PACT.md": malformedYaml,
    });

    const { loadPactMetadata } = await import("../../src/pact-loader.ts");
    const result = await loadPactMetadata(file, "broken");

    expect(result).toBeUndefined();
  });

  it("returns undefined for empty frontmatter", async () => {
    const emptyFrontmatter = `---
---

# Empty Frontmatter Pact
`;
    const file = createInMemoryFilePort({
      "pacts/empty-fm/PACT.md": emptyFrontmatter,
    });

    const { loadPactMetadata } = await import("../../src/pact-loader.ts");
    const result = await loadPactMetadata(file, "empty-fm");

    expect(result).toBeUndefined();
  });

  it("returns undefined for PACT.md without frontmatter delimiters", async () => {
    const noFrontmatter = `# No Frontmatter

This PACT.md has no YAML frontmatter delimiters at all.

## When To Use
When you want to test.
`;
    const file = createInMemoryFilePort({
      "pacts/no-fm/PACT.md": noFrontmatter,
    });

    const { loadPactMetadata } = await import("../../src/pact-loader.ts");
    const result = await loadPactMetadata(file, "no-fm");

    expect(result).toBeUndefined();
  });
});

describe("pact-loader: when_to_use normalization", () => {

  it("normalizes single string when_to_use to array", async () => {
    const singleWhenToUse = `---
name: single-wtu
description: Pact with single when_to_use string.
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
      "pacts/single-wtu/PACT.md": singleWhenToUse,
    });

    const { loadPactMetadata } = await import("../../src/pact-loader.ts");
    const result = await loadPactMetadata(file, "single-wtu");

    expect(result).toBeDefined();
    expect(result!.when_to_use).toEqual(["When you need to do a single thing"]);
  });
});

describe("pact-loader: version field", () => {

  it("extracts version when present", async () => {
    const file = createInMemoryFilePort({
      "pacts/code-review/PACT.md": CODE_REVIEW_PACT_MD,
    });

    const { loadPactMetadata } = await import("../../src/pact-loader.ts");
    const result = await loadPactMetadata(file, "code-review");

    expect(result).toBeDefined();
    expect(result!.version).toBe("1.0.0");
  });

  it("leaves version undefined when not present", async () => {
    const file = createInMemoryFilePort({
      "pacts/ask/PACT.md": ASK_PACT_MD,
    });

    const { loadPactMetadata } = await import("../../src/pact-loader.ts");
    const result = await loadPactMetadata(file, "ask");

    expect(result).toBeDefined();
    expect(result!.version).toBeUndefined();
  });
});

describe("pact-loader: getRequiredContextFieldsFromYaml", () => {

  it("returns required context fields from YAML frontmatter", async () => {
    const file = createInMemoryFilePort({
      "pacts/sanity-check/PACT.md": SANITY_CHECK_PACT_MD,
    });

    const { getRequiredContextFieldsFromYaml } = await import("../../src/pact-loader.ts");
    const result = await getRequiredContextFieldsFromYaml(file, "sanity-check");

    expect(result).toBeDefined();
    expect(result).toEqual([
      "customer", "product", "issue_summary",
      "involved_files", "investigation_so_far", "question",
    ]);
  });

  it("returns undefined when PACT.md does not exist", async () => {
    const file = createInMemoryFilePort({});

    const { getRequiredContextFieldsFromYaml } = await import("../../src/pact-loader.ts");
    const result = await getRequiredContextFieldsFromYaml(file, "nonexistent");

    expect(result).toBeUndefined();
  });

  it("returns undefined when PACT.md lacks frontmatter", async () => {
    const file = createInMemoryFilePort({
      "pacts/no-fm/PACT.md": "# No Frontmatter\n\nJust markdown.",
    });

    const { getRequiredContextFieldsFromYaml } = await import("../../src/pact-loader.ts");
    const result = await getRequiredContextFieldsFromYaml(file, "no-fm");

    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Mutant-killing tests: parseBundleSpec defensive guards
// ---------------------------------------------------------------------------

describe("pact-loader: parseBundleSpec with non-object inputs", () => {

  it("returns empty BundleSpec when context_bundle is null", async () => {
    const pactMd = `---
name: null-bundle
description: Pact with null context_bundle.
when_to_use: []
context_bundle: null
response_bundle:
  required: []
  fields: {}
---

# Null Bundle
`;
    const file = createInMemoryFilePort({
      "pacts/null-bundle/PACT.md": pactMd,
    });

    const { loadPactMetadata } = await import("../../src/pact-loader.ts");
    const result = await loadPactMetadata(file, "null-bundle");

    expect(result).toBeDefined();
    expect(result!.context_bundle).toEqual({ required: [], fields: {} });
  });

  it("returns empty BundleSpec when context_bundle is a string", async () => {
    const pactMd = `---
name: string-bundle
description: Pact with string context_bundle.
when_to_use: []
context_bundle: "not an object"
response_bundle:
  required: []
  fields: {}
---

# String Bundle
`;
    const file = createInMemoryFilePort({
      "pacts/string-bundle/PACT.md": pactMd,
    });

    const { loadPactMetadata } = await import("../../src/pact-loader.ts");
    const result = await loadPactMetadata(file, "string-bundle");

    expect(result).toBeDefined();
    expect(result!.context_bundle).toEqual({ required: [], fields: {} });
  });

  it("returns empty BundleSpec when context_bundle is a number", async () => {
    const pactMd = `---
name: num-bundle
description: Pact with numeric context_bundle.
when_to_use: []
context_bundle: 42
response_bundle:
  required: []
  fields: {}
---

# Numeric Bundle
`;
    const file = createInMemoryFilePort({
      "pacts/num-bundle/PACT.md": pactMd,
    });

    const { loadPactMetadata } = await import("../../src/pact-loader.ts");
    const result = await loadPactMetadata(file, "num-bundle");

    expect(result).toBeDefined();
    expect(result!.context_bundle).toEqual({ required: [], fields: {} });
  });
});

describe("pact-loader: parseBundleSpec with malformed fields", () => {

  it("skips fields entries that are not objects (string value)", async () => {
    const pactMd = `---
name: bad-field
description: Pact with non-object field value.
when_to_use: []
context_bundle:
  required: []
  fields:
    good_field:
      type: string
      description: A good field
    bad_field: "just a string"
response_bundle:
  required: []
  fields: {}
---

# Bad Field
`;
    const file = createInMemoryFilePort({
      "pacts/bad-field/PACT.md": pactMd,
    });

    const { loadPactMetadata } = await import("../../src/pact-loader.ts");
    const result = await loadPactMetadata(file, "bad-field");

    expect(result).toBeDefined();
    expect(Object.keys(result!.context_bundle.fields)).toEqual(["good_field"]);
    expect(result!.context_bundle.fields["good_field"]).toEqual({
      type: "string",
      description: "A good field",
    });
  });

  it("skips fields entries that are null", async () => {
    const pactMd = `---
name: null-field
description: Pact with null field value.
when_to_use: []
context_bundle:
  required: []
  fields:
    ok_field:
      type: string
      description: OK
    null_field: null
response_bundle:
  required: []
  fields: {}
---

# Null Field
`;
    const file = createInMemoryFilePort({
      "pacts/null-field/PACT.md": pactMd,
    });

    const { loadPactMetadata } = await import("../../src/pact-loader.ts");
    const result = await loadPactMetadata(file, "null-field");

    expect(result).toBeDefined();
    expect(Object.keys(result!.context_bundle.fields)).toEqual(["ok_field"]);
  });

  it("defaults field type to 'string' when type is non-string", async () => {
    const pactMd = `---
name: bad-type
description: Pact where field type is a number.
when_to_use: []
context_bundle:
  required: []
  fields:
    my_field:
      type: 123
      description: A field with numeric type
response_bundle:
  required: []
  fields: {}
---

# Bad Type
`;
    const file = createInMemoryFilePort({
      "pacts/bad-type/PACT.md": pactMd,
    });

    const { loadPactMetadata } = await import("../../src/pact-loader.ts");
    const result = await loadPactMetadata(file, "bad-type");

    expect(result).toBeDefined();
    expect(result!.context_bundle.fields["my_field"].type).toBe("string");
    expect(result!.context_bundle.fields["my_field"].description).toBe(
      "A field with numeric type",
    );
  });

  it("defaults field description to '' when description is non-string", async () => {
    const pactMd = `---
name: bad-desc
description: Pact where field description is a number.
when_to_use: []
context_bundle:
  required: []
  fields:
    my_field:
      type: string
      description: 999
response_bundle:
  required: []
  fields: {}
---

# Bad Desc
`;
    const file = createInMemoryFilePort({
      "pacts/bad-desc/PACT.md": pactMd,
    });

    const { loadPactMetadata } = await import("../../src/pact-loader.ts");
    const result = await loadPactMetadata(file, "bad-desc");

    expect(result).toBeDefined();
    // YAML parses `description: 999` as a number, so fallback to ""
    expect(result!.context_bundle.fields["my_field"].description).toBe("");
    expect(result!.context_bundle.fields["my_field"].type).toBe("string");
  });

  it("returns empty fields when fields value is not an object", async () => {
    const pactMd = `---
name: fields-string
description: Pact where fields is a string.
when_to_use: []
context_bundle:
  required: []
  fields: "not an object"
response_bundle:
  required: []
  fields: {}
---

# Fields String
`;
    const file = createInMemoryFilePort({
      "pacts/fields-string/PACT.md": pactMd,
    });

    const { loadPactMetadata } = await import("../../src/pact-loader.ts");
    const result = await loadPactMetadata(file, "fields-string");

    expect(result).toBeDefined();
    expect(result!.context_bundle.fields).toEqual({});
  });
});

describe("pact-loader: required array filters non-strings", () => {

  it("filters non-string items from required array", async () => {
    const pactMd = `---
name: mixed-required
description: Pact with non-string items in required array.
when_to_use: []
context_bundle:
  required:
    - question
    - 123
    - true
    - answer
  fields:
    question:
      type: string
      description: A question
    answer:
      type: string
      description: An answer
response_bundle:
  required: []
  fields: {}
---

# Mixed Required
`;
    const file = createInMemoryFilePort({
      "pacts/mixed-required/PACT.md": pactMd,
    });

    const { loadPactMetadata } = await import("../../src/pact-loader.ts");
    const result = await loadPactMetadata(file, "mixed-required");

    expect(result).toBeDefined();
    expect(result!.context_bundle.required).toEqual(["question", "answer"]);
  });

  it("returns empty required when required is not an array", async () => {
    const pactMd = `---
name: required-string
description: Pact where required is a string.
when_to_use: []
context_bundle:
  required: "not-an-array"
  fields:
    field1:
      type: string
      description: A field
response_bundle:
  required: []
  fields: {}
---

# Required String
`;
    const file = createInMemoryFilePort({
      "pacts/required-string/PACT.md": pactMd,
    });

    const { loadPactMetadata } = await import("../../src/pact-loader.ts");
    const result = await loadPactMetadata(file, "required-string");

    expect(result).toBeDefined();
    expect(result!.context_bundle.required).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Mutant-killing tests: Markdown table fallback + fieldListToBundleSpec
// ---------------------------------------------------------------------------

describe("pact-loader: Markdown table fallback (old-format PACT.md)", () => {

  it("extracts fields from markdown tables with correct type:'string' and description:''", async () => {
    const oldFormatMd = `# Bug Report

Submit a bug report.

## When To Use
When you find a bug in the system.

## Context Bundle Fields
| Field | Type | Required | Description |
| --- | --- | --- | --- |
| summary | string | yes | Brief summary |
| severity | string | no | Severity level |

## Response Structure
| Field | Type | Required | Description |
| --- | --- | --- | --- |
| status | string | yes | Current status |
`;
    const file = createInMemoryFilePort({
      "pacts/bug-report/PACT.md": oldFormatMd,
    });

    const { loadPactMetadata } = await import("../../src/pact-loader.ts");
    const result = await loadPactMetadata(file, "bug-report");

    expect(result).toBeDefined();
    // fieldListToBundleSpec defaults: type "string", description ""
    expect(result!.context_bundle.fields["summary"]).toEqual({
      type: "string",
      description: "",
    });
    expect(result!.context_bundle.fields["severity"]).toEqual({
      type: "string",
      description: "",
    });
    expect(result!.context_bundle.required).toEqual([]);
    expect(result!.response_bundle.fields["status"]).toEqual({
      type: "string",
      description: "",
    });
  });

  it("skips header row where field name is 'field'", async () => {
    const mdWithFieldHeader = `# Test Pact

A test pact.

## Context Bundle Fields
| Field | Type | Required | Description |
| --- | --- | --- | --- |
| name | string | yes | The name |

## Response Structure
| Field | Type |
| --- | --- |
| result | string |
`;
    const file = createInMemoryFilePort({
      "pacts/header-test/PACT.md": mdWithFieldHeader,
    });

    const { loadPactMetadata } = await import("../../src/pact-loader.ts");
    const result = await loadPactMetadata(file, "header-test");

    expect(result).toBeDefined();
    // "field" header row should be skipped; only "name" should be present
    expect(Object.keys(result!.context_bundle.fields)).toEqual(["name"]);
    expect(Object.keys(result!.response_bundle.fields)).toEqual(["result"]);
  });

  it("returns undefined when old-format PACT.md has no field tables", async () => {
    const noTablesMd = `# Empty Pact

A pact with no tables.

## When To Use
When you want to do nothing.
`;
    const file = createInMemoryFilePort({
      "pacts/no-tables/PACT.md": noTablesMd,
    });

    const { loadPactMetadata } = await import("../../src/pact-loader.ts");
    const result = await loadPactMetadata(file, "no-tables");

    expect(result).toBeUndefined();
  });

  it("extracts description from lines between title and first ## section", async () => {
    const md = `# My Pact

First line of description.
Second line of description.

## When To Use
- Use when needed

## Context Bundle Fields
| Field | Type |
| --- | --- |
| f1 | string |

## Response Structure
| Field | Type |
| --- | --- |
| r1 | string |
`;
    const file = createInMemoryFilePort({
      "pacts/desc-test/PACT.md": md,
    });

    const { loadPactMetadata } = await import("../../src/pact-loader.ts");
    const result = await loadPactMetadata(file, "desc-test");

    expect(result).toBeDefined();
    expect(result!.description).toBe("First line of description. Second line of description.");
  });

  it("uses title as description when no description lines exist", async () => {
    const md = `# Title Only Pact

## Context Bundle Fields
| Field | Type |
| --- | --- |
| f1 | string |

## Response Structure
| Field | Type |
| --- | --- |
| r1 | string |
`;
    const file = createInMemoryFilePort({
      "pacts/title-only/PACT.md": md,
    });

    const { loadPactMetadata } = await import("../../src/pact-loader.ts");
    const result = await loadPactMetadata(file, "title-only");

    expect(result).toBeDefined();
    expect(result!.name).toBe("title-only");
  });

  it("extracts when_to_use from ## When To Use section with dash prefix stripped", async () => {
    const md = `# WTU Pact

A pact.

## When To Use
- First use case
- Second use case

## Context Bundle Fields
| Field | Type |
| --- | --- |
| f1 | string |

## Response Structure
| Field | Type |
| --- | --- |
| r1 | string |
`;
    const file = createInMemoryFilePort({
      "pacts/wtu-test/PACT.md": md,
    });

    const { loadPactMetadata } = await import("../../src/pact-loader.ts");
    const result = await loadPactMetadata(file, "wtu-test");

    expect(result).toBeDefined();
    expect(result!.when_to_use).toEqual(["First use case Second use case"]);
  });

  it("only includes pipe-containing lines from table sections", async () => {
    const md = `# Pipe Pact

Desc.

## Context Bundle Fields
Some intro text without pipes
| Field | Type |
| --- | --- |
| ctx_field | string |
More text without pipes

## Response Structure
| Field | Type |
| --- | --- |
| resp_field | string |
`;
    const file = createInMemoryFilePort({
      "pacts/pipe-test/PACT.md": md,
    });

    const { loadPactMetadata } = await import("../../src/pact-loader.ts");
    const result = await loadPactMetadata(file, "pipe-test");

    expect(result).toBeDefined();
    expect(Object.keys(result!.context_bundle.fields)).toEqual(["ctx_field"]);
    expect(Object.keys(result!.response_bundle.fields)).toEqual(["resp_field"]);
  });

  it("ignores unknown sections in old-format PACT.md", async () => {
    const md = `# Section Pact

Desc.

## Random Section
Some random content.

## Context Bundle Fields
| Field | Type |
| --- | --- |
| f1 | string |

## Another Unknown
More content.

## Response Structure
| Field | Type |
| --- | --- |
| r1 | string |
`;
    const file = createInMemoryFilePort({
      "pacts/section-test/PACT.md": md,
    });

    const { loadPactMetadata } = await import("../../src/pact-loader.ts");
    const result = await loadPactMetadata(file, "section-test");

    expect(result).toBeDefined();
    expect(Object.keys(result!.context_bundle.fields)).toEqual(["f1"]);
    expect(Object.keys(result!.response_bundle.fields)).toEqual(["r1"]);
  });
});

// ---------------------------------------------------------------------------
// Mutant-killing tests: extractFrontmatter edge cases
// ---------------------------------------------------------------------------

describe("pact-loader: extractFrontmatter edge cases", () => {

  it("falls back to markdown parsing when --- exists but has no closing delimiter", async () => {
    // This content starts with --- but has no second --- line
    // extractFrontmatter returns undefined, so it falls through to parseMarkdownTables
    const md = `---
name: broken
description: no closing delimiter

# Has Tables Though

## Context Bundle Fields
| Field | Type |
| --- | --- |
| f1 | string |

## Response Structure
| Field | Type |
| --- | --- |
| r1 | string |
`;
    const file = createInMemoryFilePort({
      "pacts/no-close/PACT.md": md,
    });

    const { loadPactMetadata } = await import("../../src/pact-loader.ts");
    const result = await loadPactMetadata(file, "no-close");

    // Should parse via markdown fallback since frontmatter is incomplete
    expect(result).toBeDefined();
    expect(Object.keys(result!.context_bundle.fields)).toEqual(["f1"]);
  });
});

// ---------------------------------------------------------------------------
// Mutant-killing tests: schema.json fallback (readSchemaIfValid + schemaBundleToBundleSpec)
// ---------------------------------------------------------------------------

describe("pact-loader: schema.json fallback for old-format PACT.md", () => {

  it("uses schema.json when present alongside old-format PACT.md", async () => {
    const oldFormatMd = `# Schema Pact

A pact with schema.json override.

## Context Bundle Fields
| Field | Type |
| --- | --- |
| placeholder | string |

## Response Structure
| Field | Type |
| --- | --- |
| result | string |
`;
    const schemaJson = {
      context_bundle: {
        type: "object",
        required: ["question"],
        properties: {
          question: { type: "string", description: "The question" },
          detail: { type: "integer", description: "Detail level" },
        },
      },
      response_bundle: {
        type: "object",
        required: ["answer"],
        properties: {
          answer: { type: "string", description: "The answer" },
        },
      },
    };

    const file = createInMemoryFilePort({
      "pacts/schema-pact/PACT.md": oldFormatMd,
      "pacts/schema-pact/schema.json": schemaJson,
    });

    const { loadPactMetadata } = await import("../../src/pact-loader.ts");
    const result = await loadPactMetadata(file, "schema-pact");

    expect(result).toBeDefined();
    expect(result!.context_bundle.required).toEqual(["question"]);
    expect(result!.context_bundle.fields["question"]).toEqual({
      type: "string",
      description: "The question",
    });
    expect(result!.context_bundle.fields["detail"]).toEqual({
      type: "integer",
      description: "Detail level",
    });
    expect(result!.response_bundle.required).toEqual(["answer"]);
  });

  it("returns undefined for schema.json without context or response properties", async () => {
    const oldFormatMd = `# No Props Schema

A pact.

## Context Bundle Fields
| Field | Type |
| --- | --- |
| f1 | string |

## Response Structure
| Field | Type |
| --- | --- |
| r1 | string |
`;
    // schema.json exists but bundles lack 'properties'
    const schemaJson = {
      context_bundle: { type: "object", required: ["f1"] },
      response_bundle: { type: "object", required: ["r1"] },
    };

    const file = createInMemoryFilePort({
      "pacts/no-props/PACT.md": oldFormatMd,
      "pacts/no-props/schema.json": schemaJson,
    });

    const { loadPactMetadata } = await import("../../src/pact-loader.ts");
    const result = await loadPactMetadata(file, "no-props");

    expect(result).toBeDefined();
    // schema.json is rejected (no properties), so falls back to markdown parsing
    expect(result!.context_bundle.fields["f1"]).toEqual({
      type: "string",
      description: "",
    });
  });

  it("handles schemaBundleToBundleSpec with undefined bundle", async () => {
    const oldFormatMd = `# Partial Schema

A pact.

## Context Bundle Fields
| Field | Type |
| --- | --- |
| f1 | string |

## Response Structure
| Field | Type |
| --- | --- |
| r1 | string |
`;
    // Only context_bundle has properties; response_bundle is absent
    const schemaJson = {
      context_bundle: {
        type: "object",
        required: ["f1"],
        properties: {
          f1: { type: "string", description: "Field 1" },
        },
      },
    };

    const file = createInMemoryFilePort({
      "pacts/partial-schema/PACT.md": oldFormatMd,
      "pacts/partial-schema/schema.json": schemaJson,
    });

    const { loadPactMetadata } = await import("../../src/pact-loader.ts");
    const result = await loadPactMetadata(file, "partial-schema");

    expect(result).toBeDefined();
    expect(result!.context_bundle.required).toEqual(["f1"]);
    // response_bundle is undefined in schema, so schemaBundleToBundleSpec returns empty
    expect(result!.response_bundle).toEqual({ required: [], fields: {} });
  });

  it("handles schema.json property values that are not objects", async () => {
    const oldFormatMd = `# Bad Props Schema

A pact.

## Context Bundle Fields
| Field | Type |
| --- | --- |
| f1 | string |

## Response Structure
| Field | Type |
| --- | --- |
| r1 | string |
`;
    const schemaJson = {
      context_bundle: {
        type: "object",
        required: [],
        properties: {
          good_prop: { type: "string", description: "A good prop" },
          bad_prop: "just a string",
          null_prop: null,
        },
      },
      response_bundle: {
        type: "object",
        required: [],
        properties: {},
      },
    };

    const file = createInMemoryFilePort({
      "pacts/bad-props/PACT.md": oldFormatMd,
      "pacts/bad-props/schema.json": schemaJson,
    });

    const { loadPactMetadata } = await import("../../src/pact-loader.ts");
    const result = await loadPactMetadata(file, "bad-props");

    expect(result).toBeDefined();
    // Only the valid property should be included
    expect(Object.keys(result!.context_bundle.fields)).toEqual(["good_prop"]);
    expect(result!.context_bundle.fields["good_prop"]).toEqual({
      type: "string",
      description: "A good prop",
    });
  });

  it("handles schema.json properties with non-string type/description", async () => {
    const oldFormatMd = `# Non-String Schema

A pact.

## Context Bundle Fields
| Field | Type |
| --- | --- |
| f1 | string |

## Response Structure
| Field | Type |
| --- | --- |
| r1 | string |
`;
    const schemaJson = {
      context_bundle: {
        type: "object",
        required: [],
        properties: {
          field_a: { type: 42, description: true },
        },
      },
      response_bundle: {
        type: "object",
        required: [],
        properties: {
          field_b: { type: "number", description: 99 },
        },
      },
    };

    const file = createInMemoryFilePort({
      "pacts/nonstring-schema/PACT.md": oldFormatMd,
      "pacts/nonstring-schema/schema.json": schemaJson,
    });

    const { loadPactMetadata } = await import("../../src/pact-loader.ts");
    const result = await loadPactMetadata(file, "nonstring-schema");

    expect(result).toBeDefined();
    // type defaults to "string" when not a string
    expect(result!.context_bundle.fields["field_a"].type).toBe("string");
    // description defaults to "" when not a string
    expect(result!.context_bundle.fields["field_a"].description).toBe("");
    // type stays "number" since it is a valid string
    expect(result!.response_bundle.fields["field_b"].type).toBe("number");
    // description defaults to "" since 99 is not a string
    expect(result!.response_bundle.fields["field_b"].description).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Mutant-killing tests: getRequiredContextFieldsFromYaml schema.json fallback
// ---------------------------------------------------------------------------

describe("pact-loader: getRequiredContextFieldsFromYaml schema.json fallback", () => {

  it("falls back to schema.json when PACT.md has empty frontmatter", async () => {
    const emptyFm = `---
---

# Empty Frontmatter
`;
    const schemaJson = {
      context_bundle: {
        type: "object",
        required: ["field_a", "field_b"],
        properties: {
          field_a: { type: "string", description: "A" },
          field_b: { type: "string", description: "B" },
        },
      },
    };

    const file = createInMemoryFilePort({
      "pacts/empty-fm-schema/PACT.md": emptyFm,
      "pacts/empty-fm-schema/schema.json": schemaJson,
    });

    const { getRequiredContextFieldsFromYaml } = await import("../../src/pact-loader.ts");
    const result = await getRequiredContextFieldsFromYaml(file, "empty-fm-schema");

    expect(result).toEqual(["field_a", "field_b"]);
  });

  it("returns undefined when no schema.json and PACT.md invalid", async () => {
    const file = createInMemoryFilePort({});

    const { getRequiredContextFieldsFromYaml } = await import("../../src/pact-loader.ts");
    const result = await getRequiredContextFieldsFromYaml(file, "no-such-pact");

    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Mutant-killing tests: normalizeWhenToUse with non-string array items
// ---------------------------------------------------------------------------

describe("pact-loader: when_to_use filters non-string items", () => {

  it("filters non-string items from when_to_use array", async () => {
    const pactMd = `---
name: mixed-wtu
description: Pact with mixed when_to_use array.
when_to_use:
  - Valid string item
  - 42
  - true
  - Another valid string
context_bundle:
  required: []
  fields: {}
response_bundle:
  required: []
  fields: {}
---

# Mixed WTU
`;
    const file = createInMemoryFilePort({
      "pacts/mixed-wtu/PACT.md": pactMd,
    });

    const { loadPactMetadata } = await import("../../src/pact-loader.ts");
    const result = await loadPactMetadata(file, "mixed-wtu");

    expect(result).toBeDefined();
    expect(result!.when_to_use).toEqual([
      "Valid string item",
      "Another valid string",
    ]);
  });

  it("returns empty array when when_to_use is a number", async () => {
    const pactMd = `---
name: num-wtu
description: Pact with numeric when_to_use.
when_to_use: 42
context_bundle:
  required: []
  fields: {}
response_bundle:
  required: []
  fields: {}
---

# Numeric WTU
`;
    const file = createInMemoryFilePort({
      "pacts/num-wtu/PACT.md": pactMd,
    });

    const { loadPactMetadata } = await import("../../src/pact-loader.ts");
    const result = await loadPactMetadata(file, "num-wtu");

    expect(result).toBeDefined();
    expect(result!.when_to_use).toEqual([]);
  });
});
