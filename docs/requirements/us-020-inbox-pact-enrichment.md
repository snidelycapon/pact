# US-020: Inbox Pact Enrichment

## Problem (The Pain)
Dan is a developer who just checked his PACT inbox and sees 3 pending requests. Each entry shows the request_type ("sanity-check", "code-review", "ask") and a summary, but Dan has no idea what fields each response expects. To find out, he must make a separate file read of pacts/sanity-check/PACT.md (66 lines), then pacts/code-review/PACT.md (128 lines), then pacts/ask/PACT.md (27 lines) -- three additional file reads totaling 221 lines of markdown just to understand what each request expects back. For simple requests like "ask", this is a 27-line read to learn that the response needs "answer" and "reasoning." That information could fit in a single inbox field.

## Who (The User)
- Dan, a developer checking his PACT inbox with multiple pending requests of different types
- Any receiver agent processing inbox entries that needs to understand response expectations
- Key motivation: orient quickly on what each request expects without separate file reads

## Solution (What We Build)
Enrich pact_inbox response entries with two new fields: `pact_description` (one-line summary of the pact) and `response_fields` (array of expected response field names). This metadata is extracted from PACT.md or schema.json using the same parsing logic from US-019 (pact_pacts).

## Domain Examples

### Example 1: Dan Sees Response Expectations Inline
Dan checks his inbox and sees a sanity-check request from Cory. The inbox entry now includes `pact_description: "Validate findings on a bug investigation"` and `response_fields: ["answer", "evidence", "concerns", "recommendation"]`. Dan's agent immediately knows the response structure without reading the 66-line sanity-check PACT.md. Dan says "respond to that" and the agent structures its response with all four expected fields.

### Example 2: Multiple Request Types in One Inbox
Dan has 3 pending requests: a sanity-check from Cory, a code-review from Maria Santos, and an ask from Alex. Each inbox entry includes different response_fields:
- sanity-check: ["answer", "evidence", "concerns", "recommendation"]
- code-review: ["status", "summary", "blocking_feedback", "advisory_feedback", "questions"]
- ask: ["answer", "reasoning", "caveats"]
Dan's agent can prioritize and respond to each with the correct structure without reading any PACT.md files.

### Example 3: Pact Without schema.json Still Gets Enrichment
Dan receives an ask request. The ask pact has no schema.json. The inbox enrichment falls back to parsing the ask PACT.md, extracts the response fields from the "Response Structure" table, and includes `response_fields: ["answer", "reasoning", "caveats"]` in the inbox entry. The enrichment works regardless of whether schema.json exists.

## UAT Scenarios (BDD)

### Scenario: Inbox entry includes pact description
Given Cory sent a sanity-check request to Dan
When Dan's agent calls pact_inbox
Then the inbox entry includes pact_description "Validate findings on a bug investigation"

### Scenario: Inbox entry includes response field names
Given Cory sent a sanity-check request to Dan
And the sanity-check pact defines response fields: answer, evidence, concerns, recommendation
When Dan's agent calls pact_inbox
Then the inbox entry includes response_fields ["answer", "evidence", "concerns", "recommendation"]

### Scenario: Enrichment uses schema.json when available
Given the sanity-check pact has a schema.json with response_bundle properties
When Dan's agent calls pact_inbox with a pending sanity-check request
Then response_fields are extracted from schema.json response_bundle.properties keys

### Scenario: Enrichment falls back to PACT.md when no schema.json
Given the ask pact has PACT.md but no schema.json
When Dan's agent calls pact_inbox with a pending ask request
Then response_fields are extracted from the PACT.md "Response Structure" table

### Scenario: Enrichment does not fail when pact file is missing
Given a request with request_type "unknown-pact" that has no PACT.md
When Dan's agent calls pact_inbox
Then the inbox entry omits pact_description and response_fields
And the remaining inbox fields are present and correct
And no error occurs

## Acceptance Criteria
- [ ] pact_inbox entries include pact_description (string) when pact exists
- [ ] pact_inbox entries include response_fields (string[]) when pact exists
- [ ] Prefers schema.json for response_fields extraction; falls back to PACT.md
- [ ] Missing or unreadable pact files cause the enrichment fields to be omitted (not an error)
- [ ] Existing inbox fields (request_id, short_id, request_type, sender, summary, pact_path, attachment_count, amendment_count) remain unchanged

## Technical Notes
- Modifies pact-inbox.ts to add pact_description and response_fields to InboxEntry interface
- Uses the shared pact parsing module created in US-019 (extractDescription, extractResponseFields)
- For each inbox entry, attempt to read pact metadata. If the pact directory or files are missing/malformed, omit the enrichment fields silently (do not fail the inbox scan)
- Performance consideration: with many pending requests of the same type, cache the pact metadata per request_type during a single inbox scan to avoid re-reading the same PACT.md multiple times
- The InboxThreadGroup type should also include pact_description and response_fields (from the latest entry's pact)

## Dependencies
- US-019 (pact_pacts tool) -- shares the pact parsing module. Beneficial but not strictly blocking if parsing logic is duplicated.
- US-021 (schema.json convention) -- beneficial for richer field extraction but not blocking. Enrichment works with PACT.md alone.
