# US-005: Check Request Status (pact_status)

## Problem (The Pain)
Cory sent a sanity-check request to Alex hours ago and wants to know if she has responded yet. Today he would check Slack and scroll through messages hoping to find a reply. There is no single place to check the status of a specific request and see the structured response if one exists.

## Who (The User)
- Cory, the original sender of a PACT request
- Checking from any session (not necessarily the one where he sent the request)
- Wants to see: is it still pending, or has Alex responded? If responded, what did she find?

## Solution (What We Build)
An MCP tool `pact_status` that pulls the latest from the PACT repo, locates a request by ID (searching pending/, active/, and completed/ directories), reads its current status, and if completed, reads and returns the associated response from `responses/`.

## Domain Examples

### Example 1: Check a Completed Request
Cory starts a new session the next morning and says "Check on my sanity-check to Alex." The agent calls pact_status for req-20260221-143022-cory. The tool pulls, finds the request in `requests/completed/`, reads the response from `responses/req-20260221-143022-cory.json`. Returns: status "completed", Alex's response with answer, evidence, and recommendation.

### Example 2: Check a Still-Pending Request
Cory checks 30 minutes after sending. The tool pulls, finds the request still in `requests/pending/`. Returns: status "pending", no response yet. The agent reports "No response yet from Alex."

### Example 3: Check a Request That Does Not Exist
Cory misremembers the request ID and asks about "req-20260220-999". The tool searches all directories and finds nothing. Returns an error: "Request req-20260220-999 not found."

## UAT Scenarios (BDD)

### Scenario: Check status of a completed request with response
Given request "req-20260221-001" exists in "requests/completed/"
And response "responses/req-20260221-001.json" exists with Alex's findings
When the agent calls pact_status for "req-20260221-001"
Then the tool runs git pull
And returns status "completed"
And returns the response including responder "Alex", responded_at, and response_bundle

### Scenario: Check status of a still-pending request
Given request "req-20260221-001" exists in "requests/pending/"
And no response exists for this request
When the agent calls pact_status for "req-20260221-001"
Then the tool runs git pull
And returns status "pending"
And indicates no response is available yet

### Scenario: Check status of a non-existent request
Given no request with id "req-nonexistent" exists in any directory
When the agent calls pact_status for "req-nonexistent"
Then the tool returns an error indicating the request was not found

### Scenario: Check status from a different session than where request was sent
Given Cory sent "req-20260221-001" from Session A which has ended
And Cory starts Session B the next day
When Cory asks "What happened with my request to Alex about the memory leak?"
And the agent calls pact_status for "req-20260221-001"
Then the response is returned regardless of which session Cory is in

### Scenario: Status check with network failure falls back to local state
Given the git remote is unreachable
When the agent calls pact_status for "req-20260221-001"
Then the tool attempts git pull and it fails
And the tool reads from local repo state
And returns the locally known status with a warning that it may be stale

## Acceptance Criteria
- [ ] pact_status runs git pull before reading
- [ ] Searches across pending/, active/, and completed/ to find the request by ID
- [ ] Returns the current status (pending, active, completed) based on directory location
- [ ] If completed, includes the full response from responses/{request_id}.json
- [ ] Returns a clear error if request_id is not found in any directory
- [ ] Falls back to local state with staleness warning when git pull fails
- [ ] Works from any session, not tied to the session that created the request

## Technical Notes
- pact_status is a read-only operation. It never writes to the repo or creates commits.
- Finding the request requires searching 3 directories. A simple approach: check completed/ first (most likely if checking after a while), then pending/, then active/.
- The agent should be able to look up request IDs by partial match or by context ("my request to Alex about the memory leak") -- but this is an agent-level concern, not an MCP server concern. The tool accepts an exact request_id.
- Consider adding a `pact_status --mine` mode that lists all of the current user's sent requests and their statuses. This is a DESIGN wave decision.
