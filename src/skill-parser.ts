/**
 * Shared skill metadata extraction module.
 *
 * Pure functions that parse SKILL.md and optionally schema.json
 * to produce structured metadata. Used by garp_skills (US-019),
 * garp_inbox enrichment (US-020), and garp_request validation (US-021).
 *
 * Design: accepts FilePort via dependency injection, never throws
 * on missing or malformed files -- returns undefined or partial results.
 */

import type { FilePort } from "./ports.ts";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface SkillMetadata {
  name: string;
  description: string;
  when_to_use: string;
  context_fields: string[];
  response_fields: string[];
  skill_path: string;
  has_schema: boolean;
}

// ---------------------------------------------------------------------------
// Internal types for schema.json
// ---------------------------------------------------------------------------

interface SchemaBundle {
  type?: string;
  required?: string[];
  properties?: Record<string, unknown>;
}

interface SkillSchema {
  context_bundle?: SchemaBundle;
  response_bundle?: SchemaBundle;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a skill's SKILL.md (and optionally schema.json) into metadata.
 * Returns undefined when SKILL.md does not exist.
 */
export async function parseSkillMetadata(
  file: FilePort,
  repoPath: string,
  skillName: string,
): Promise<SkillMetadata | undefined> {
  // FilePort paths are relative -- repoPath is only for display in skill_path.
  const relativeMdPath = `skills/${skillName}/SKILL.md`;
  const relativeSchemaPath = `skills/${skillName}/schema.json`;

  const skillMdExists = await file.fileExists(relativeMdPath);
  if (!skillMdExists) {
    return undefined;
  }

  const markdown = await file.readText(relativeMdPath);
  const parsed = parseSkillMd(markdown);

  // Try schema.json for field extraction
  const schema = await readSchemaIfValid(file, relativeSchemaPath);
  const hasSchema = schema !== undefined;

  let contextFields: string[];
  let responseFields: string[];

  if (hasSchema) {
    contextFields = extractSchemaKeys(schema!.context_bundle);
    responseFields = extractSchemaKeys(schema!.response_bundle);
  } else {
    contextFields = parsed.context_fields;
    responseFields = parsed.response_fields;
  }

  const skillPath = repoPath
    ? joinPath(repoPath, relativeMdPath)
    : relativeMdPath;

  return {
    name: skillName,
    description: parsed.description,
    when_to_use: parsed.when_to_use,
    context_fields: contextFields,
    response_fields: responseFields,
    skill_path: skillPath,
    has_schema: hasSchema,
  };
}

/**
 * Extract required context field names from schema.json.
 * Returns undefined when schema.json is missing or malformed.
 */
export async function getRequiredContextFields(
  file: FilePort,
  repoPath: string,
  skillName: string,
): Promise<string[] | undefined> {
  const schemaPath = `skills/${skillName}/schema.json`;
  const schema = await readSchemaIfValid(file, schemaPath);
  if (!schema?.context_bundle?.required) {
    return undefined;
  }
  return schema.context_bundle.required;
}

// ---------------------------------------------------------------------------
// Internal helpers -- SKILL.md parsing
// ---------------------------------------------------------------------------

interface ParsedSkillMd {
  title: string;
  description: string;
  when_to_use: string;
  context_fields: string[];
  response_fields: string[];
}

function parseSkillMd(markdown: string): ParsedSkillMd {
  const lines = markdown.split("\n");

  let title = "";
  let description = "";
  let whenToUse = "";
  let contextFields: string[] = [];
  let responseFields: string[] = [];

  let currentSection = "";
  const descriptionLines: string[] = [];
  const whenToUseLines: string[] = [];
  let contextTableLines: string[] = [];
  let responseTableLines: string[] = [];

  for (const line of lines) {
    // Detect H1
    if (line.startsWith("# ") && !title) {
      title = line.slice(2).trim();
      currentSection = "description";
      continue;
    }

    // Detect H2 sections
    if (line.startsWith("## ")) {
      const sectionName = line.slice(3).trim().toLowerCase();
      if (sectionName === "when to use") {
        currentSection = "when_to_use";
      } else if (sectionName === "context bundle fields") {
        currentSection = "context_fields";
      } else if (sectionName === "response structure") {
        currentSection = "response_fields";
      } else {
        currentSection = "other";
      }
      continue;
    }

    // Accumulate content based on current section
    switch (currentSection) {
      case "description":
        if (line.trim()) {
          descriptionLines.push(line.trim());
        }
        break;
      case "when_to_use":
        if (line.trim()) {
          whenToUseLines.push(line.trim());
        }
        break;
      case "context_fields":
        if (line.includes("|")) {
          contextTableLines.push(line);
        }
        break;
      case "response_fields":
        if (line.includes("|")) {
          responseTableLines.push(line);
        }
        break;
    }
  }

  description = descriptionLines.join(" ") || title;
  whenToUse = whenToUseLines
    .map((l) => l.replace(/^- /, ""))
    .join(" ");
  contextFields = extractTableFieldNames(contextTableLines);
  responseFields = extractTableFieldNames(responseTableLines);

  return {
    title,
    description,
    when_to_use: whenToUse,
    context_fields: contextFields,
    response_fields: responseFields,
  };
}

/**
 * Extract field names from markdown table rows.
 * Skips the header row and separator row (containing `---`).
 * Takes the first column value from each data row.
 */
function extractTableFieldNames(tableLines: string[]): string[] {
  const fields: string[] = [];
  for (const line of tableLines) {
    // Skip separator rows
    if (line.includes("---")) {
      continue;
    }
    const cells = line
      .split("|")
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
    if (cells.length === 0) {
      continue;
    }
    const fieldName = cells[0].toLowerCase();
    // Skip the header row (contains "field" as first cell)
    if (fieldName === "field") {
      continue;
    }
    fields.push(fieldName);
  }
  return fields;
}

// ---------------------------------------------------------------------------
// Internal helpers -- schema.json
// ---------------------------------------------------------------------------

/**
 * Attempt to read and validate schema.json.
 * Returns undefined if file is missing, unreadable, or lacks
 * the expected context_bundle/response_bundle structure.
 */
async function readSchemaIfValid(
  file: FilePort,
  schemaPath: string,
): Promise<SkillSchema | undefined> {
  try {
    const exists = await file.fileExists(schemaPath);
    if (!exists) {
      return undefined;
    }
    const raw = await file.readJSON<Record<string, unknown>>(schemaPath);
    // Validate minimum structure: must have context_bundle or response_bundle
    // with properties
    const contextBundle = raw.context_bundle as SchemaBundle | undefined;
    const responseBundle = raw.response_bundle as SchemaBundle | undefined;
    const hasContextProps =
      contextBundle?.properties && typeof contextBundle.properties === "object";
    const hasResponseProps =
      responseBundle?.properties && typeof responseBundle.properties === "object";
    if (!hasContextProps && !hasResponseProps) {
      return undefined;
    }
    return { context_bundle: contextBundle, response_bundle: responseBundle };
  } catch {
    return undefined;
  }
}

/**
 * Extract property keys from a schema bundle.
 */
function extractSchemaKeys(bundle: SchemaBundle | undefined): string[] {
  if (!bundle?.properties) {
    return [];
  }
  return Object.keys(bundle.properties);
}

// ---------------------------------------------------------------------------
// Path helper
// ---------------------------------------------------------------------------

function joinPath(base: string, relative: string): string {
  if (!base) {
    return relative;
  }
  const cleanBase = base.endsWith("/") ? base.slice(0, -1) : base;
  return `${cleanBase}/${relative}`;
}
