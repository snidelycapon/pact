# US-010: Auto-Assign thread_id on First Request (garp_request modification)

## Problem (The Pain)
Cory is sending the first round of a design-skill request to Dan. The design-skill SKILL.md tells him to use the returned request_id as the thread_id for follow-up rounds, but this is a manual convention that the agent must remember. If the agent forgets to set thread_id on round 2, the conversation becomes unthreaded and garp_thread cannot reconstruct it. The protocol supports thread_id but does not enforce it.

## Who (The User)
- Cory, a developer starting a new multi-round conversation
- Working with agents that follow skill contracts
- Needs threads to "just work" without manual bookkeeping

## Solution (What We Build)
Modify garp_request so that when no thread_id is provided, the server automatically sets thread_id = request_id. Every request is always part of a thread. Single-round requests get a thread of one. Multi-round conversations get their thread anchored automatically on the first round.

## Domain Examples

### Example 1: First Request Gets Auto Thread ID
Cory sends a design-skill request to Dan without specifying a thread_id. The server generates request_id "req-20260222-100000-cory-a1b2" and also sets thread_id to "req-20260222-100000-cory-a1b2". The committed JSON has both fields. When Cory sends round 2, he provides this thread_id explicitly and the conversation is linked.

### Example 2: Follow-Up Request Preserves Provided Thread ID
Cory sends round 2 of the design-skill conversation, providing thread_id "req-20260222-100000-cory-a1b2". The server keeps this thread_id as-is and generates a new unique request_id for the round 2 request. The thread_id is not overwritten.

### Example 3: Single-Round Ask Gets a Thread of One
Cory sends a quick "ask" request to Dan with no thread_id. The server sets thread_id = request_id. The request is technically a thread of one. If Cory later calls garp_thread with that thread_id, he sees the single request. If he never follows up, the thread_id is harmless.

## UAT Scenarios (BDD)

### Scenario: Auto-assign thread_id when not provided
Given Cory calls garp_request with no thread_id
And the generated request_id is "req-20260222-100000-cory-a1b2"
When the request envelope is built
Then thread_id in the envelope is "req-20260222-100000-cory-a1b2"
And the return value includes thread_id for the agent to use in follow-ups

### Scenario: Preserve explicit thread_id
Given Cory calls garp_request with thread_id "req-20260222-100000-cory-a1b2"
When the request envelope is built
Then thread_id in the envelope is "req-20260222-100000-cory-a1b2" (unchanged)
And the request_id is a newly generated unique value

### Scenario: Return value includes thread_id
Given Cory calls garp_request (with or without thread_id)
When the request is created successfully
Then the return value includes request_id, status, message, AND thread_id
And the agent can use the thread_id for follow-up requests

### Scenario: Every request has a thread_id in the JSON
Given 3 requests have been created: 2 with explicit thread_id, 1 without
When someone scans the pending/ directory
Then all 3 request JSON files contain a thread_id field (none are missing it)

## Acceptance Criteria
- [ ] When thread_id is not provided, garp_request sets thread_id = request_id
- [ ] When thread_id is provided, garp_request preserves it as-is
- [ ] The return value of garp_request includes thread_id alongside request_id
- [ ] Every committed request JSON has a thread_id field (never omitted)
- [ ] Existing tests for garp_request continue to pass (backward compatible)

## Technical Notes
- The change is in handleGarpRequest in src/tools/garp-request.ts. Currently the envelope construction uses `...(params.thread_id ? { thread_id: params.thread_id } : {})` which omits thread_id when not provided. Change to: `thread_id: params.thread_id ?? requestId`.
- The thread_id field in RequestEnvelopeSchema is currently `z.string().optional()`. Consider making it required after this change, since every request will now have one. This is a schema migration -- existing requests in repos will not have thread_id. The schema should remain optional for backward compatibility with existing data, but new requests will always have it.
- Update the return type to include thread_id.

## Dependencies
- None (modifies existing tool)
- Should be implemented before or alongside US-009 (garp_thread) and US-011 (thread-aware inbox)
