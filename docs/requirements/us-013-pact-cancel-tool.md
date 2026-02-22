# US-013: Cancel a Pending Request (pact_cancel)

## Problem (The Pain)
Cory sent a code-review request to Dan, but realized he sent it to the wrong person -- it should have gone to Maria Santos. The request is sitting in pending/ and Dan has not seen it yet. Cory's only option is to SSH into the repo server, manually run git mv, edit the JSON, commit, and push. This is error-prone, breaks the audit trail convention, and defeats the purpose of the MCP abstraction.

## Who (The User)
- Cory, a developer who sent a request by mistake
- Needs to retract it before the recipient acts on it
- Should not need manual git operations to fix a mistake

## Solution (What We Build)
A new MCP tool `pact_cancel` that moves a pending request to requests/cancelled/, updates the status field to "cancelled", and commits with a structured message. Only the original sender can cancel.

## Domain Examples

### Example 1: Cancel Sent to Wrong Person
Cory sent request "req-20260222-140000-cory-a1b2" (code-review) to Dan. He immediately realizes Dan does not work on that repo -- it should go to Maria Santos. Cory says "Cancel that code review request." The agent calls pact_cancel, the request moves to cancelled/, and Cory resends to Maria Santos.

### Example 2: Cancel Stale Request
Cory sent a sanity-check to Dan 3 days ago. Dan never responded and Cory figured it out himself. Cory cancels the request so it does not clutter Dan's inbox. Dan checks his inbox later and does not see the stale request.

### Example 3: Cannot Cancel a Completed Request
Cory tries to cancel request "req-20260222-140000-cory-a1b2" but Dan already responded. The request is in completed/. pact_cancel returns an error: "Request is already completed and cannot be cancelled." The completed request and Dan's response are preserved.

## UAT Scenarios (BDD)

### Scenario: Sender cancels a pending request
Given Cory sent request "req-20260222-140000-cory-a1b2" to Dan
And the request is in requests/pending/
When Cory calls pact_cancel with request_id "req-20260222-140000-cory-a1b2"
Then the request file is moved to requests/cancelled/
And the status field in the JSON is "cancelled"
And the commit message is "[pact] cancelled: req-20260222-140000-cory-a1b2"
And the change is pushed to the remote
And the return value includes status "cancelled" and a confirmation message

### Scenario: Non-sender cannot cancel
Given Cory sent request "req-20260222-140000-cory-a1b2" to Dan
When Dan calls pact_cancel with request_id "req-20260222-140000-cory-a1b2"
Then pact_cancel returns an error: "Only the sender can cancel a request"
And the request remains in requests/pending/ unchanged

### Scenario: Cannot cancel a completed request
Given request "req-20260222-140000-cory-a1b2" has been completed by Dan
When Cory calls pact_cancel for that request
Then pact_cancel returns an error: "Request is already completed and cannot be cancelled"
And the completed request is unchanged

### Scenario: Cannot cancel an already-cancelled request
Given request "req-20260222-140000-cory-a1b2" was already cancelled
When Cory calls pact_cancel for that request
Then pact_cancel returns an error: "Request is already cancelled"

### Scenario: Cancel non-existent request
When Cory calls pact_cancel with request_id "req-nonexistent"
Then pact_cancel returns an error: "Request req-nonexistent not found"

## Acceptance Criteria
- [ ] pact_cancel moves a pending request to requests/cancelled/
- [ ] Status field in the JSON is updated to "cancelled" before the move
- [ ] Only the original sender (sender.user_id == PACT_USER) can cancel
- [ ] Returns an error for completed, already-cancelled, or non-existent requests
- [ ] Commit message follows convention: "[pact] cancelled: {request_id}"
- [ ] Changes are pushed to the remote
- [ ] Cancelled requests are visible via pact_status with status "cancelled"

## Technical Notes
- Create src/tools/pact-cancel.ts following the same pattern as pact-respond.ts.
- The handler needs: git pull, find request in pending/, verify sender, update status field, git mv to cancelled/, git add + commit + push.
- Register the tool in mcp-server.ts with parameter: `request_id: z.string()`.
- The requests/cancelled/ directory must exist in the repo. Add a .gitkeep if the directory is empty (same convention as other directories).
- pact_status (src/tools/pact-status.ts) needs to be updated to also scan requests/cancelled/ directory. Currently it scans pending, active, completed.

## Dependencies
- US-015 (repo structure update for cancelled/ directory) -- can be combined into this story or done as a prerequisite
- US-009 (pact_thread) should handle cancelled requests in thread history
