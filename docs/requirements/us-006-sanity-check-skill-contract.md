# US-006: Sanity-Check Skill Contract

## Problem (The Pain)
Cory and Alex both need their agents to understand how to compose and handle sanity-check requests consistently. Without a shared contract, Cory's agent might send a vague request missing critical context, and Alex's agent might produce a response that does not answer the actual question. Each handoff becomes a gamble on whether the agents interpreted the interaction the same way.

## Who (The User)
- Cory (sender) -- needs his agent to know what context to gather for a sanity-check
- Alex (receiver) -- needs her agent to know how to investigate and what kind of response to compose
- Both use the SAME skill file -- the contract defines both sides of the interaction

## Solution (What We Build)
A single SKILL.md file at `skills/sanity-check/SKILL.md` in the GARP repo that defines: when to use this request type, what context bundle fields to gather (sender side), how to investigate and respond (receiver side), and what the response structure looks like. Both agents load this same file.

## Domain Examples

### Example 1: Cory's Agent Uses the Skill to Compose a Request
Cory says "Send a sanity check to Alex about this memory leak." The agent loads `skills/sanity-check/SKILL.md`, reads the "Composing a Request" section, and knows to gather: customer context (Acme Corp), product (Platform v3.2), involved files (refresh.ts:L45-90), investigation so far (tokens not GC'd), and a specific question ("Does this match the session service pattern?"). If Cory hasn't mentioned the specific question, the agent asks: "What exactly do you want Alex to check?"

### Example 2: Alex's Agent Uses the Skill to Handle the Request
Alex opens the request. The agent auto-loads `skills/sanity-check/SKILL.md` based on the request_type field, reads the "Handling a Request" section, and knows to: read the context bundle, review the involved files, investigate the specific question, and compose a response with answer, evidence, concerns, and recommendation fields. The agent understands the expected response format without Alex having to explain it.

### Example 3: Skill File Updated and Synced
The team decides that sanity-check requests should also include a "severity" field in the context bundle. Cory updates the SKILL.md, commits, and pushes. Next time Alex's MCP server runs garp_inbox (which does git pull), she gets the updated skill automatically. Both agents now understand the new field.

## UAT Scenarios (BDD)

### Scenario: Agent gathers required context when composing a sanity-check request
Given the skill file "skills/sanity-check/SKILL.md" defines these context bundle fields:
  | field                | required |
  | customer             | yes      |
  | product              | yes      |
  | issue_summary        | yes      |
  | involved_files       | yes      |
  | investigation_so_far | yes      |
  | question             | yes      |
  | zendesk_ticket       | no       |
When Cory's agent loads the skill to compose a request
Then the agent gathers values for all required fields from the session context
And prompts Cory for any required fields it cannot infer

### Scenario: Agent structures response according to skill contract
Given Alex has opened a sanity-check request with full context
And the skill file defines response structure: answer, evidence, concerns, recommendation
When Alex says "Compose a response"
Then the agent produces a response with all four fields populated
And the response follows the structure defined in the skill

### Scenario: Updated skill file is available after git pull
Given Cory updates "skills/sanity-check/SKILL.md" to add a "severity" field
And Cory commits and pushes the update
When Alex's agent runs garp_inbox (which triggers git pull)
Then Alex's local copy of "skills/sanity-check/SKILL.md" reflects the update
And the agent recognizes the new "severity" field when composing or handling requests

### Scenario: Skill file provides guidance without enforcement
Given the skill file recommends including a zendesk_ticket field
And Cory's investigation has no associated Zendesk ticket
When Cory's agent composes a request
Then the request is valid without the zendesk_ticket field
And the agent does not block submission for missing optional fields

### Scenario: Same skill file works for both sender and receiver
Given "skills/sanity-check/SKILL.md" contains both composition and handling sections
When Cory's agent loads it for composing a request
Then it reads the composition guidance
When Alex's agent loads it for handling the received request
Then it reads the handling and response structure guidance
And both agents reference the same context bundle field definitions

## Acceptance Criteria
- [ ] Single SKILL.md file per request type (not separate sender/receiver files)
- [ ] Skill file defines: when to use, context bundle fields, handling guidance, response structure
- [ ] Context bundle fields have required/optional designation
- [ ] Skill file is usable by agents on both sender and receiver side
- [ ] Skill files distribute automatically via git pull (no manual installation)
- [ ] The sanity-check skill includes real-world field definitions based on tech support handoff needs

## Technical Notes
- The skill file is markdown (SKILL.md), not JSON schema. It is designed to be read by LLM agents as natural language instructions, not parsed programmatically.
- The MCP server does NOT parse or validate against the skill file. Skills are agent-level guidance, not server-level enforcement. This is the Code Mode pattern: the protocol is flexible, the skill provides the structure.
- The skill filename convention is `skills/{request_type}/SKILL.md`. The request_type field in the request envelope must match the directory name.
- This is the single highest-risk assumption in the MVP (B10 from discovery): do paired skill instructions produce consistent agent behavior? The walking skeleton test must validate this with 5+ round-trips.
