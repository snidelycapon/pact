# US-020: Inbox Skill Enrichment

## Problem (The Pain)
Dan is a developer who just checked his GARP inbox and sees 3 pending requests. Each entry shows the request_type ("sanity-check", "code-review", "ask") and a summary, but Dan has no idea what fields each response expects. To find out, he must make a separate file read of skills/sanity-check/SKILL.md (66 lines), then skills/code-review/SKILL.md (128 lines), then skills/ask/SKILL.md (27 lines) -- three additional file reads totaling 221 lines of markdown just to understand what each request expects back. For simple requests like "ask", this is a 27-line read to learn that the response needs "answer" and "reasoning." That information could fit in a single inbox field.

## Who (The User)
- Dan, a developer checking his GARP inbox with multiple pending requests of different types
- Any receiver agent processing inbox entries that needs to understand response expectations
- Key motivation: orient quickly on what each request expects without separate file reads

## Solution (What We Build)
Enrich garp_inbox response entries with two new fields: `skill_description` (one-line summary of the skill) and `response_fields` (array of expected response field names). This metadata is extracted from SKILL.md or schema.json using the same parsing logic from US-019 (garp_skills).

## Domain Examples

### Example 1: Dan Sees Response Expectations Inline
Dan checks his inbox and sees a sanity-check request from Cory. The inbox entry now includes `skill_description: "Validate findings on a bug investigation"` and `response_fields: ["answer", "evidence", "concerns", "recommendation"]`. Dan's agent immediately knows the response structure without reading the 66-line sanity-check SKILL.md. Dan says "respond to that" and the agent structures its response with all four expected fields.

### Example 2: Multiple Request Types in One Inbox
Dan has 3 pending requests: a sanity-check from Cory, a code-review from Maria Santos, and an ask from Alex. Each inbox entry includes different response_fields:
- sanity-check: ["answer", "evidence", "concerns", "recommendation"]
- code-review: ["status", "summary", "blocking_feedback", "advisory_feedback", "questions"]
- ask: ["answer", "reasoning", "caveats"]
Dan's agent can prioritize and respond to each with the correct structure without reading any SKILL.md files.

### Example 3: Skill Without schema.json Still Gets Enrichment
Dan receives an ask request. The ask skill has no schema.json. The inbox enrichment falls back to parsing the ask SKILL.md, extracts the response fields from the "Response Structure" table, and includes `response_fields: ["answer", "reasoning", "caveats"]` in the inbox entry. The enrichment works regardless of whether schema.json exists.

## UAT Scenarios (BDD)

### Scenario: Inbox entry includes skill description
Given Cory sent a sanity-check request to Dan
When Dan's agent calls garp_inbox
Then the inbox entry includes skill_description "Validate findings on a bug investigation"

### Scenario: Inbox entry includes response field names
Given Cory sent a sanity-check request to Dan
And the sanity-check skill defines response fields: answer, evidence, concerns, recommendation
When Dan's agent calls garp_inbox
Then the inbox entry includes response_fields ["answer", "evidence", "concerns", "recommendation"]

### Scenario: Enrichment uses schema.json when available
Given the sanity-check skill has a schema.json with response_bundle properties
When Dan's agent calls garp_inbox with a pending sanity-check request
Then response_fields are extracted from schema.json response_bundle.properties keys

### Scenario: Enrichment falls back to SKILL.md when no schema.json
Given the ask skill has SKILL.md but no schema.json
When Dan's agent calls garp_inbox with a pending ask request
Then response_fields are extracted from the SKILL.md "Response Structure" table

### Scenario: Enrichment does not fail when skill file is missing
Given a request with request_type "unknown-skill" that has no SKILL.md
When Dan's agent calls garp_inbox
Then the inbox entry omits skill_description and response_fields
And the remaining inbox fields are present and correct
And no error occurs

## Acceptance Criteria
- [ ] garp_inbox entries include skill_description (string) when skill exists
- [ ] garp_inbox entries include response_fields (string[]) when skill exists
- [ ] Prefers schema.json for response_fields extraction; falls back to SKILL.md
- [ ] Missing or unreadable skill files cause the enrichment fields to be omitted (not an error)
- [ ] Existing inbox fields (request_id, short_id, request_type, sender, summary, skill_path, attachment_count, amendment_count) remain unchanged

## Technical Notes
- Modifies garp-inbox.ts to add skill_description and response_fields to InboxEntry interface
- Uses the shared skill parsing module created in US-019 (extractDescription, extractResponseFields)
- For each inbox entry, attempt to read skill metadata. If the skill directory or files are missing/malformed, omit the enrichment fields silently (do not fail the inbox scan)
- Performance consideration: with many pending requests of the same type, cache the skill metadata per request_type during a single inbox scan to avoid re-reading the same SKILL.md multiple times
- The InboxThreadGroup type should also include skill_description and response_fields (from the latest entry's skill)

## Dependencies
- US-019 (garp_skills tool) -- shares the skill parsing module. Beneficial but not strictly blocking if parsing logic is duplicated.
- US-021 (schema.json convention) -- beneficial for richer field extraction but not blocking. Enrichment works with SKILL.md alone.
