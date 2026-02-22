/**
 * Pact loader -- parses YAML frontmatter from PACT.md files.
 *
 * Extracts structured metadata from YAML frontmatter delimited by
 * `---` markers at the top of PACT.md files. Falls back to parsing
 * Markdown tables for old-format PACT.md files without frontmatter.
 *
 * Design: accepts FilePort via dependency injection, never throws
 * on missing or malformed files -- returns undefined instead.
 */

import { parse as parseYaml } from "yaml";
import type { FilePort } from "./ports.ts";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface BundleFieldDef {
  type: string;
  description: string;
}

export interface BundleSpec {
  required: string[];
  fields: Record<string, BundleFieldDef>;
}

export interface PactMetadata {
  name: string;
  version?: string;
  description: string;
  when_to_use: string[];
  context_bundle: BundleSpec;
  response_bundle: BundleSpec;
  has_hooks: boolean;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load and parse YAML frontmatter from a pact's PACT.md file.
 *
 * Returns undefined when:
 *   - PACT.md does not exist
 *   - PACT.md lacks `---` frontmatter delimiters
 *   - YAML between delimiters is malformed
 *   - YAML between delimiters is empty
 */
export async function loadPactMetadata(
  file: FilePort,
  pactName: string,
): Promise<PactMetadata | undefined> {
  const mdPath = `pacts/${pactName}/PACT.md`;

  const exists = await file.fileExists(mdPath);
  if (!exists) {
    return undefined;
  }

  const content = await file.readText(mdPath);
  const frontmatter = extractFrontmatter(content);

  // If YAML frontmatter is present, parse it (primary path)
  if (frontmatter !== undefined) {
    let parsed: Record<string, unknown>;
    try {
      parsed = parseYaml(frontmatter) as Record<string, unknown>;
    } catch {
      return undefined;
    }

    // Empty frontmatter parses as null
    if (!parsed || typeof parsed !== "object") {
      return undefined;
    }

    const name = typeof parsed.name === "string" ? parsed.name : pactName;
    const version =
      typeof parsed.version === "string" ? parsed.version : undefined;
    const description =
      typeof parsed.description === "string" ? parsed.description : "";

    const whenToUse = normalizeWhenToUse(parsed.when_to_use);
    const contextBundle = parseBundleSpec(parsed.context_bundle);
    const responseBundle = parseBundleSpec(parsed.response_bundle);
    const hasHooks = parsed.hooks != null;

    return {
      name,
      version,
      description,
      when_to_use: whenToUse,
      context_bundle: contextBundle,
      response_bundle: responseBundle,
      has_hooks: hasHooks,
    };
  }

  // Fallback: parse old-format Markdown tables from PACT.md.
  // This supports PACT.md files that lack YAML frontmatter but have
  // structured Markdown tables (Context Bundle Fields / Response Structure).
  // A PACT.md without any field tables is not a complete old-format pact.
  const mdParsed = parseMarkdownTables(content);
  if (!mdParsed.contextFields.length && !mdParsed.responseFields.length) {
    return undefined;
  }

  // Check for schema.json to override field extraction
  const schemaPath = `pacts/${pactName}/schema.json`;
  const schema = await readSchemaIfValid(file, schemaPath);

  let contextBundle: BundleSpec;
  let responseBundle: BundleSpec;

  if (schema) {
    contextBundle = schemaBundleToBundleSpec(schema.context_bundle);
    responseBundle = schemaBundleToBundleSpec(schema.response_bundle);
  } else {
    contextBundle = fieldListToBundleSpec(mdParsed.contextFields);
    responseBundle = fieldListToBundleSpec(mdParsed.responseFields);
  }

  return {
    name: pactName,
    description: mdParsed.description,
    when_to_use: mdParsed.whenToUse ? [mdParsed.whenToUse] : [],
    context_bundle: contextBundle,
    response_bundle: responseBundle,
    has_hooks: false,
  };
}

/**
 * Convenience function: extract required context field names from
 * YAML frontmatter. Replaces pact-parser's getRequiredContextFields
 * for YAML-based PACT.md files.
 *
 * Returns undefined when PACT.md is missing or lacks valid frontmatter.
 */
export async function getRequiredContextFieldsFromYaml(
  file: FilePort,
  pactName: string,
): Promise<string[] | undefined> {
  const metadata = await loadPactMetadata(file, pactName);
  if (!metadata) {
    // Last-resort fallback: check schema.json directly (supports
    // old workflows where schema.json exists but PACT.md is empty)
    const schemaPath = `pacts/${pactName}/schema.json`;
    const schema = await readSchemaIfValid(file, schemaPath);
    if (schema?.context_bundle?.required?.length) {
      return schema.context_bundle.required;
    }
    return undefined;
  }
  const required = metadata.context_bundle.required;
  return required.length > 0 ? required : undefined;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Extract the raw YAML string between the opening and closing `---`
 * delimiters. Returns undefined if delimiters are not found.
 */
function extractFrontmatter(content: string): string | undefined {
  // Frontmatter must start at the very beginning of the file
  if (!content.startsWith("---")) {
    return undefined;
  }

  // Find the closing delimiter (second ---)
  const closingIndex = content.indexOf("\n---", 3);
  if (closingIndex === -1) {
    return undefined;
  }

  // Extract the YAML between the delimiters
  const yaml = content.slice(content.indexOf("\n") + 1, closingIndex);
  return yaml;
}

/**
 * Normalize when_to_use: a single string becomes a one-element array,
 * an array stays as-is.
 */
function normalizeWhenToUse(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((item): item is string => typeof item === "string");
  }
  if (typeof raw === "string") {
    return [raw];
  }
  return [];
}

// ---------------------------------------------------------------------------
// Internal helpers -- Markdown table fallback (old-format PACT.md)
// ---------------------------------------------------------------------------

interface MarkdownParsed {
  description: string;
  whenToUse: string;
  contextFields: string[];
  responseFields: string[];
}

/**
 * Parse old-format PACT.md: extract description, when_to_use, and
 * field names from Markdown tables. Mirrors the logic from pact-parser.ts.
 */
function parseMarkdownTables(markdown: string): MarkdownParsed {
  const lines = markdown.split("\n");

  let title = "";
  let currentSection = "";
  const descriptionLines: string[] = [];
  const whenToUseLines: string[] = [];
  const contextTableLines: string[] = [];
  const responseTableLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("# ") && !title) {
      title = line.slice(2).trim();
      currentSection = "description";
      continue;
    }

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

    switch (currentSection) {
      case "description":
        if (line.trim()) descriptionLines.push(line.trim());
        break;
      case "when_to_use":
        if (line.trim()) whenToUseLines.push(line.trim());
        break;
      case "context_fields":
        if (line.includes("|")) contextTableLines.push(line);
        break;
      case "response_fields":
        if (line.includes("|")) responseTableLines.push(line);
        break;
    }
  }

  return {
    description: descriptionLines.join(" ") || title,
    whenToUse: whenToUseLines.map((l) => l.replace(/^- /, "")).join(" "),
    contextFields: extractTableFieldNames(contextTableLines),
    responseFields: extractTableFieldNames(responseTableLines),
  };
}

/**
 * Extract field names from Markdown table rows (first column).
 * Skips header and separator rows.
 */
function extractTableFieldNames(tableLines: string[]): string[] {
  const fields: string[] = [];
  for (const line of tableLines) {
    if (line.includes("---")) continue;
    const cells = line
      .split("|")
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
    if (cells.length === 0) continue;
    const fieldName = cells[0].toLowerCase();
    if (fieldName === "field") continue;
    fields.push(fieldName);
  }
  return fields;
}

// ---------------------------------------------------------------------------
// Internal helpers -- schema.json fallback
// ---------------------------------------------------------------------------

interface SchemaBundle {
  type?: string;
  required?: string[];
  properties?: Record<string, unknown>;
}

interface PactSchema {
  context_bundle?: SchemaBundle;
  response_bundle?: SchemaBundle;
}

/**
 * Read and validate schema.json. Returns undefined if missing, unreadable,
 * or lacks expected context_bundle/response_bundle with properties.
 */
async function readSchemaIfValid(
  file: FilePort,
  schemaPath: string,
): Promise<PactSchema | undefined> {
  try {
    const exists = await file.fileExists(schemaPath);
    if (!exists) return undefined;
    const raw = await file.readJSON<Record<string, unknown>>(schemaPath);
    const contextBundle = raw.context_bundle as SchemaBundle | undefined;
    const responseBundle = raw.response_bundle as SchemaBundle | undefined;
    const hasContextProps =
      contextBundle?.properties && typeof contextBundle.properties === "object";
    const hasResponseProps =
      responseBundle?.properties && typeof responseBundle.properties === "object";
    if (!hasContextProps && !hasResponseProps) return undefined;
    return { context_bundle: contextBundle, response_bundle: responseBundle };
  } catch {
    return undefined;
  }
}

/**
 * Convert a JSON Schema bundle (from schema.json) to a BundleSpec.
 */
function schemaBundleToBundleSpec(bundle: SchemaBundle | undefined): BundleSpec {
  if (!bundle) return { required: [], fields: {} };
  const required = Array.isArray(bundle.required) ? bundle.required : [];
  const fields: Record<string, BundleFieldDef> = {};
  if (bundle.properties && typeof bundle.properties === "object") {
    for (const [key, value] of Object.entries(bundle.properties)) {
      if (value && typeof value === "object") {
        const prop = value as Record<string, unknown>;
        fields[key] = {
          type: typeof prop.type === "string" ? prop.type : "string",
          description: typeof prop.description === "string" ? prop.description : "",
        };
      }
    }
  }
  return { required, fields };
}

/**
 * Convert a flat list of field names (from Markdown tables) to a BundleSpec.
 */
function fieldListToBundleSpec(fieldNames: string[]): BundleSpec {
  const fields: Record<string, BundleFieldDef> = {};
  for (const name of fieldNames) {
    fields[name] = { type: "string", description: "" };
  }
  return { required: [], fields };
}

// ---------------------------------------------------------------------------
// Internal helpers -- YAML parsing
// ---------------------------------------------------------------------------

/**
 * Parse a context_bundle or response_bundle section from the YAML.
 */
function parseBundleSpec(raw: unknown): BundleSpec {
  if (!raw || typeof raw !== "object") {
    return { required: [], fields: {} };
  }

  const obj = raw as Record<string, unknown>;
  const required = Array.isArray(obj.required)
    ? obj.required.filter((r): r is string => typeof r === "string")
    : [];

  const fields: Record<string, BundleFieldDef> = {};
  if (obj.fields && typeof obj.fields === "object") {
    const rawFields = obj.fields as Record<string, unknown>;
    for (const [key, value] of Object.entries(rawFields)) {
      if (value && typeof value === "object") {
        const fieldObj = value as Record<string, unknown>;
        fields[key] = {
          type: typeof fieldObj.type === "string" ? fieldObj.type : "string",
          description:
            typeof fieldObj.description === "string"
              ? fieldObj.description
              : "",
        };
      }
    }
  }

  return { required, fields };
}
