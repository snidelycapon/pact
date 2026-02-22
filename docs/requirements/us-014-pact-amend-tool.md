# US-014: Amend a Pending Request (pact_amend)

## Problem (The Pain)
Cory sent a sanity-check request to Dan about the Acme Corp memory leak but forgot to include the Zendesk ticket number (ZD-4521). Dan will need that ticket to cross-reference the customer history. Cory could cancel and resend, but that loses the original timestamp and feels heavy. He just wants to add a small piece of context to the existing request without overwriting anything.

## Who (The User)
- Cory, a developer who realized he left out important context after sending a request
- Wants to supplement the request, not replace it
- Should not need to cancel and resend for small additions

## Solution (What We Build)
A new MCP tool `pact_amend` that appends additional context to a pending request. The amendment is stored in an `amendments` array on the request envelope, preserving the original context_bundle. Only the original sender can amend.

## Domain Examples

### Example 1: Add Missing Ticket Reference
Cory sent a sanity-check to Dan but forgot the Zendesk ticket. He says "Add ZD-4521 to that request." The agent calls pact_amend with fields `{zendesk_ticket: "ZD-4521"}` and note "Added missing ticket reference." The request JSON now has the original context_bundle plus an amendments array with one entry. Dan sees both the original and the amendment.

### Example 2: Multiple Amendments
Cory sends a code-review request and then remembers two things: he forgot to mention the related PR and he forgot to flag a specific area of concern. He amends twice: first adding `{related_pr: "platform-auth#42"}`, then adding `{areas_of_concern: ["async error handling in refresh.ts"]}`. The amendments array has 2 entries in chronological order, each with its own timestamp and note.

### Example 3: Cannot Amend a Completed Request
Dan already responded to Cory's request. Cory tries to amend with additional context. pact_amend returns an error: "Request is already completed and cannot be amended." The completed request and response are preserved.

## UAT Scenarios (BDD)

### Scenario: Sender amends a pending request
Given Cory sent request "req-20260222-140000-cory-a1b2" to Dan
And the request is in requests/pending/
When Cory calls pact_amend with:
  | field          | value                         |
  | request_id     | req-20260222-140000-cory-a1b2 |
  | fields         | {"zendesk_ticket": "ZD-4521"} |
  | note           | Added missing ticket reference |
Then the request JSON contains an amendments array with 1 entry
And the entry has amended_at (ISO timestamp), amended_by "cory", fields, and note
And the original context_bundle is unchanged
And the commit message is "[pact] amended: req-20260222-140000-cory-a1b2"
And the change is pushed to the remote

### Scenario: Multiple amendments append in order
Given Cory sent request "req-20260222-140000-cory-a1b2" to Dan
And Cory already amended once (amendment 1)
When Cory amends again with fields {"related_pr": "platform-auth#42"} and note "Added PR link"
Then the amendments array has 2 entries
And amendment 1 appears before amendment 2 (chronological order)

### Scenario: Non-sender cannot amend
Given Cory sent request "req-20260222-140000-cory-a1b2" to Dan
When Dan calls pact_amend for "req-20260222-140000-cory-a1b2"
Then pact_amend returns an error: "Only the sender can amend a request"
And the request is unchanged

### Scenario: Cannot amend a completed request
Given request "req-20260222-140000-cory-a1b2" has been completed by Dan
When Cory calls pact_amend for that request
Then pact_amend returns an error: "Request is already completed and cannot be amended"

### Scenario: Cannot amend a cancelled request
Given request "req-20260222-140000-cory-a1b2" was cancelled
When Cory calls pact_amend for that request
Then pact_amend returns an error: "Request is already cancelled and cannot be amended"

## Acceptance Criteria
- [ ] pact_amend appends an amendment entry to the request's amendments array
- [ ] Each amendment includes: amended_at, amended_by, fields, note
- [ ] Original context_bundle is never modified
- [ ] Only the original sender can amend
- [ ] Only pending requests can be amended (not completed, not cancelled)
- [ ] Commit message follows convention: "[pact] amended: {request_id}"
- [ ] Changes are pushed to the remote

## Technical Notes
- Create src/tools/pact-amend.ts. The handler: git pull, find request in pending/, verify sender, read existing JSON, append to amendments array, write JSON, git add + commit + push.
- Tool parameters: `request_id: z.string()`, `fields: z.record(z.string(), z.any())`, `note: z.string().optional()`.
- The amendments array is new to the envelope schema. It is not in the Zod schema (RequestEnvelopeSchema). Since context_bundle and the envelope are already flexible, amendments can be an ad-hoc field. Alternatively, add it to the schema as optional: `amendments: z.array(AmendmentSchema).optional()`.
- Register the tool in mcp-server.ts.
- The amendment does NOT merge fields into context_bundle. It is a separate array. The receiver sees both the original context and the amendments. This preserves the audit trail.

## Dependencies
- None (modifies pending requests, which already exist)
- Should be implemented alongside US-013 (pact_cancel) as they share the sender-validation and pending-only gate patterns
