# ADR-011: schema.json Validation Strategy

## Status: Accepted

## Context

US-021 adds optional `schema.json` files alongside SKILL.md. When `garp_request` submits a request for a skill that has a schema.json, it should validate the context_bundle against the schema and return warnings for missing required fields. The validation must be WARN-not-REJECT (per requirements: "dumb router" philosophy, open-ended flexibility).

Three approaches exist for implementing this validation. The critical constraint is: **no new runtime dependencies unless strongly justified**. Current runtime deps: `@modelcontextprotocol/sdk`, `simple-git`, `zod`.

## Decision

Key-presence validation using plain TypeScript. Read schema.json via FilePort, extract the `required` array from `context_bundle`, check whether each required key exists in the submitted context_bundle. Return missing keys as `validation_warnings: string[]`.

No type checking, no nested object validation, no JSON Schema spec compliance beyond the `required` array. This is intentionally minimal -- Phase A validates structure (are the expected fields present?), not content (are the values the right type?).

### Validation logic (behavioral contract):

1. After skill existence check, attempt to read `skills/{type}/schema.json` via FilePort
2. If schema.json does not exist or cannot be parsed: skip validation, no warnings
3. If schema.json exists: extract `context_bundle.required` array
4. Compare against submitted `context_bundle` keys
5. Missing keys become warning strings: `"Missing required field '{field}'"`
6. Warnings are included in the return object; the request is submitted regardless

## Alternatives Considered

### Ajv (JSON Schema Validator Library)

Use the `ajv` npm package for full JSON Schema draft 2020-12 validation.

- **Pro**: Full spec compliance. Validates types, patterns, nested objects, enums, conditionalRequire
- **Pro**: Industry standard for JSON Schema validation in JavaScript
- **Con**: New runtime dependency (~180KB minified). ajv is well-maintained (MIT license) but adds to bundle size and supply chain
- **Con**: Over-powered for Phase A requirements. Key-presence-only validation is explicitly specified. Full type validation risks false positives from type coercion (e.g., `"42"` vs `42`)
- **Con**: Full validation output is verbose. Warning messages would include JSON Schema jargon that agents may not interpret well
- **Rejection rationale**: Violates "no new runtime dependencies unless strongly justified." Key-presence is sufficient for Phase A. If Phase B requires full schema validation (type checking, nested validation), ajv can be added then with the justification of expanded requirements.

### Zod Schema Generation from JSON Schema

Convert schema.json into Zod schemas at runtime and validate using existing Zod dependency.

- **Pro**: No new dependency. Zod is already present
- **Pro**: Zod validation messages are clean and well-structured
- **Con**: Zod does not natively parse JSON Schema. Would require a `json-schema-to-zod` conversion library (new dependency) or hand-rolled converter
- **Con**: JSON Schema draft 2020-12 to Zod conversion is non-trivial and error-prone
- **Con**: Zod validation is strict by default (rejects on failure). Would need to be wrapped in safeParse with custom warning extraction
- **Rejection rationale**: The complexity of JSON Schema to Zod conversion far exceeds the benefit for key-presence-only validation. A simple array-includes check is 5 lines of logic.

## Consequences

### Positive

- Zero new dependencies
- Validation logic is trivial to implement and test
- Warning messages are clear and actionable ("Missing required field 'customer'")
- Preserves dumb-router philosophy: request always submits, warnings are informational
- Phase B can upgrade to ajv if full type validation is justified

### Negative

- Does not validate field types (string vs number vs array). An agent could submit `involved_files: "file1, file2"` instead of `involved_files: ["file1", "file2"]` and get no warning
- Does not validate nested objects or array item schemas
- Not JSON Schema spec compliant -- only uses the `required` array, ignores everything else for validation purposes
- If schema.json itself is malformed (e.g., `required` is not an array), validation silently skips. This is acceptable because schema.json authoring is a human process with low volume.
