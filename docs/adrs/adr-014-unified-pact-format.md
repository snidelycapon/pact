# ADR-014: Unified Pact Format

## Status: Accepted (supersedes ADR-010, ADR-011)

## Context

PACT pacts are currently defined by two files per pact: `PACT.md` (human-readable markdown with heuristic section structure) and `schema.json` (JSON Schema 2020-12 for context_bundle and response_bundle). Three problems exist:

1. **Sync drift**: PACT.md and schema.json can diverge. When a field is added to schema.json but not documented in PACT.md, the source of truth is ambiguous.

2. **Heuristic parsing**: The `pact-parser.ts` module extracts metadata from PACT.md using regex and line-by-line heuristics (section header detection, markdown table parsing). This approach scored 63% on mutation testing -- 57 surviving mutants across 291 lines. The parser is fragile, difficult to extend, and unreliable for field extraction.

3. **Three consumers, two formats**: Pacts must serve agents (discovery metadata), humans (readable documentation), and a future brain processing layer (declarative rules). Two separate files cannot serve a third consumer without adding a third file.

## Decision

Replace PACT.md + schema.json with a single PACT.md file that uses YAML frontmatter for machine-parseable metadata and a markdown body for human-readable documentation.

### YAML Frontmatter (between `---` delimiters)

Contains: `name`, `version`, `description`, `when_to_use`, `context_bundle` (field definitions with types, required list, `additionalProperties: true`), `response_bundle` (same structure), optional `attachments` metadata, and optional `hooks` rules.

### Markdown Body (after closing `---`)

Contains: workflow documentation, usage examples, multi-round patterns, tips. Anything that helps humans understand the pact. Not parsed by the server -- purely for human consumption.

### Parsing

The YAML frontmatter is parsed using a YAML library (deterministic). The markdown body is not parsed. This eliminates the heuristic regex parsing entirely.

### additionalProperties: true

The `additionalProperties: true` principle is preserved in the frontmatter schema. Field definitions describe the minimum contract; agents may send additional fields.

### Location

Pacts move from `examples/pacts/` to `pacts/` as the canonical location. The `examples/` prefix was appropriate when pacts were documentation-only; in the new format they are functional artifacts consumed by the server.

## Alternatives Considered

### Keep PACT.md + schema.json (Fix the Parser)

Rewrite `pact-parser.ts` to be more robust instead of changing the format.

- **Pro**: No migration of existing pact files. All 4 example pacts and their schema.json files remain as-is.
- **Pro**: Markdown-only PACT.md is the simplest possible format for human authors.
- **Con**: The fundamental problem is the format, not the implementation. Extracting structured data from unstructured markdown is inherently heuristic. A rewritten parser would face the same mutation testing challenges.
- **Con**: Two-file sync drift is a design problem, not an implementation problem. A better parser does not fix schema.json diverging from PACT.md.
- **Con**: Adding hooks would require a third file (brain.yaml? rules.json?), compounding the sync problem.
- **Rejection rationale**: The heuristic parsing problem is architectural. Structured data belongs in a structured format. YAML frontmatter provides structure while preserving the markdown documentation that makes PACT.md human-friendly.

### Pure YAML File (No Markdown Body)

Replace PACT.md with PACT.yaml containing all metadata and documentation as YAML fields.

- **Pro**: Entirely machine-parseable. No mixed-format complexity.
- **Pro**: YAML supports multi-line strings for documentation fields.
- **Con**: YAML multi-line strings (block scalars) are awkward for rich documentation. Headers, lists, code blocks, and examples are natural in markdown but ugly in YAML string values.
- **Con**: Human readability suffers. A pact needs to be comfortable for a non-technical team member to read. YAML with embedded markdown strings is worse than YAML frontmatter + native markdown body.
- **Con**: Breaks the convention used by static site generators, documentation frameworks, and content management systems. YAML frontmatter + markdown body is an established pattern.
- **Rejection rationale**: Pacts serve three consumers, and human readability is a first-class requirement. Pure YAML sacrifices readability for parsing simplicity. The frontmatter pattern achieves both.

### JSON Frontmatter (JSON Between `---` Delimiters)

Use JSON instead of YAML between the frontmatter delimiters. Eliminates the YAML dependency.

- **Pro**: Zero new dependencies. JSON parsing is built into Node.js.
- **Pro**: JSON is unambiguous (no YAML-specific edge cases like `yes` being parsed as boolean).
- **Con**: JSON lacks comments. Pact authors cannot annotate the schema inline.
- **Con**: JSON requires strict quoting and comma placement. YAML is more forgiving for human authoring.
- **Con**: JSON does not support multi-line strings without escape characters. Field descriptions would be harder to read.
- **Rejection rationale**: YAML's readability advantages (comments, no quoting, multi-line) outweigh the cost of one new dependency. The `yaml` npm package has zero transitive dependencies, is MIT licensed, and has 50M+ weekly downloads.

## Consequences

### Positive

- Single source of truth per pact. No sync drift between files.
- Deterministic parsing via YAML library eliminates heuristic regex. Target >90% mutation score.
- Three consumers served by one file: agents read frontmatter fields, humans read markdown body, brain reads frontmatter rules.
- Established pattern (Jekyll, Hugo, Astro, Docusaurus) -- pact authors may already be familiar with YAML frontmatter.
- `additionalProperties: true` preserved -- minimum contract, maximum flexibility.
- Brain processing rules co-located with the pact they govern -- no separate config.

### Negative

- One new runtime dependency (`yaml` npm package). Justified by deterministic parsing requirement.
- Migration effort: 4 example pacts must be converted to new format. schema.json files deleted.
- Pact authors must learn YAML syntax for the frontmatter section. YAML indentation rules are a common source of errors.
- YAML has known edge cases (`yes`/`no` parsed as booleans, Norway problem). The parser must be configured to handle these. The `yaml` package's strict mode addresses most of these.
