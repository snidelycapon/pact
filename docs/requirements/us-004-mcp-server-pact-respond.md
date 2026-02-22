# US-004: Submit a Response to a Request (pact_respond)

## Problem (The Pain)
Alex has investigated a sanity-check request from Cory and has findings to report back. Today she would compose a reply in Slack, losing the structured format, the link to the original request, and the audit trail. The original requester then has to manually re-parse the response and reconnect it to their investigation.

## Who (The User)
- Alex, colleague who has completed an investigation triggered by a PACT request
- Wants to send structured findings back to the requester
- Needs the response to be linked to the original request and follow the pact's response format

## Solution (What We Build)
An MCP tool `pact_respond` that accepts a structured response for a specific request_id, writes the response as a JSON file to `responses/`, moves the original request from `requests/pending/` (or `requests/active/`) to `requests/completed/`, and commits and pushes everything to the remote.

## Domain Examples

### Example 1: Respond to a Sanity-Check with Confirmation
Alex investigated Cory's memory leak question and confirmed it matches the ZD-4102 pattern. She composes a response with: answer ("YES -- same pattern"), evidence (compared refresh.ts with cleanup.ts), recommendation ("apply finally-block cleanup"). The agent presents this as a Plan for review. Alex approves. pact_respond writes `responses/req-20260221-143022-cory.json`, moves the request to `requests/completed/`, commits with message "[pact] response: req-20260221-143022-cory (sanity-check) alex -> cory", and pushes.

### Example 2: Respond with Concerns and Different Recommendation
Alex investigated and found the pattern is similar but NOT the same root cause. Her response: answer ("PARTIALLY -- similar symptoms, different root cause"), evidence (the GC pattern differs in the token cache layer), concerns ("Applying the same fix may mask the real issue"), recommendation ("Investigate token-cache module separately, do not apply ZD-4102 fix directly"). The response_bundle captures this nuance.

### Example 3: Respond to a Request That Has Already Been Responded To
Alex tries to respond to req-001 but it has already been moved to `requests/completed/` (perhaps she responded in a different session and forgot). pact_respond returns an error: "Request req-001 is already completed." No duplicate response is written.

## UAT Scenarios (BDD)

### Scenario: Successfully respond to a pending sanity-check request
Given request "req-20260221-001" exists in "requests/pending/" addressed to Alex
And PACT_USER is set to "alex"
When the agent calls pact_respond with:
  | field           | value                                        |
  | request_id      | req-20260221-001                             |
  | response_bundle | { answer: "YES", evidence: "...", recommendation: "..." } |
Then a response file is created at "responses/req-20260221-001.json"
And the response contains responder "alex", responded_at timestamp, and the response_bundle
And the request file moves from "requests/pending/" to "requests/completed/"
And the changes are committed with message "[pact] response: req-20260221-001 (sanity-check) alex -> cory"
And the commit is pushed to the remote

### Scenario: Reject response to already-completed request
Given request "req-20260221-001" exists in "requests/completed/"
And a response already exists at "responses/req-20260221-001.json"
When the agent calls pact_respond for "req-20260221-001"
Then pact_respond returns an error indicating the request is already completed
And no new response file is written
And no git commit is made

### Scenario: Reject response to request addressed to someone else
Given request "req-20260221-001" is addressed to recipient "dana" (not "alex")
And PACT_USER is set to "alex"
When the agent calls pact_respond for "req-20260221-001"
Then pact_respond returns an error indicating Alex is not the recipient
And no response is written

### Scenario: Reject response to non-existent request
Given no request with id "req-nonexistent" exists in the repo
When the agent calls pact_respond for "req-nonexistent"
Then pact_respond returns an error indicating the request was not found
And no response is written

### Scenario: Handle git push failure with rebase retry
Given Alex has approved a response for submission
When the agent calls pact_respond
And git push fails because the remote has new commits
Then the MCP server runs git pull --rebase
And retries git push
And the response is submitted successfully

## Acceptance Criteria
- [ ] pact_respond writes a response JSON file to responses/{request_id}.json
- [ ] Response contains responder user_id, display_name, responded_at, and response_bundle
- [ ] The original request file is moved from pending/ (or active/) to completed/ via git mv
- [ ] Both the response write and request move happen in a single commit
- [ ] Rejects response if request is already completed (no duplicate responses)
- [ ] Rejects response if current user is not the designated recipient
- [ ] Rejects response if request_id does not exist
- [ ] Git push failure triggers pull --rebase and retry

## Technical Notes
- The response write and request move MUST be a single atomic git commit. Two separate commits could leave the repo in an inconsistent state if push fails between them.
- response_bundle is NOT validated by the MCP server -- same principle as context_bundle. The pact defines expected fields.
- The responder field is populated from PACT_USER env var and config.json lookup, not from tool input.
- Moving the request file via `git mv` preserves git history -- the file's full lifecycle is traceable via git log.
