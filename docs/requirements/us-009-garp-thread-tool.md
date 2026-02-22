# US-009: View Thread History (garp_thread)

## Problem (The Pain)
Cory is a developer engaged in a multi-round design-skill collaboration with Dan about a code-review skill contract. They exchanged 3 rounds over 2 days. Now Cory opens a new session and cannot remember what feedback Dan gave in round 2 or what the current draft looks like. The thread_id exists in the request JSON, but there is no tool to retrieve the conversation. Cory has to manually run garp_status on each request_id he can remember, hoping he has them all.

## Who (The User)
- Cory, a developer in a multi-round async collaboration
- Working across multiple sessions over days
- Needs the full conversation history to continue iterating

## Solution (What We Build)
A new MCP tool `garp_thread` that, given a thread_id, returns all requests and responses in the thread ordered chronologically. Includes a thread summary with participant list, round count, and latest status.

## Domain Examples

### Example 1: Two-Round Design-Skill Thread
Cory and Dan have been designing a code-review skill. Round 1 (propose) was sent Monday, Dan responded with "needs_revision." Round 2 (refine) was sent Tuesday, still pending. Cory calls garp_thread with the thread_id and sees both rounds: round 1 complete with Dan's feedback, round 2 pending. He now knows exactly what Dan asked for and what his latest draft contains.

### Example 2: Single-Round Completed Thread
Cory sent a sanity-check to Dan last week. Dan responded the same day. Cory calls garp_thread to revisit the conversation. The thread shows 1 round, completed, with the original question and Dan's full response including evidence and recommendation.

### Example 3: Thread With No Matching Requests
Cory mistypes the thread_id (uses an old request_id that was never a thread anchor). garp_thread returns an empty result with the message "No requests found for this thread." Cory realizes his mistake and uses garp_inbox or garp_status to find the correct thread_id.

## UAT Scenarios (BDD)

### Scenario: Retrieve multi-round thread history
Given the GARP repo contains these requests in thread "req-20260222-100000-cory-a1b2":
  | request_id                          | status    | created_at           |
  | req-20260222-100000-cory-a1b2       | completed | 2026-02-22T10:00:00Z |
  | req-20260223-090000-cory-c3d4       | pending   | 2026-02-23T09:00:00Z |
And a response exists for "req-20260222-100000-cory-a1b2" from Dan
When Cory calls garp_thread with thread_id "req-20260222-100000-cory-a1b2"
Then the result contains 2 entries in chronological order
And entry 1 includes the request and Dan's response
And entry 2 includes the request with no response
And the summary shows participants ["cory", "dan"], round_count 2

### Scenario: Retrieve single-round completed thread
Given request "req-20260222-100000-cory-a1b2" is completed with a response from Dan
And no other requests share that thread_id
When Cory calls garp_thread with thread_id "req-20260222-100000-cory-a1b2"
Then the result contains 1 entry with request and response
And round_count is 1

### Scenario: Thread not found returns empty
Given no requests exist with thread_id "req-nonexistent"
When Cory calls garp_thread with thread_id "req-nonexistent"
Then the result has 0 entries
And includes a message "No requests found for this thread"

### Scenario: Thread includes cancelled requests
Given thread "req-20260222-100000-cory-a1b2" contains:
  | request_id                    | status    |
  | req-20260222-100000-cory-a1b2 | completed |
  | req-20260223-090000-cory-c3d4 | cancelled |
  | req-20260223-150000-cory-e5f6 | pending   |
When Cory calls garp_thread with the thread_id
Then all 3 entries are returned (including the cancelled one)
And the cancelled entry shows status "cancelled"

### Scenario: Thread pulls latest before scanning
When Cory calls garp_thread with a thread_id
Then the tool runs git pull before scanning directories
And if git pull fails, the tool falls back to local data with a staleness warning

## Acceptance Criteria
- [ ] garp_thread accepts a thread_id parameter and returns all matching requests chronologically
- [ ] Each entry includes the request envelope and response (if exists)
- [ ] Thread summary includes participants, round_count, and latest_status
- [ ] Scans all directories: pending/, completed/, cancelled/
- [ ] Pairs each request with its response from responses/ (if exists)
- [ ] Runs git pull before scanning (with fallback on failure)
- [ ] Returns empty result with message when no requests match the thread_id

## Technical Notes
- garp_thread scans pending/, completed/, and cancelled/ directories. It reads every JSON file in each directory and filters by thread_id. For the MVP scale (dozens of requests), sequential scan is fine. Indexing is a Tier 2 concern.
- Response pairing: for each request found, check if responses/{request_id}.json exists.
- The tool is read-only. It does not modify any files or state.
- Register the tool in mcp-server.ts following the same pattern as garp_status (pull, scan, return).

## Dependencies
- None (thread_id already exists in the schema and is written by garp_request)
- Beneficial to implement alongside US-010 (auto thread_id) so threads are consistently anchored
