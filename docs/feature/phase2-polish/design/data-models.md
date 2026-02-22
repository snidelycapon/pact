# Data Models -- PACT Phase 2 Polish

## Schema Changes

### New: AmendmentEntrySchema

```
AmendmentEntrySchema = z.object({
  amended_at: z.string(),                         // ISO 8601 timestamp
  amended_by: z.string(),                         // user_id of amender
  fields: z.record(z.string(), z.unknown()),      // additional context key-values
  note: z.string().optional(),                     // human-readable reason
})
```

### Modified: RequestEnvelopeSchema

Added fields (all optional for backward compat):

| Field | Type | Default | Set By |
|-------|------|---------|--------|
| `amendments` | `z.array(AmendmentEntrySchema).optional()` | absent | pact_amend (append) |
| `cancel_reason` | `z.string().optional()` | absent | pact_cancel |

`thread_id` remains `z.string().optional()` in the schema for backward compatibility with pre-Phase-2 envelopes. After US-010, all NEW requests will always have `thread_id` set, but the schema does not enforce it to avoid breaking existing data.

### Unchanged: ResponseEnvelopeSchema

No changes. Responses are not amended or cancelled.

### Unchanged: TeamConfigSchema

No changes. No new team configuration needed.

---

## Tool Input/Output Schemas

### pact_request (Modified -- US-010)

**Input**: Unchanged (thread_id already optional).

**Output change**:
```
Before: { request_id: string, status: string, message: string }
After:  { request_id: string, thread_id: string, status: string, message: string }
```

**Envelope change**: `thread_id` is now always present in the written JSON:
```
Before: ...(params.thread_id ? { thread_id: params.thread_id } : {})
After:  thread_id: params.thread_id ?? requestId
```

### pact_thread (New -- US-009)

**Input**:
```
{ thread_id: z.string() }
```

**Output**:
```
{
  thread_id: string,
  summary: {
    participants: string[],
    round_count: number,
    latest_status: string,
    request_type: string,
  },
  entries: Array<{
    request: RequestEnvelope,
    response?: ResponseEnvelope,
  }>,
  warning?: string,
}
```

### pact_cancel (New -- US-013)

**Input**:
```
{
  request_id: z.string(),
  reason: z.string().optional(),
}
```

**Output**:
```
{
  status: "cancelled",
  request_id: string,
  message: string,
}
```

**Side effects on envelope**:
- `status` field set to `"cancelled"`
- `cancel_reason` field set if `reason` param provided
- File moved from `requests/pending/` to `requests/cancelled/`

### pact_amend (New -- US-014)

**Input**:
```
{
  request_id: z.string(),
  fields: z.record(z.string(), z.any()),
  note: z.string().optional(),
}
```

**Output**:
```
{
  status: "amended",
  request_id: string,
  amendment_count: number,
  message: string,
}
```

**Side effects on envelope**:
- `amendments` array created (if absent) or extended with new entry
- File rewritten in-place at `requests/pending/{request_id}.json`
- Original `context_bundle` untouched

### pact_inbox (Modified -- US-011, US-012, US-014)

**Input**: Unchanged (no parameters).

**Output change -- InboxEntry** (standalone request):
```
{
  request_id: string,
  short_id: string,
  thread_id?: string,
  request_type: string,
  sender: string,
  created_at: string,
  summary: string,
  pact_path: string,
  attachment_count: number,
  attachments?: Array<{ filename: string, description: string }>,   // NEW (US-012)
  amendment_count: number,                                           // NEW (US-014)
}
```

**Output change -- InboxThreadGroup** (2+ pending in same thread):
```
{
  is_thread_group: true,           // discriminator
  thread_id: string,
  request_type: string,
  sender: string,                  // from latest round
  round_count: number,
  latest_request_id: string,
  latest_short_id: string,
  latest_summary: string,
  created_at: string,              // latest round's created_at
  request_ids: string[],
  pact_path: string,
  attachment_count: number,        // sum
  amendment_count: number,         // sum
}
```

**InboxResult**:
```
{
  requests: Array<InboxEntry | InboxThreadGroup>,
  warning?: string,
}
```

### pact_respond (Modified -- US-015)

**Input**: Unchanged.

**Output**: Unchanged.

**Side effect change**: Before moving file to `completed/`, read the envelope, set `status: "completed"`, write the updated envelope back, then proceed with git mv.

### pact_status (Modified -- US-013, US-012)

**Input**: Unchanged.

**Output change**:
```
{
  status: "pending" | "active" | "completed" | "cancelled",   // "cancelled" added
  request: unknown,
  response?: unknown,
  attachment_paths?: Array<{                                    // NEW (US-012)
    filename: string,
    description: string,
    path: string,                                               // absolute path
  }>,
  warning?: string,
}
```

---

## Example Envelopes

### Request Envelope After US-010 (Auto thread_id)

```json
{
  "request_id": "req-20260222-100000-cory-a1b2",
  "thread_id": "req-20260222-100000-cory-a1b2",
  "request_type": "sanity-check",
  "sender": { "user_id": "cory", "display_name": "Cory" },
  "recipient": { "user_id": "dan", "display_name": "Dan" },
  "status": "pending",
  "created_at": "2026-02-22T10:00:00.000Z",
  "deadline": null,
  "context_bundle": {
    "customer": "Acme Corp",
    "question": "Does this match the session service pattern?"
  },
  "expected_response": { "type": "text" }
}
```

### Request Envelope After Amendment (US-014)

```json
{
  "request_id": "req-20260222-100000-cory-a1b2",
  "thread_id": "req-20260222-100000-cory-a1b2",
  "request_type": "sanity-check",
  "sender": { "user_id": "cory", "display_name": "Cory" },
  "recipient": { "user_id": "dan", "display_name": "Dan" },
  "status": "pending",
  "created_at": "2026-02-22T10:00:00.000Z",
  "deadline": null,
  "context_bundle": {
    "customer": "Acme Corp",
    "question": "Does this match the session service pattern?"
  },
  "expected_response": { "type": "text" },
  "amendments": [
    {
      "amended_at": "2026-02-22T10:15:00.000Z",
      "amended_by": "cory",
      "fields": { "zendesk_ticket": "ZD-4521" },
      "note": "Added missing ticket reference"
    }
  ]
}
```

### Request Envelope After Cancellation (US-013)

```json
{
  "request_id": "req-20260222-140000-cory-a1b2",
  "thread_id": "req-20260222-140000-cory-a1b2",
  "request_type": "code-review",
  "sender": { "user_id": "cory", "display_name": "Cory" },
  "recipient": { "user_id": "dan", "display_name": "Dan" },
  "status": "cancelled",
  "created_at": "2026-02-22T14:00:00.000Z",
  "deadline": null,
  "context_bundle": { "description": "Review auth refactor" },
  "expected_response": { "type": "text" },
  "cancel_reason": "Sent to wrong person -- should go to Maria"
}
```

### Request Envelope After Completion (US-015)

```json
{
  "request_id": "req-20260222-100000-cory-a1b2",
  "thread_id": "req-20260222-100000-cory-a1b2",
  "request_type": "sanity-check",
  "sender": { "user_id": "cory", "display_name": "Cory" },
  "recipient": { "user_id": "dan", "display_name": "Dan" },
  "status": "completed",
  "created_at": "2026-02-22T10:00:00.000Z",
  "deadline": null,
  "context_bundle": {
    "customer": "Acme Corp",
    "question": "Does this match the session service pattern?"
  },
  "expected_response": { "type": "text" }
}
```
