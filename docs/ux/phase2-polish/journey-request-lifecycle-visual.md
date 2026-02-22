# Journey: Request Lifecycle Operations — Visual Map

## Actors
- **Cory** — Sender who needs to cancel or amend a request
- **Dan** — Recipient (off-screen, affected by lifecycle changes)

## Emotional Arc
```
Cory:  "Oh no" ──> "Can I fix this?" ──> Action ──> Recovered
       (sent to       (needs lifecycle   (cancel     (mistake
        wrong person   operation)          or amend)   corrected)
        or forgot
        context)
             |
        KEY MOMENT:
        Lifecycle recovery without
        manual git operations
```

## Flow — Cancel Path

```
 CORY'S AGENT SESSION                            COORDINATION REPO
 ====================                              ==================

 [1] Cory realizes the request was wrong
     "I sent that code review to the wrong person.
      Cancel my last request."
     |
     v
 [2] Agent calls pact_cancel                ──>  requests/pending/
     (request_id: "req-20260222-...-a1b2")         req-20260222-...-a1b2.json
     |                                              |
     | Validates: sender == current user             | git mv -->
     | Validates: request is in pending/             |
     v                                              v
 [3] Request moved to cancelled/             ──>  requests/cancelled/
     Status field updated to "cancelled"            req-20260222-...-a1b2.json
     Committed: "[pact] cancelled:                  (status: "cancelled")
       req-20260222-...-a1b2"
     |
     | Emotion: Recovered — "Fixed before Dan saw it"
     v
 [4] Dan checks inbox later — request is gone
     (it was moved out of pending/ before Dan pulled)
```

## Flow — Amend Path

```
 CORY'S AGENT SESSION                            COORDINATION REPO
 ====================                              ==================

 [1] Cory realizes he forgot critical context
     "I need to add the Zendesk ticket to that
      request I sent Dan."
     |
     v
 [2] Agent calls pact_amend                 ──>  requests/pending/
     (request_id: "req-20260222-...-a1b2",          req-20260222-...-a1b2.json
      amendment: {zendesk_ticket: "ZD-4521",
                  note: "Added missing ticket ref"})
     |
     | Validates: sender == current user
     | Validates: request is in pending/
     | Does NOT overwrite original context
     v
 [3] Amendment appended to request           ──>  requests/pending/
     The JSON now has an amendments array:          req-20260222-...-a1b2.json
     {                                              (original context preserved,
       ...original fields...,                        amendments array added)
       "amendments": [{
         "amended_at": "2026-02-22T15:30:00Z",
         "amended_by": "cory",
         "fields": {
           "zendesk_ticket": "ZD-4521"
         },
         "note": "Added missing ticket ref"
       }]
     }
     Committed: "[pact] amended:
       req-20260222-...-a1b2"
     |
     | Emotion: Recovered — "Context is complete now"
     v
 [4] Dan sees the request with amendments
     pact_inbox / pact_status shows both
     original context and amendments
```

## Flow — Status Consistency

```
 LIFECYCLE TRANSITIONS AND STATUS FIELD

 pact_request creates:     status: "pending"     in requests/pending/
 pact_respond completes:   status: "completed"   in requests/completed/
 pact_cancel cancels:      status: "cancelled"   in requests/cancelled/

 The status field in JSON ALWAYS matches the directory location.
 Previously, pact_respond did not update the status field —
 the request moved to completed/ but the JSON still said "pending".
```

## Step Detail

| # | Action | Tool | Gate | Emotion |
|---|--------|------|------|---------|
| Cancel-1 | Realize mistake | Natural language | - | "Oh no" |
| Cancel-2 | Call pact_cancel | pact_cancel | sender == userId, status == pending | Hopeful |
| Cancel-3 | Request moved to cancelled/ | git mv + commit | Atomic: mv + status update + commit | Recovered |
| Amend-1 | Realize missing context | Natural language | - | "I forgot something" |
| Amend-2 | Call pact_amend | pact_amend | sender == userId, status == pending | Hopeful |
| Amend-3 | Amendment appended | JSON update + commit | Append-only, original preserved | Recovered |

## Key Design Decisions

### Sender-Only Operations
Only the original sender can cancel or amend. The recipient cannot cancel someone else's request. This is enforced by comparing the request's sender.user_id with the current PACT_USER.

### Pending-Only Gate
Cancel and amend only work on requests in pending/. Once a request is completed or cancelled, it is immutable. This prevents race conditions where Cory cancels while Dan is responding.

### Append-Only Amendments
pact_amend does NOT overwrite the original context_bundle. It appends to an amendments array. This preserves the audit trail -- you can always see what the original request said and what was changed later.

### Status Field Consistency
Every lifecycle transition updates the status field in the JSON to match the directory. This is a fix to existing behavior where pact_respond moves to completed/ but leaves status as "pending" in the JSON.

### Cancelled Directory
A new requests/cancelled/ directory is added to the repo structure. Cancelled requests are preserved (not deleted) for audit trail purposes.
