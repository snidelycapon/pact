# US-002: Submit a PACT Request (pact_request)

## Problem (The Pain)
Cory is a tech support engineer who finds a bug pattern during an agent-assisted investigation. He needs to ask his colleague Alex to sanity-check the finding. Today he interrupts his investigation to manually compose a markdown handoff, copy-paste relevant context, and send it over Slack. The context is lossy, unstructured, and not agent-readable on the receiving end.

## Who (The User)
- Cory, investigating a bug with his agent in Craft Agents
- Needs to send a structured request to Alex without leaving the agent session
- Wants the agent to assemble the context bundle from the current investigation

## Solution (What We Build)
An MCP tool `pact_request` that accepts a structured request (rigid envelope with flexible context_bundle), validates the envelope, writes it as a JSON file to `requests/pending/` in the PACT repo, and commits and pushes to the remote. The agent composes the request with guidance from the PACT.md and presents it for human review before submission.

## Domain Examples

### Example 1: Sanity-Check Request for a Memory Leak
Cory is investigating a memory leak in Acme Corp's Platform v3.2. His agent has examined `src/auth/refresh.ts` lines 45-90 and found that refresh tokens are not being garbage collected. Cory says "Send a sanity check to Alex about this." The agent loads the sanity-check PACT.md, assembles the context bundle (customer: Acme Corp, product: Platform v3.2, files: refresh.ts:L45-90, finding: tokens not GC'd, question: "Does this match the session service pattern from last month?"), presents the request for review, and on approval calls pact_request. The file `requests/pending/req-20260221-143022-cory.json` is created, committed, and pushed.

### Example 2: Request with a Deadline
Cory has an urgent customer escalation for Nexus Inc. He composes a sanity-check request to Alex with deadline set to "2026-02-21T18:00:00Z" (end of business). The deadline field is included in the envelope. At MVP, the deadline is informational only (displayed to Alex). At Tier 2, the brain service could send reminders.

### Example 3: Request to Non-Existent Recipient
Cory tries to send a request to "bob" who is not listed in config.json. The MCP server reads config.json, finds no member with user_id "bob", and returns an error: "Recipient 'bob' not found in team config." No file is written, no commit is made.

## UAT Scenarios (BDD)

### Scenario: Successfully submit a sanity-check request
Given Cory has a configured MCP server with PACT_USER "cory" and PACT_REPO pointing to the acme-pact repo
And config.json lists "alex" as a team member
When the agent calls pact_request with:
  | field         | value                                              |
  | request_type  | sanity-check                                       |
  | recipient     | alex                                               |
  | context_bundle | { customer: "Acme Corp", question: "Does this match..." } |
Then a JSON file is created in requests/pending/ with a unique request_id
And the file contains the full envelope with sender "cory", recipient "alex", status "pending"
And the file is committed with message "[pact] new request: {id} (sanity-check) -> alex"
And the commit is pushed to the remote

### Scenario: Reject request to unknown recipient
Given config.json lists members "cory" and "alex" only
When the agent calls pact_request with recipient "bob"
Then pact_request returns an error indicating "bob" is not a team member
And no file is created in the repo
And no git commit is made

### Scenario: Generate unique request IDs across concurrent submissions
Given Cory submits a request at 14:30:22 UTC
And Alex submits a request at 14:30:22 UTC (same second)
Then both requests receive different request_id values
And both files coexist in requests/pending/ without collision

### Scenario: Handle git push failure with rebase retry
Given Cory's agent calls pact_request
And the local repo is behind the remote by 1 commit
When git push fails
Then the MCP server runs git pull --rebase
And retries git push
And the request is submitted successfully

### Scenario: Validate envelope has required fields
Given the agent calls pact_request missing the "recipient" field
Then pact_request returns a validation error listing the missing field
And no file is created

## Acceptance Criteria
- [ ] pact_request writes a valid JSON file to requests/pending/ with unique request_id
- [ ] Envelope fields are validated: request_type, recipient, context_bundle are required
- [ ] Recipient is validated against config.json members list
- [ ] File is committed with structured commit message and pushed to remote
- [ ] Git push failure triggers pull --rebase and retry (one retry attempt)
- [ ] Request IDs are unique even with concurrent submissions from different users

## Technical Notes
- Request ID generation must handle same-second collisions across clients. Candidate: `req-{YYYYMMDD}-{HHmmss}-{user_id}` with fallback to append random suffix on collision.
- The MCP server runs `git pull` before writing to minimize push conflicts.
- context_bundle is NOT validated by the MCP server -- it is a flexible payload. The pact defines expected fields, but the server is type-agnostic.
- The `sender` field is populated from PACT_USER env var and config.json lookup, not from tool input (prevents spoofing).
