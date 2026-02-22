# US-008: Walking Skeleton — Complete Round-Trip Validation

## Problem (The Pain)
Before building any specific features or polishing any UX, Cory needs to know that the fundamental architecture works: can two people on two machines exchange a structured request and response through a shared git repo, using local MCP servers, without ever leaving their agent sessions or touching Slack? If this round-trip fails, nothing else matters.

## Who (The User)
- Cory (sender) and Alex (receiver) -- two real people on two machines
- Both using Craft Agents with the PACT MCP server configured
- Testing the complete end-to-end flow for the first time

## Solution (What We Build)
A walking skeleton that validates the complete coordination loop: Cory composes a request, pushes to the shared repo, Alex pulls and sees it in her inbox, investigates, responds and pushes back, Cory pulls and sees the response. Every piece of the architecture is exercised: MCP tools, git operations, request/response JSON, pact loading, directory lifecycle.

## Domain Examples

### Example 1: The Happy Path Round-Trip
Cory is investigating the Acme Corp memory leak. He tells his agent to send a sanity check to Alex. The agent loads the pact, assembles the context, presents it for review, Cory approves, and it pushes. Minutes later, Alex checks her inbox, sees the request, opens it with full context loaded, investigates, composes a response, approves, and pushes. Cory checks status in a new session and sees Alex's findings: "Yes, same pattern as ZD-4102. Apply the finally-block cleanup."

### Example 2: Round-Trip Proves Session Independence
Cory sends the request from Session A at 2:30 PM. He closes Session A. At 4:00 PM, Alex responds. The next morning at 9:00 AM, Cory opens Session B and checks status. The response is there. Three different sessions, one coherent interaction -- proving the protocol is truly async and session-independent.

### Example 3: Round-Trip Proves Git Transport Works
During the round-trip, both Cory and Alex make other commits to the repo (new requests, other responses). The PACT tool handles git pull/push correctly with no conflicts, no lost data, and structured commit messages that make the git log readable as an audit trail.

## UAT Scenarios (BDD)

### Scenario: Complete round-trip from compose to response
Given Cory and Alex both have configured MCP servers for the shared "acme-pact" repo
And the sanity-check PACT.md exists in the repo
When Cory's agent composes a sanity-check request to Alex about the Acme Corp memory leak
And Cory reviews and approves the request
And the request is pushed to the repo
And Alex checks her PACT inbox
Then Alex sees 1 pending request from Cory
When Alex opens the request
Then the full context bundle is available (customer, files, question)
And the sanity-check PACT.md is loaded
When Alex investigates and composes a response
And Alex reviews and approves the response
And the response is pushed to the repo
And Cory checks the status of his request
Then Cory sees status "completed" and Alex's full response

### Scenario: Request and response survive session boundaries
Given Cory sends a request from Session A
And Cory closes Session A
And Alex responds from her own session
When Cory opens Session B (hours or days later)
And Cory checks status of the request
Then the response is available in Session B
And no data was lost between sessions

### Scenario: Git log shows complete audit trail
Given a complete round-trip has occurred for "req-20260221-001"
When someone runs "git log --oneline" on the PACT repo
Then the log contains commits for:
  | message pattern                                          |
  | [pact] new request: req-20260221-001 (sanity-check) -> alex |
  | [pact] response: req-20260221-001 (sanity-check) alex -> cory |
And the commits have correct author information and timestamps

### Scenario: No manual git operations required during round-trip
Given Cory and Alex complete a full round-trip
Then neither user ran any manual git commands
And all git operations (pull, add, commit, push) were performed by the MCP server
And both users interacted only through natural language with their agents

### Scenario: Concurrent activity does not break the round-trip
Given Cory has a pending request to Alex
And Alex makes an unrelated commit to the repo (e.g., updating config.json)
When Cory's agent runs pact_status
Then git pull incorporates Alex's unrelated changes
And Cory's request status is correctly returned
And no merge conflicts occur

## Acceptance Criteria
- [ ] Complete round-trip works end-to-end: compose -> push -> pull -> inbox -> investigate -> respond -> push -> pull -> see response
- [ ] Zero manual git operations by either user during the entire flow
- [ ] Zero Slack or out-of-band communication needed to complete the handoff
- [ ] Request and response persist across session boundaries
- [ ] Git log shows structured commit messages forming a readable audit trail
- [ ] No merge conflicts during normal round-trip operations
- [ ] Both users' agents successfully load the pact file and produce structured content

## Technical Notes
- This is the integration test for the entire walking skeleton. All of US-001 through US-007 must be complete before this can be validated.
- The walking skeleton should be tested with the real sanity-check scenario (Acme Corp memory leak), not synthetic test data.
- Success here validates hypothesis H1 (git round-trip works), H3 (git as transport), and partially validates H2 (pacts produce consistent behavior).
- This story has no code to build -- it is a validation story. All code is in US-001 through US-007. This story is "done" when the round-trip works.
- After this validates, the team should run 5+ additional round-trips to test pact consistency (discovery risk R1).

## Dependencies
- US-001: Repo structure must exist
- US-002: pact_request must work
- US-003: pact_inbox must work
- US-004: pact_respond must work
- US-005: pact_status must work
- US-006: Sanity-check PACT.md must exist
- US-007: Craft Agents source config must work
