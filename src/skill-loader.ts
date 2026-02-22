/**
 * Skill loader -- parses YAML frontmatter from SKILL.md files.
 *
 * Unlike skill-parser.ts (which parses Markdown tables and headings),
 * this module extracts structured metadata from YAML frontmatter
 * delimited by `---` markers at the top of SKILL.md files.
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

export interface SkillMetadata {
  name: string;
  version?: string;
  description: string;
  when_to_use: string[];
  context_bundle: BundleSpec;
  response_bundle: BundleSpec;
  has_brain: boolean;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load and parse YAML frontmatter from a skill's SKILL.md file.
 *
 * Returns undefined when:
 *   - SKILL.md does not exist
 *   - SKILL.md lacks `---` frontmatter delimiters
 *   - YAML between delimiters is malformed
 *   - YAML between delimiters is empty
 */
export async function loadSkillMetadata(
  file: FilePort,
  skillName: string,
): Promise<SkillMetadata | undefined> {
  const mdPath = `skills/${skillName}/SKILL.md`;

  const exists = await file.fileExists(mdPath);
  if (!exists) {
    return undefined;
  }

  const content = await file.readText(mdPath);
  const frontmatter = extractFrontmatter(content);
  if (frontmatter === undefined) {
    return undefined;
  }

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

  const name = typeof parsed.name === "string" ? parsed.name : skillName;
  const version =
    typeof parsed.version === "string" ? parsed.version : undefined;
  const description =
    typeof parsed.description === "string" ? parsed.description : "";

  const whenToUse = normalizeWhenToUse(parsed.when_to_use);
  const contextBundle = parseBundleSpec(parsed.context_bundle);
  const responseBundle = parseBundleSpec(parsed.response_bundle);
  const hasBrain = parsed.brain_processing != null;

  return {
    name,
    version,
    description,
    when_to_use: whenToUse,
    context_bundle: contextBundle,
    response_bundle: responseBundle,
    has_brain: hasBrain,
  };
}

/**
 * Convenience function: extract required context field names from
 * YAML frontmatter. Replaces skill-parser's getRequiredContextFields
 * for YAML-based SKILL.md files.
 *
 * Returns undefined when SKILL.md is missing or lacks valid frontmatter.
 */
export async function getRequiredContextFieldsFromYaml(
  file: FilePort,
  skillName: string,
): Promise<string[] | undefined> {
  const metadata = await loadSkillMetadata(file, skillName);
  if (!metadata) {
    return undefined;
  }
  return metadata.context_bundle.required;
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
