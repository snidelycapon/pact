# US-011: Thread-Aware Inbox (garp_inbox modification)

## Problem (The Pain)
Dan checks his GARP inbox and sees 5 pending requests. Three of those are rounds 1, 2, and 3 of the same design-skill thread from Cory. The inbox shows them as 3 separate items, each with a different request_id, making it look like Dan has 3 unrelated tasks. Dan has to mentally group them and figure out which is the latest round. This is the same context-reassembly problem GARP was built to solve.

## Who (The User)
- Dan, a developer checking his inbox for pending work
- Receives both standalone requests and multi-round thread updates
- Needs to triage quickly: what is new, what is a continuation

## Solution (What We Build)
Modify garp_inbox to group pending requests that share a thread_id into a single inbox entry. The grouped entry shows the thread's skill type, round count, latest round's summary, and the original sender. Standalone requests (thread of one, or threads where only one request is pending) display normally.

## Domain Examples

### Example 1: Three-Round Thread Shows as One Inbox Item
Dan has 3 pending requests from Cory, all sharing thread_id "req-20260222-100000-cory-a1b2" (design-skill, rounds 1-3). Instead of seeing 3 items, Dan sees 1 item: "Thread: design-skill (3 rounds) from Cory. Latest: round 3/refine -- Added test coverage section." Dan opens the thread, sees the full history, and responds to the latest round.

### Example 2: Mixed Inbox With Threads and Standalone Requests
Dan has 4 pending requests: 2 from Cory in a design-skill thread, 1 standalone ask from Maria Santos, and 1 standalone code-review from Cory. The inbox shows 3 items: the grouped thread, Maria's ask, and Cory's code-review. Clean triage.

### Example 3: Thread Where Only Latest Round Is Pending
Dan has a thread with 3 rounds, but rounds 1 and 2 are completed (Dan already responded). Only round 3 is pending. The inbox shows 1 item for this thread, indicating "Thread: design-skill (round 3 of 3 pending)." Dan knows this is a continuation, not a new conversation.

## UAT Scenarios (BDD)

### Scenario: Group pending requests by thread_id
Given Dan has these pending requests:
  | request_id  | thread_id  | request_type | round | sender |
  | req-a1b2    | req-a1b2   | design-skill | 1     | Cory   |
  | req-c3d4    | req-a1b2   | design-skill | 2     | Cory   |
  | req-e5f6    | req-e5f6   | ask          | 1     | Maria  |
When Dan calls garp_inbox
Then the result contains 2 items
And item 1 is a thread group for "req-a1b2" with round_count 2
And item 2 is standalone request "req-e5f6" from Maria

### Scenario: Thread group shows latest round's summary
Given Dan has 2 pending requests in thread "req-a1b2":
  | request_id | round | summary                        |
  | req-a1b2   | 1     | "Proposing code-review skill"  |
  | req-c3d4   | 2     | "Added language field"         |
When Dan calls garp_inbox
Then the thread group's summary is "Added language field" (from latest round)
And the thread group's created_at is from the latest round

### Scenario: Standalone request with auto-assigned thread_id displays normally
Given Dan has 1 pending request "req-e5f6" with thread_id "req-e5f6" (auto-assigned, thread of one)
When Dan calls garp_inbox
Then the request displays as a normal standalone item (not labeled as a "thread group")

### Scenario: Inbox preserves backward compatibility for requests without thread_id
Given Dan has 1 pending request "req-old-001" that has no thread_id field (pre-Phase-2 request)
When Dan calls garp_inbox
Then the request displays as a normal standalone item
And no grouping error occurs

### Scenario: Only pending requests are grouped
Given thread "req-a1b2" has 3 rounds: round 1 completed, round 2 completed, round 3 pending
And only round 3 is in pending/ (rounds 1-2 are in completed/)
When Dan calls garp_inbox
Then the inbox shows 1 item for the thread
And the item indicates round 3 is pending

## Acceptance Criteria
- [ ] Pending requests sharing a thread_id are grouped into a single inbox entry
- [ ] Thread group entry shows: thread_id, request_type, sender, round_count, latest summary
- [ ] Standalone requests (unique thread_id or no thread_id) display as normal
- [ ] Thread group summary comes from the most recent round (by created_at)
- [ ] Backward compatible: requests without thread_id are handled gracefully
- [ ] Inbox result still sorted by created_at (thread groups sorted by their latest round)

## Technical Notes
- The grouping logic belongs in handleGarpInbox in src/tools/garp-inbox.ts. After filtering by recipient, group entries by thread_id. If a thread_id has >1 pending request, merge into a group entry. If 1, display as standalone.
- The InboxEntry interface needs a new optional field: `thread_round_count?: number` and possibly `is_thread_group?: boolean` to let the agent distinguish grouped from standalone.
- Consider adding a `thread_request_ids: string[]` field to thread groups so the agent can drill into individual rounds via garp_status.
- Keep the existing InboxEntry fields for backward compatibility. Thread groups add fields; they do not remove existing ones.

## Dependencies
- US-010 (auto thread_id) should be implemented first so that thread_id is consistently present on new requests
- Without US-010, only requests with explicit thread_id will be grouped
