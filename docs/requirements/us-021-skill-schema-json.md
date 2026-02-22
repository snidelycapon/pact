# US-021: Machine-Readable Skill Contracts (schema.json)

## Problem (The Pain)
Cory's agent is composing a sanity-check request. It reads the 66-line sanity-check SKILL.md and must interpret a markdown table to determine that "customer", "product", "issue_summary", "involved_files", "investigation_so_far", and "question" are required fields, while "zendesk_ticket" is optional. The agent must parse natural language descriptions like "Customer name (e.g. 'Acme Corp')" to understand the field type is a string. This interpretation is lossy -- the agent might miss that "involved_files" expects an array (not a string), or include "zendesk_ticket" as required when it is optional. At 4 skills this works well enough. At 50 skills with complex field schemas (nested objects, enums, conditional requirements), markdown interpretation becomes unreliable.

## Who (The User)
- Cory, a developer whose agent needs precise field requirements to compose well-formed payloads
- Dan, a receiver whose agent needs to validate its response covers all expected fields
- Skill authors who want their contracts to be followed accurately
- Key motivation: agents produce correct payloads without guessing from markdown

## Solution (What We Build)
An optional `schema.json` file alongside each `SKILL.md` that defines the context_bundle and response_bundle as JSON Schema. When present, tools use schema.json for field extraction and validation. When absent, SKILL.md parsing continues as before. garp_request optionally validates context_bundle against the schema and returns warnings (not rejections) for missing required fields.

## Domain Examples

### Example 1: Cory's Agent Composes With Typed Schema
Cory's agent reads skills/sanity-check/schema.json. The schema defines context_bundle with 6 required fields (customer, product, issue_summary, involved_files, investigation_so_far, question) and 1 optional field (zendesk_ticket). The agent sees that involved_files has type "array" with items of type "string." It assembles the bundle with involved_files as ["src/auth/refresh.ts:L45-90", "src/oauth/token-manager.ts:L120-150"] (an array, not a comma-separated string). The payload is precisely typed.

### Example 2: Validation Warns on Missing Fields
Cory's agent submits a sanity-check request but forgot to include "customer" and "product." garp_request validates the context_bundle against sanity-check schema.json, finds 2 missing required fields, and returns the request with `validation_warnings: ["Missing required field 'customer' (schema: sanity-check v1.0.0)", "Missing required field 'product' (schema: sanity-check v1.0.0)"]`. The request IS submitted (not rejected). Cory's agent sees the warnings and can either use garp_amend to add the missing fields or let it go.

### Example 3: Skill Without schema.json Works Unchanged
The "ask" skill has only SKILL.md, no schema.json. Cory's agent composes an ask request. garp_request checks for skills/ask/schema.json, finds it does not exist, and skips validation entirely. The request is submitted with no validation_warnings field in the response. Everything works exactly as it does today.

## UAT Scenarios (BDD)

### Scenario: schema.json defines context_bundle and response_bundle schemas
Given the sanity-check skill has a schema.json file at skills/sanity-check/schema.json
Then the schema defines context_bundle with required and optional properties
And the schema defines response_bundle with required and optional properties
And both schemas have additionalProperties set to true

### Scenario: garp_request validates against schema.json and warns on missing fields
Given the sanity-check skill has schema.json with required context fields: customer, product, issue_summary, involved_files, investigation_so_far, question
When Cory's agent calls garp_request with request_type "sanity-check"
And context_bundle contains issue_summary, involved_files, investigation_so_far, question
But context_bundle is missing customer and product
Then the request is submitted successfully
And the response includes validation_warnings mentioning "customer" and "product"

### Scenario: garp_request does not warn when all required fields present
Given the sanity-check skill has schema.json
When Cory's agent calls garp_request with all 6 required context fields present
Then the request is submitted successfully
And the response does not include validation_warnings

### Scenario: No validation when schema.json does not exist
Given the ask skill has no schema.json file
When Cory's agent calls garp_request with request_type "ask"
Then the request is submitted successfully
And no schema validation is performed

### Scenario: schema.json allows additional properties beyond required
Given the sanity-check schema.json has additionalProperties: true
When Cory's agent includes an extra field "internal_notes" in context_bundle
Then the request is submitted with no warnings about the extra field
And the extra field is preserved in the request envelope

### Scenario: schema.json created for existing sanity-check skill
Given the sanity-check SKILL.md defines these context fields:
  | field                 | required |
  | customer              | yes      |
  | product               | yes      |
  | issue_summary         | yes      |
  | involved_files        | yes      |
  | investigation_so_far  | yes      |
  | question              | yes      |
  | zendesk_ticket        | no       |
Then the schema.json has matching required array and properties
And the schema.json field descriptions match the SKILL.md descriptions

### Scenario: schema.json created for existing code-review skill
Given the code-review SKILL.md defines context and response fields
Then the code-review schema.json has matching required arrays and properties
And additionalProperties is true on both context_bundle and response_bundle

## Acceptance Criteria
- [ ] schema.json files created for all 4 existing skills (ask, code-review, sanity-check, design-skill)
- [ ] Each schema.json follows JSON Schema draft 2020-12 with skill_name, skill_version, context_bundle, and response_bundle
- [ ] Both context_bundle and response_bundle have additionalProperties: true
- [ ] garp_request checks for schema.json and validates context_bundle when schema exists
- [ ] Validation produces warnings (returned in response), not rejections (request still submits)
- [ ] No validation occurs when schema.json does not exist (backward compatible)
- [ ] schema.json field definitions align with SKILL.md field tables

## Technical Notes
- schema.json location: skills/{type}/schema.json (alongside SKILL.md in the same directory)
- Validation in garp_request: after skill existence check (line 46-49 in garp-request.ts), attempt to read schema.json. If found, validate context_bundle keys against required array. If missing keys, add validation_warnings to the return value.
- Validation is KEY PRESENCE ONLY for Phase A. Not type checking, not nested object validation. Just "are the required keys present?" This keeps validation simple and avoids false positives from type coercion differences.
- The return type of handleGarpRequest gains an optional validation_warnings: string[] field
- schema.json authoring: create manually for the 4 existing skills. Future: consider a generator that reads SKILL.md and produces a schema.json scaffold.
- additionalProperties: true is critical -- it preserves the "open-ended flexibility" that is a core GARP design value
- skill_version: "1.0.0" for all initial schemas. Versioning strategy for schema evolution is a Phase B concern.

## Dependencies
- None (builds on existing skills/ directory convention)
- Consumed by US-019 (garp_skills uses schema.json for richer field extraction)
- Consumed by US-020 (inbox enrichment uses schema.json for response_fields)
- Ordering recommendation: US-021 before US-019 so garp_skills can use schema.json from day one, but US-019 works without schema.json via SKILL.md fallback
