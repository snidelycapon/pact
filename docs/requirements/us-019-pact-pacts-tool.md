# US-019: Pact Discovery Tool (pact_pacts)

## Problem (The Pain)
Cory is a developer who wants to ask Dan to review his OAuth refresh fix. He knows PACT has request types for this, but he cannot remember which one to use -- was it "code-review" or "sanity-check" or something else? Today, his agent has no way to list or search available pacts. The only discovery mechanism is loading all PACT.md files into context at session startup, which costs ~1,340 tokens at 4 pacts and will cost ~33,600 tokens at 100 pacts. Without startup loading, the agent guesses the pact name or the human has to remember it.

Maria Santos is new to the team. She has never seen the pact catalog. She tells her agent "I need someone to look over my code changes." The agent has no mechanism to discover that a "code-review" pact exists or what fields it needs. Maria ends up asking a teammate on Slack what to type.

## Who (The User)
- Cory, a developer composing a PACT request who cannot remember the exact pact name
- Maria Santos, a new team member who has never seen the available request types
- Any agent composing a request without prior knowledge of the pact catalog
- Key motivation: discover and select the right request type without human hand-holding

## Solution (What We Build)
A new MCP tool `pact_pacts` that lists available request types with lightweight metadata extracted from PACT.md files (and schema.json when present). Supports an optional search query to filter pacts by keyword matching against name, description, and when_to_use content.

## Domain Examples

### Example 1: Cory Lists All Pacts to Find the Right Type
Cory tells his agent "Can someone review my auth changes?" The agent calls pact_pacts with no query. The result returns 4 pacts: ask, code-review, design-pact, sanity-check. Each entry includes the pact name, a one-line description, a when_to_use summary, and the field names for context_bundle and response_bundle. The agent reads the descriptions, determines that "code-review" matches Cory's intent ("Request a code review on a branch or changeset"), and proceeds to load the full code-review PACT.md to compose the request.

### Example 2: Maria Santos Searches by Intent
Maria tells her agent "I need someone to look over my code changes." The agent calls pact_pacts with query "review code changes." The query matches against the code-review pact's name and description. The result returns 1 pact: code-review with description "Request a code review on a branch or changeset", context_fields ["repository", "branch", "language", "description", "areas_of_concern", "related_tickets"]. Maria's agent now knows exactly what type to use and what fields to gather, without Maria ever needing to know the pact name.

### Example 3: Search Returns No Matches
Cory tells his agent "Can someone check the deploy pipeline?" The agent calls pact_pacts with query "deploy pipeline." No pact matches. The result returns an empty pacts array with no error. The agent reports to Cory: "No request types match 'deploy pipeline.' Available types are: ask, code-review, design-pact, sanity-check." Cory can then either pick one or create a new pact.

## UAT Scenarios (BDD)

### Scenario: List all available pacts
Given the PACT repo has 4 pacts: ask, code-review, sanity-check, design-pact
When Cory's agent calls pact_pacts with no query
Then the result contains 4 pact entries
And each entry includes name, description, when_to_use, context_fields, response_fields, and pact_path

### Scenario: Search pacts by keyword
Given the PACT repo has 4 pacts
When Maria Santos's agent calls pact_pacts with query "review code"
Then the result includes the "code-review" pact
And the result does not include "ask" or "sanity-check"

### Scenario: Search matches against when_to_use content
Given the sanity-check pact's when_to_use section contains "second pair of eyes"
When Cory's agent calls pact_pacts with query "second pair of eyes"
Then the result includes the "sanity-check" pact

### Scenario: Search with no matches returns empty array
Given the PACT repo has 4 pacts
When Maria Santos's agent calls pact_pacts with query "deploy pipeline"
Then the result contains 0 pacts
And the response is not an error

### Scenario: pact_pacts prefers schema.json fields when available
Given the sanity-check pact has both PACT.md and schema.json
And schema.json defines context_bundle properties: customer, product, issue_summary, involved_files, investigation_so_far, question, zendesk_ticket
When Cory's agent calls pact_pacts
Then the "sanity-check" entry's context_fields are extracted from schema.json
And required fields are distinguishable from optional fields

### Scenario: pact_pacts falls back to PACT.md when no schema.json exists
Given the ask pact has PACT.md but no schema.json
When Cory's agent calls pact_pacts
Then the "ask" entry's context_fields are extracted from the PACT.md field table
And the tool does not error on the missing schema.json

### Scenario: pact_pacts pulls latest before scanning
When Cory's agent calls pact_pacts
Then the tool runs git pull before scanning the pacts directory
And if git pull fails, the tool uses local data with a staleness warning

## Acceptance Criteria
- [ ] pact_pacts registered as a new MCP tool in mcp-server.ts
- [ ] Accepts an optional query parameter (string) for keyword filtering
- [ ] Returns all pacts when no query is provided
- [ ] Each pact entry includes: name, description, when_to_use, context_fields, response_fields, pact_path
- [ ] Search matches against pact name, description, and when_to_use content (case-insensitive)
- [ ] Prefers schema.json for field extraction when available; falls back to PACT.md parsing
- [ ] Runs git pull before scanning (with fallback on failure and staleness warning)
- [ ] Returns empty array (not error) when no pacts match the query

## Technical Notes
- Tool handler follows the same pattern as existing tools: ensureAdapters, try/catch, formatResult/formatError
- Pact metadata extraction: read H1 (name), first paragraph after H1 (description), "When To Use" section content, "Context Bundle Fields" table Field column, "Response Structure" table Field column
- When schema.json exists, prefer `context_bundle.properties` keys for context_fields and `response_bundle.properties` keys for response_fields
- Keyword search is case-insensitive substring matching. Not fuzzy matching or semantic search (keep it simple for Phase A)
- The pact parsing logic (extracting metadata from PACT.md) should be in a shared module since it will also be used by the inbox enrichment (US-020)
- Register as the 8th MCP tool in mcp-server.ts following existing patterns

## Dependencies
- None (pacts/ directory and PACT.md convention already exist)
- US-021 (schema.json convention) is beneficial but not blocking -- pact_pacts works with PACT.md alone
- The pact parsing module created here will be consumed by US-020 (inbox enrichment)
