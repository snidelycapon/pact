/**
 * Unit tests for skill-parser module.
 *
 * Traces to: US-019, US-020, US-021
 *
 * Tests use an in-memory FilePort test double (no real filesystem).
 * The skill-parser module is pure functions that accept FilePort as
 * a dependency -- these tests verify parsing logic in isolation.
 *
 * Scenarios cover:
 *   - Parsing SKILL.md title (H1 line)
 *   - Parsing description (content between H1 and first H2)
 *   - Parsing When To Use section content
 *   - Extracting context field names from Context Bundle Fields table
 *   - Extracting response field names from Response Structure table
 *   - Preferring schema.json fields over SKILL.md fields
 *   - Falling back to SKILL.md when schema.json is absent
 *   - Returning undefined when SKILL.md does not exist
 *   - Handling empty or malformed SKILL.md gracefully
 *   - Extracting required fields from schema.json context_bundle
 *   - Handling malformed schema.json gracefully
 *
 * Error/edge scenarios: 5 of 12 total (42%)
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
      // Simulate directory listing by finding keys that start with path/
      const prefix = path.endsWith("/") ? path : path + "/";
      const entries = new Set<string>();
      for (const key of Object.keys(files)) {
        if (key.startsWith(prefix)) {
          const rest = key.slice(prefix.length);
          const firstSegment = rest.split("/")[0];
          if (firstSegment) entries.add(firstSegment);
        }
      }
      return Array.from(entries).filter((e) => e !== ".gitkeep");
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
// Skill content fixtures
// ---------------------------------------------------------------------------

const SANITY_CHECK_SKILL_MD = `# Sanity Check

Validate findings on a bug investigation.

## When To Use
When you need a colleague to validate your findings on a bug investigation.

## Context Bundle Fields
| Field | Required | Description |
|-------|----------|-------------|
| customer | yes | Customer name |
| product | yes | Product name and version |
| issue_summary | yes | Brief description of the issue |
| involved_files | yes | Files examined |
| investigation_so_far | yes | What you have found |
| question | yes | Specific question for the reviewer |
| zendesk_ticket | no | Related Zendesk ticket ID |

## Response Structure
| Field | Description |
|-------|-------------|
| answer | YES / NO / PARTIALLY with brief explanation |
| evidence | What you compared or examined |
| concerns | Any risks or caveats |
| recommendation | Suggested next step |
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
      answer: { type: "string", description: "YES / NO / PARTIALLY" },
      evidence: { type: "string", description: "What you compared" },
      concerns: { type: "string", description: "Risks or caveats" },
      recommendation: { type: "string", description: "Suggested next step" },
    },
    additionalProperties: true,
  },
};

// ---------------------------------------------------------------------------
// Note: These tests will fail until skill-parser.ts is created.
// The imports below point to the module the software crafter will build.
// ---------------------------------------------------------------------------

// The skill-parser module is expected to export:
//   parseSkillMetadata(file: FilePort, repoPath: string, skillName: string): Promise<SkillMetadata | undefined>
//   getRequiredContextFields(file: FilePort, repoPath: string, skillName: string): Promise<string[] | undefined>
//
// SkillMetadata: { name, description, when_to_use, context_fields, response_fields, has_schema, skill_path }

describe("skill-parser: SKILL.md parsing", () => {

  it("extracts title from H1 line", async () => {
    const file = createInMemoryFilePort({
      "skills/sanity-check/SKILL.md": SANITY_CHECK_SKILL_MD,
    });

    // Import will fail until module exists -- this is the red phase
    const { parseSkillMetadata } = await import("../../src/skill-parser.ts");
    const result = await parseSkillMetadata(file, "", "sanity-check");

    expect(result).toBeDefined();
    expect(result!.name).toBe("sanity-check");
  });

  it("extracts description from content between H1 and first H2", async () => {
    const file = createInMemoryFilePort({
      "skills/sanity-check/SKILL.md": SANITY_CHECK_SKILL_MD,
    });

    const { parseSkillMetadata } = await import("../../src/skill-parser.ts");
    const result = await parseSkillMetadata(file, "", "sanity-check");

    expect(result).toBeDefined();
    expect(result!.description).toContain("Validate findings");
  });

  it("extracts When To Use section content", async () => {
    const file = createInMemoryFilePort({
      "skills/sanity-check/SKILL.md": SANITY_CHECK_SKILL_MD,
    });

    const { parseSkillMetadata } = await import("../../src/skill-parser.ts");
    const result = await parseSkillMetadata(file, "", "sanity-check");

    expect(result).toBeDefined();
    expect(result!.when_to_use).toContain("validate your findings");
  });

  it("extracts context field names from the Context Bundle Fields table", async () => {
    const file = createInMemoryFilePort({
      "skills/sanity-check/SKILL.md": SANITY_CHECK_SKILL_MD,
    });

    const { parseSkillMetadata } = await import("../../src/skill-parser.ts");
    const result = await parseSkillMetadata(file, "", "sanity-check");

    expect(result).toBeDefined();
    expect(result!.context_fields).toEqual(
      expect.arrayContaining([
        "customer", "product", "issue_summary",
        "involved_files", "investigation_so_far", "question", "zendesk_ticket",
      ]),
    );
  });

  it("extracts response field names from the Response Structure table", async () => {
    const file = createInMemoryFilePort({
      "skills/sanity-check/SKILL.md": SANITY_CHECK_SKILL_MD,
    });

    const { parseSkillMetadata } = await import("../../src/skill-parser.ts");
    const result = await parseSkillMetadata(file, "", "sanity-check");

    expect(result).toBeDefined();
    expect(result!.response_fields).toEqual(
      expect.arrayContaining(["answer", "evidence", "concerns", "recommendation"]),
    );
  });

  it("includes skill_path pointing to SKILL.md location", async () => {
    const file = createInMemoryFilePort({
      "skills/sanity-check/SKILL.md": SANITY_CHECK_SKILL_MD,
    });

    const { parseSkillMetadata } = await import("../../src/skill-parser.ts");
    const result = await parseSkillMetadata(file, "/repo", "sanity-check");

    expect(result).toBeDefined();
    expect(result!.skill_path).toContain("skills/sanity-check/SKILL.md");
  });
});

describe("skill-parser: schema.json preference", () => {

  it("prefers schema.json fields over SKILL.md fields when schema.json exists", async () => {
    const file = createInMemoryFilePort({
      "skills/sanity-check/SKILL.md": SANITY_CHECK_SKILL_MD,
      "skills/sanity-check/schema.json": SANITY_CHECK_SCHEMA,
    });

    const { parseSkillMetadata } = await import("../../src/skill-parser.ts");
    const result = await parseSkillMetadata(file, "", "sanity-check");

    expect(result).toBeDefined();
    expect(result!.has_schema).toBe(true);
    // schema.json has all 7 properties as context_fields
    expect(result!.context_fields).toEqual(
      expect.arrayContaining([
        "customer", "product", "issue_summary",
        "involved_files", "investigation_so_far", "question", "zendesk_ticket",
      ]),
    );
    // schema.json response_bundle has 4 properties
    expect(result!.response_fields).toEqual(
      expect.arrayContaining(["answer", "evidence", "concerns", "recommendation"]),
    );
  });

  it("sets has_schema to false when schema.json does not exist", async () => {
    const file = createInMemoryFilePort({
      "skills/ask/SKILL.md": `# Ask\n\nA general question.\n\n## When To Use\nWhen you have a question.\n\n## Context Bundle Fields\n| Field | Required |\n|-------|----------|\n| question | yes |\n\n## Response Structure\n| Field | Description |\n|-------|-------------|\n| answer | The answer |\n`,
    });

    const { parseSkillMetadata } = await import("../../src/skill-parser.ts");
    const result = await parseSkillMetadata(file, "", "ask");

    expect(result).toBeDefined();
    expect(result!.has_schema).toBe(false);
  });
});

describe("skill-parser: schema validation helpers", () => {

  it("extracts required context field names from schema.json", async () => {
    const file = createInMemoryFilePort({
      "skills/sanity-check/schema.json": SANITY_CHECK_SCHEMA,
    });

    const { getRequiredContextFields } = await import("../../src/skill-parser.ts");
    const result = await getRequiredContextFields(file, "", "sanity-check");

    expect(result).toBeDefined();
    expect(result).toEqual([
      "customer", "product", "issue_summary",
      "involved_files", "investigation_so_far", "question",
    ]);
  });

  it("returns undefined when schema.json does not exist", async () => {
    const file = createInMemoryFilePort({});

    const { getRequiredContextFields } = await import("../../src/skill-parser.ts");
    const result = await getRequiredContextFields(file, "", "sanity-check");

    expect(result).toBeUndefined();
  });
});

describe("skill-parser: error tolerance", () => {

  it("returns undefined when SKILL.md does not exist", async () => {
    const file = createInMemoryFilePort({});

    const { parseSkillMetadata } = await import("../../src/skill-parser.ts");
    const result = await parseSkillMetadata(file, "", "nonexistent");

    expect(result).toBeUndefined();
  });

  it("returns metadata with empty fields for a SKILL.md with no tables", async () => {
    const file = createInMemoryFilePort({
      "skills/minimal/SKILL.md": "# Minimal\n\nA minimal skill with no field tables.\n",
    });

    const { parseSkillMetadata } = await import("../../src/skill-parser.ts");
    const result = await parseSkillMetadata(file, "", "minimal");

    expect(result).toBeDefined();
    expect(result!.name).toBe("minimal");
    expect(result!.description).toContain("minimal skill");
    expect(result!.context_fields).toEqual([]);
    expect(result!.response_fields).toEqual([]);
  });

  it("handles malformed schema.json by falling back to SKILL.md", async () => {
    const file = createInMemoryFilePort({
      "skills/sanity-check/SKILL.md": SANITY_CHECK_SKILL_MD,
      "skills/sanity-check/schema.json": { not_a_real_schema: true },
    });

    const { parseSkillMetadata } = await import("../../src/skill-parser.ts");
    const result = await parseSkillMetadata(file, "", "sanity-check");

    expect(result).toBeDefined();
    // Should fall back to SKILL.md fields since schema.json has no context_bundle
    expect(result!.context_fields.length).toBeGreaterThan(0);
  });

  it("returns undefined required fields when schema.json is malformed", async () => {
    const file = createInMemoryFilePort({
      "skills/sanity-check/schema.json": { not_a_real_schema: true },
    });

    const { getRequiredContextFields } = await import("../../src/skill-parser.ts");
    const result = await getRequiredContextFields(file, "", "sanity-check");

    expect(result).toBeUndefined();
  });
});
