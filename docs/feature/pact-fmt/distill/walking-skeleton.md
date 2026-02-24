# Walking Skeleton: pact-y30

**Date**: 2026-02-24
**Agent**: Quinn (nw-acceptance-designer)
**Epic**: pact-y30

---

## Walking Skeleton Identification

Three walking skeletons prove the core pact-y30 value proposition E2E:

### WS-1: Group Request Round-Trip (PRIMARY)

**User goal**: "Alice sends a request to multiple team members, they respond, she sees all responses."

**Why this is the skeleton**: This is the most important pact-y30 capability — group addressing with per-respondent responses. It exercises the full lifecycle through all modified components: schema (recipients[]), send (multi-recipient), inbox (multi-recipient filter), respond (per-respondent directory), and status (directory response read).

**Observable value**: A user can coordinate with multiple people in a single request instead of sending N individual requests.

**Components traversed**:
```
MCP Tool → pact_do(send) → schemas.ts [recipients[]] → pact-request.ts → git
MCP Tool → pact_do(inbox) → pact-inbox.ts [recipients.some()] → git
MCP Tool → pact_do(respond) → pact-respond.ts [per-respondent dir] → git
MCP Tool → pact_do(check_status) → pact-status.ts [dir response read] → git
```

### WS-2: Group Inbox Enrichment

**User goal**: "When I check my inbox, group requests show me how many people were asked and what group they came from."

**Why this is the skeleton**: Without enrichment, group requests are indistinguishable from 1-to-1 requests in the inbox. This skeleton proves the inbox presentation layer works.

**Observable value**: A user can see context about group coordination without opening each request.

### WS-3: Single Recipient Backward Compatibility

**User goal**: "Existing 1-to-1 requests still work when using the new recipients[] array with a single entry."

**Why this is the skeleton**: Proves the migration doesn't break the most common use case — sending to one person.

**Observable value**: Existing workflows continue unchanged.

---

## Implementation Strategy

All walking skeletons are in `y30-group-walking-skeleton.test.ts`, marked with `describe.skip`.

**First skeleton to enable**: WS-3 (single recipient) — smallest change, proves schema migration works.

**Second skeleton**: WS-2 (inbox enrichment) — validates inbox reads the new format.

**Third skeleton**: WS-1 (full round-trip) — validates the complete lifecycle.

This ordering follows the PR sequence from the branching strategy:
1. `pact-y30/schema/add-group-fields` → enables WS-3
2. `pact-y30/send/group-request` + `pact-y30/respond/per-respondent` → enables WS-1
3. `pact-y30/inbox/group-enrichment` → enables WS-2

---

## Litmus Test

Each walking skeleton passes the user-centric litmus test:

| Question | WS-1 | WS-2 | WS-3 |
|----------|-------|-------|-------|
| Can a user accomplish their goal? | Send to group, get responses | See group context in inbox | Send to one person, same as before |
| Is the outcome observable? | Responses from all recipients | Enriched inbox entries | Completed request with response |
| Could you demo this to a stakeholder? | Yes — show group request lifecycle | Yes — show enriched inbox | Yes — show unchanged 1-to-1 flow |
| Does it test through driving ports? | Yes — pact_do(send, inbox, respond, check_status) | Yes — pact_do(send, inbox) | Yes — pact_do(send, inbox, respond) |
