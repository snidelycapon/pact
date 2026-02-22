# US-006: Sanity-Check Pact Contract

## Problem (The Pain)
Cory and Alex both need their agents to understand how to compose and handle sanity-check requests consistently. Without a shared contract, Cory's agent might send a vague request missing critical context, and Alex's agent might produce a response that does not answer the actual question. Each handoff becomes a gamble on whether the agents interpreted the interaction the same way.

## Who (The User)
- Cory (sender) -- needs his agent to know what context to gather for a sanity-check
- Alex (receiver) -- needs her agent to know how to investigate and what kind of response to compose
- Both use the SAME pact file -- the contract defines both sides of the interaction

## Solution (What We Build)
A single PACT.md file at `pacts/sanity-check/PACT.md` in the PACT repo that defines: when to use this request type, what context bundle fields to gather (sender side), how to investigate and respond (receiver side), and what the response structure looks like. Both agents load this same file.

## Domain Examples

### Example 1: Cory's Agent Uses the Pact to Compose a Request
Cory says "Send a sanity check to Alex about this memory leak." The agent loads `pacts/sanity-check/PACT.md`, reads the "Composing a Request" section, and knows to gather: customer context (Acme Corp), product (Platform v3.2), involved files (refresh.ts:L45-90), investigation so far (tokens not GC'd), and a specific question ("Does this match the session service pattern?"). If Cory hasn't mentioned the specific question, the agent asks: "What exactly do you want Alex to check?"

### Example 2: Alex's Agent Uses the Pact to Handle the Request
Alex opens the request. The agent auto-loads `pacts/sanity-check/PACT.md` based on the request_type field, reads the "Handling a Request" section, and knows to: read the context bundle, review the involved files, investigate the specific question, and compose a response with answer, evidence, concerns, and recommendation fields. The agent understands the expected response format without Alex having to explain it.

### Example 3: Pact File Updated and Synced
The team decides that sanity-check requests should also include a "severity" field in the context bundle. Cory updates the PACT.md, commits, and pushes. Next time Alex's MCP server runs pact_inbox (which does git pull), she gets the updated pact automatically. Both agents now understand the new field.

## UAT Scenarios (BDD)

### Scenario: Agent gathers required context when composing a sanity-check request
Given the pact file "pacts/sanity-check/PACT.md" defines these context bundle fields:
  | field                | required |
  | customer             | yes      |
  | product              | yes      |
  | issue_summary        | yes      |
  | involved_files       | yes      |
  | investigation_so_far | yes      |
  | question             | yes      |
  | zendesk_ticket       | no       |
When Cory's agent loads the pact to compose a request
Then the agent gathers values for all required fields from the session context
And prompts Cory for any required fields it cannot infer

### Scenario: Agent structures response according to pact
Given Alex has opened a sanity-check request with full context
And the pact file defines response structure: answer, evidence, concerns, recommendation
When Alex says "Compose a response"
Then the agent produces a response with all four fields populated
And the response follows the structure defined in the pact

### Scenario: Updated pact file is available after git pull
Given Cory updates "pacts/sanity-check/PACT.md" to add a "severity" field
And Cory commits and pushes the update
When Alex's agent runs pact_inbox (which triggers git pull)
Then Alex's local copy of "pacts/sanity-check/PACT.md" reflects the update
And the agent recognizes the new "severity" field when composing or handling requests

### Scenario: Pact file provides guidance without enforcement
Given the pact file recommends including a zendesk_ticket field
And Cory's investigation has no associated Zendesk ticket
When Cory's agent composes a request
Then the request is valid without the zendesk_ticket field
And the agent does not block submission for missing optional fields

### Scenario: Same pact file works for both sender and receiver
Given "pacts/sanity-check/PACT.md" contains both composition and handling sections
When Cory's agent loads it for composing a request
Then it reads the composition guidance
When Alex's agent loads it for handling the received request
Then it reads the handling and response structure guidance
And both agents reference the same context bundle field definitions

## Acceptance Criteria
- [ ] Single PACT.md file per request type (not separate sender/receiver files)
- [ ] Pact file defines: when to use, context bundle fields, handling guidance, response structure
- [ ] Context bundle fields have required/optional designation
- [ ] Pact file is usable by agents on both sender and receiver side
- [ ] Pact files distribute automatically via git pull (no manual installation)
- [ ] The sanity-check pact includes real-world field definitions based on tech support handoff needs

## Technical Notes
- The pact file is markdown (PACT.md), not JSON schema. It is designed to be read by LLM agents as natural language instructions, not parsed programmatically.
- The MCP server does NOT parse or validate against the pact file. Pacts are agent-level guidance, not server-level enforcement. This is the Code Mode pattern: the protocol is flexible, the pact provides the structure.
- The pact filename convention is `pacts/{request_type}/PACT.md`. The request_type field in the request envelope must match the directory name.
- This is the single highest-risk assumption in the MVP (B10 from discovery): do paired pact instructions produce consistent agent behavior? The walking skeleton test must validate this with 5+ round-trips.
