# US-003a: Short ID, Thread ID, and Attachment Count in Inbox (Protocol Extension)

**Extends**: US-003 (Check GARP Inbox)

## Problem (The Pain)
Alex checks her GARP inbox and sees a list of pending requests. The request IDs are long and unwieldy (e.g., "req-20260221-143022-cory-a1b2") — hard for humans to reference in conversation. When requests are part of a multi-round thread, there's no way to see which ones are related without opening each envelope. And when requests include file attachments, Alex can't tell from the inbox listing whether files are attached or how many.

## Who (The User)
- Alex, a tech support engineer triaging her inbox
- Needs short, memorable identifiers for quick reference
- Needs to see thread context to understand conversation flow
- Needs to know if attachments are included for triage prioritization

## Solution (What We Build)
Extend `garp_inbox` to include three new fields in each inbox entry:
1. **short_id** — the last two segments of the request_id (e.g., "cory-a1b2"), derived at read time for human-friendly display
2. **thread_id** — the thread_id from the request envelope, when present, so the agent can identify related requests
3. **attachment_count** — the number of attachments on the request (0 when none)

## Domain Examples

### Example 1: Short ID for Quick Reference
Alex sees her inbox: `[cory-a1b2] sanity-check from Cory — "Does this match the session service pattern?"`. She tells her agent "Handle cory-a1b2" instead of reciting the full request ID. The short_id is derived from request_id "req-20260221-143022-cory-a1b2" by taking the last two hyphen-separated segments.

### Example 2: Thread ID Links Related Requests
Alex sees two inbox entries both showing thread_id "req-20260221-100000-cory-a1b2". She knows these are rounds in the same conversation and can handle them together. Requests without a thread_id show no thread_id field.

### Example 3: Attachment Count for Triage
Alex sees an inbox entry with "2 attachments". She knows this request has supporting files and may take more time to review than a simple question with 0 attachments.

## UAT Scenarios (BDD)

### Scenario: Inbox entry includes short_id derived from request_id
Given a pending request "req-20260221-140000-alice-a1b2" addressed to Bob
When Bob calls garp_inbox
Then the inbox entry includes short_id "alice-a1b2"

### Scenario: Inbox entry includes thread_id when request has one
Given a pending request addressed to Bob with thread_id "req-20260221-100000-cory-x1y2"
When Bob calls garp_inbox
Then the inbox entry includes thread_id "req-20260221-100000-cory-x1y2"

### Scenario: Inbox entry omits thread_id when request has none
Given a pending request addressed to Bob with no thread_id in the envelope
When Bob calls garp_inbox
Then the inbox entry does not have a thread_id property

### Scenario: Inbox entry includes attachment_count
Given a pending request addressed to Bob with 2 attachments in the envelope
When Bob calls garp_inbox
Then the inbox entry includes attachment_count 2

### Scenario: Inbox entry shows attachment_count 0 when no attachments
Given a pending request addressed to Bob with no attachments
When Bob calls garp_inbox
Then the inbox entry includes attachment_count 0

## Acceptance Criteria
- [ ] Each inbox entry includes a short_id field derived from the last 2 segments of request_id
- [ ] Each inbox entry includes thread_id when the request envelope has one
- [ ] thread_id is omitted from the inbox entry when the request envelope has none
- [ ] Each inbox entry includes attachment_count (integer, 0 when no attachments)
- [ ] Existing inbox behavior (filtering, sorting, summary, skill_path) is unchanged
- [ ] short_id derivation handles the standard request_id format: req-{date}-{time}-{userId}-{hex}

## Technical Notes
- short_id extraction: `const parts = envelope.request_id.split("-"); const shortId = parts.slice(-2).join("-");`
- thread_id is conditionally spread: `...(envelope.thread_id ? { thread_id: envelope.thread_id } : {})`
- attachment_count: `envelope.attachments?.length ?? 0`
- The `InboxEntry` interface already includes all three fields as of commit cbf0b42.

## Dependencies
- Depends on US-002a (thread_id and attachments must exist in request envelopes)
- US-011 will further enhance inbox with thread grouping
- US-012 will add attachment filenames/descriptions (not just count)
