# US-019: Skill Discovery Tool (garp_skills)

## Problem (The Pain)
Cory is a developer who wants to ask Dan to review his OAuth refresh fix. He knows GARP has request types for this, but he cannot remember which one to use -- was it "code-review" or "sanity-check" or something else? Today, his agent has no way to list or search available skills. The only discovery mechanism is loading all SKILL.md files into context at session startup, which costs ~1,340 tokens at 4 skills and will cost ~33,600 tokens at 100 skills. Without startup loading, the agent guesses the skill name or the human has to remember it.

Maria Santos is new to the team. She has never seen the skill catalog. She tells her agent "I need someone to look over my code changes." The agent has no mechanism to discover that a "code-review" skill exists or what fields it needs. Maria ends up asking a teammate on Slack what to type.

## Who (The User)
- Cory, a developer composing a GARP request who cannot remember the exact skill name
- Maria Santos, a new team member who has never seen the available request types
- Any agent composing a request without prior knowledge of the skill catalog
- Key motivation: discover and select the right request type without human hand-holding

## Solution (What We Build)
A new MCP tool `garp_skills` that lists available request types with lightweight metadata extracted from SKILL.md files (and schema.json when present). Supports an optional search query to filter skills by keyword matching against name, description, and when_to_use content.

## Domain Examples

### Example 1: Cory Lists All Skills to Find the Right Type
Cory tells his agent "Can someone review my auth changes?" The agent calls garp_skills with no query. The result returns 4 skills: ask, code-review, design-skill, sanity-check. Each entry includes the skill name, a one-line description, a when_to_use summary, and the field names for context_bundle and response_bundle. The agent reads the descriptions, determines that "code-review" matches Cory's intent ("Request a code review on a branch or changeset"), and proceeds to load the full code-review SKILL.md to compose the request.

### Example 2: Maria Santos Searches by Intent
Maria tells her agent "I need someone to look over my code changes." The agent calls garp_skills with query "review code changes." The query matches against the code-review skill's name and description. The result returns 1 skill: code-review with description "Request a code review on a branch or changeset", context_fields ["repository", "branch", "language", "description", "areas_of_concern", "related_tickets"]. Maria's agent now knows exactly what type to use and what fields to gather, without Maria ever needing to know the skill name.

### Example 3: Search Returns No Matches
Cory tells his agent "Can someone check the deploy pipeline?" The agent calls garp_skills with query "deploy pipeline." No skill matches. The result returns an empty skills array with no error. The agent reports to Cory: "No request types match 'deploy pipeline.' Available types are: ask, code-review, design-skill, sanity-check." Cory can then either pick one or create a new skill.

## UAT Scenarios (BDD)

### Scenario: List all available skills
Given the GARP repo has 4 skills: ask, code-review, sanity-check, design-skill
When Cory's agent calls garp_skills with no query
Then the result contains 4 skill entries
And each entry includes name, description, when_to_use, context_fields, response_fields, and skill_path

### Scenario: Search skills by keyword
Given the GARP repo has 4 skills
When Maria Santos's agent calls garp_skills with query "review code"
Then the result includes the "code-review" skill
And the result does not include "ask" or "sanity-check"

### Scenario: Search matches against when_to_use content
Given the sanity-check skill's when_to_use section contains "second pair of eyes"
When Cory's agent calls garp_skills with query "second pair of eyes"
Then the result includes the "sanity-check" skill

### Scenario: Search with no matches returns empty array
Given the GARP repo has 4 skills
When Maria Santos's agent calls garp_skills with query "deploy pipeline"
Then the result contains 0 skills
And the response is not an error

### Scenario: garp_skills prefers schema.json fields when available
Given the sanity-check skill has both SKILL.md and schema.json
And schema.json defines context_bundle properties: customer, product, issue_summary, involved_files, investigation_so_far, question, zendesk_ticket
When Cory's agent calls garp_skills
Then the "sanity-check" entry's context_fields are extracted from schema.json
And required fields are distinguishable from optional fields

### Scenario: garp_skills falls back to SKILL.md when no schema.json exists
Given the ask skill has SKILL.md but no schema.json
When Cory's agent calls garp_skills
Then the "ask" entry's context_fields are extracted from the SKILL.md field table
And the tool does not error on the missing schema.json

### Scenario: garp_skills pulls latest before scanning
When Cory's agent calls garp_skills
Then the tool runs git pull before scanning the skills directory
And if git pull fails, the tool uses local data with a staleness warning

## Acceptance Criteria
- [ ] garp_skills registered as a new MCP tool in mcp-server.ts
- [ ] Accepts an optional query parameter (string) for keyword filtering
- [ ] Returns all skills when no query is provided
- [ ] Each skill entry includes: name, description, when_to_use, context_fields, response_fields, skill_path
- [ ] Search matches against skill name, description, and when_to_use content (case-insensitive)
- [ ] Prefers schema.json for field extraction when available; falls back to SKILL.md parsing
- [ ] Runs git pull before scanning (with fallback on failure and staleness warning)
- [ ] Returns empty array (not error) when no skills match the query

## Technical Notes
- Tool handler follows the same pattern as existing tools: ensureAdapters, try/catch, formatResult/formatError
- Skill metadata extraction: read H1 (name), first paragraph after H1 (description), "When To Use" section content, "Context Bundle Fields" table Field column, "Response Structure" table Field column
- When schema.json exists, prefer `context_bundle.properties` keys for context_fields and `response_bundle.properties` keys for response_fields
- Keyword search is case-insensitive substring matching. Not fuzzy matching or semantic search (keep it simple for Phase A)
- The skill parsing logic (extracting metadata from SKILL.md) should be in a shared module since it will also be used by the inbox enrichment (US-020)
- Register as the 8th MCP tool in mcp-server.ts following existing patterns

## Dependencies
- None (skills/ directory and SKILL.md convention already exist)
- US-021 (schema.json convention) is beneficial but not blocking -- garp_skills works with SKILL.md alone
- The skill parsing module created here will be consumed by US-020 (inbox enrichment)
