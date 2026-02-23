# Observability Design: pact-fmt

**Feature**: pact-fmt (Group Envelope Primitives)
**Architect**: Apex (nw-platform-architect)
**Date**: 2026-02-23

---

## Existing Observability

PACT uses structured JSON logging to stderr. The logger (`src/logger.ts`) writes one JSON object per line with fields: `ts`, `level`, `msg`, plus arbitrary fields.

Current log points (from `src/`):
- **mcp-server.ts**: Tool invocation start/complete/failed (tool name, action, duration_ms)
- **git-adapter.ts**: Git operations (pull, push, push retry) with duration_ms
- **pact-discover.ts**: Warnings for missing pacts dir, failed team member reads
- **pact-inbox.ts**: Warnings for malformed envelopes
- **pact-status.ts**: Warnings for malformed request/response envelopes
- **pact-thread.ts**: Warnings for malformed envelopes in thread scan

**Cost**: $0. stderr only. No external services.

---

## Group Operation Log Events

### New Log Points for pact-fmt

Each new log point follows the existing pattern: `log(level, msg, fields)`.

#### 1. Group Send (pact-request.ts)

```typescript
// After successful group request creation
log("info", "group request sent", {
  action: "send",
  request_id,
  group_ref,                    // e.g., "@backend-team"
  recipients_count,             // e.g., 4
  response_mode,                // from defaults_applied
  visibility,                   // from defaults_applied
  claimable,                    // from defaults_applied
});
```

**Why**: Distinguish group sends from 1-to-1 sends. `recipients_count > 1` marks group operations. `response_mode` and `visibility` are critical for debugging completion and access issues.

#### 2. Claim Attempt (pact-claim.ts)

```typescript
// Successful claim
log("info", "request claimed", {
  action: "claim",
  request_id,
  claimed_by: userId,
  group_ref,
});

// Claim rejected: already claimed
log("info", "claim rejected: already claimed", {
  action: "claim",
  request_id,
  claimed_by: existingClaimer,    // who already claimed it
  attempted_by: userId,
});

// Claim rejected: not claimable
log("warn", "claim rejected: not claimable", {
  action: "claim",
  request_id,
  attempted_by: userId,
});

// Claim rejected: not a recipient
log("warn", "claim rejected: not a recipient", {
  action: "claim",
  request_id,
  attempted_by: userId,
});
```

**Why**: Claim is the highest-concurrency operation in pact-fmt. Logging both success and rejection reasons enables debugging race conditions (ERR1) without inspecting git history.

#### 3. Response with Completion Tracking (pact-respond.ts)

```typescript
// Response recorded for group request
log("info", "group response recorded", {
  action: "respond",
  request_id,
  responder: userId,
  response_mode,
  responses_received: count,       // current count after this response
  responses_needed: recipientsLength, // total recipients
  completed: isComplete,           // did this response trigger completion?
  group_ref,
});
```

**Why**: `responses_received` vs `responses_needed` gives at-a-glance progress for `all` mode requests. `completed` flag marks the transition event. Essential for debugging ERR3 (partial responses).

#### 4. Visibility Filtering (pact-status.ts, pact-thread.ts)

```typescript
// When visibility filtering removes responses
log("debug", "visibility filter applied", {
  action,                          // "check_status" or "view_thread"
  request_id,
  visibility,                     // "private" or "shared"
  requesting_user: userId,
  total_responses: allCount,
  visible_responses: filteredCount,
});
```

**Why**: Debug-level only. Helps diagnose ERR4 (private response visibility). Not logged in production by default (`PACT_LOG_LEVEL=info` skips debug).

#### 5. Inbox Group Enrichment (pact-inbox.ts)

```typescript
// When inbox includes group requests
log("debug", "inbox group entries", {
  action: "inbox",
  user_id: userId,
  total_entries: totalCount,
  group_entries: groupCount,
  claimed_entries: claimedCount,
});
```

**Why**: Debug-level. Helps verify inbox filtering logic is working correctly for group requests.

---

## Log Field Reference

### New Fields (pact-fmt)

| Field | Type | Present On | Purpose |
|-------|------|-----------|---------|
| `group_ref` | string | send, claim, respond | Group identifier (e.g., "@backend-team") |
| `recipients_count` | number | send | How many recipients in the group |
| `response_mode` | string | send, respond | "any", "all", or "none_required" |
| `visibility` | string | send, status/thread filtering | "shared" or "private" |
| `claimable` | boolean | send | Whether request accepts claims |
| `claimed_by` | string | claim (success and rejection) | user_id of claimer |
| `attempted_by` | string | claim (rejection) | user_id of rejected claimer |
| `responses_received` | number | respond | Running count of responses |
| `responses_needed` | number | respond | Total recipients (for all mode) |
| `completed` | boolean | respond | Whether this response triggered completion |
| `visible_responses` | number | status/thread | Count after visibility filter |
| `total_responses` | number | status/thread | Count before visibility filter |

### Existing Fields (Unchanged)

| Field | Type | Present On | Purpose |
|-------|------|-----------|---------|
| `ts` | ISO 8601 | all | Timestamp |
| `level` | string | all | debug, info, warn, error |
| `msg` | string | all | Human-readable message |
| `tool` | string | mcp-server | "pact_discover" or "pact_do" |
| `action` | string | mcp-server, handlers | Action name |
| `duration_ms` | number | mcp-server, git ops | Elapsed time |
| `operation` | string | git-adapter | Git operation name |

---

## Performance Metrics

### What to Measure (via Existing Log Fields)

No new infrastructure. These metrics are derivable from structured logs using standard text processing tools (jq, grep).

| Metric | How to Derive | Fields |
|--------|--------------|--------|
| **Claim resolution time** | `claimed_at - created_at` from envelope | Available in envelope JSON, not logged (use git for audit) |
| **Response completion rate** | `responses_received / responses_needed` from respond logs | `responses_received`, `responses_needed` |
| **Time to first response** | First respond log `ts` - send log `ts` for same `request_id` | `ts`, `request_id` |
| **Claim race frequency** | Count "claim rejected: already claimed" logs | `msg` field |
| **Group vs 1-to-1 ratio** | Count send logs where `recipients_count > 1` | `recipients_count` |
| **Visibility filter impact** | `total_responses - visible_responses` from debug logs | `total_responses`, `visible_responses` |

### Example: Extract Claim Race Frequency

```bash
# Count claim rejections in the last hour
cat /tmp/pact-stderr.log | \
  jq -r 'select(.msg == "claim rejected: already claimed") | .request_id' | \
  sort | uniq -c | sort -rn
```

### Example: Response Completion Progress

```bash
# Find incomplete all-mode requests
cat /tmp/pact-stderr.log | \
  jq -r 'select(.action == "respond" and .response_mode == "all" and .completed == false) |
    "\(.request_id): \(.responses_received)/\(.responses_needed)"'
```

---

## Error Tracking

### ERR1: Claim Race Condition

**Detection**: `msg == "claim rejected: already claimed"` at info level.
**Context fields**: `request_id`, `claimed_by` (winner), `attempted_by` (loser).
**Expected frequency**: Rare at ~100 users. If frequent, indicates UX issue (multiple agents racing on same inbox).

### ERR2: Stale Claims

**Detection**: Not logged (apathetic design). Sender uses `check_status` to see unclaimed requests.
**Observation**: No log event needed. The absence of a claim log for a claimable request is the signal.

### ERR3: Partial Response Timeout

**Detection**: Respond logs where `completed == false` and `response_mode == "all"`.
**Context fields**: `responses_received`, `responses_needed`, `request_id`.
**No automatic alert**: Sender checks status manually. PACT is apathetic about nudging.

### ERR4: Private Response Access

**Detection**: Debug log "visibility filter applied" where `total_responses > visible_responses`.
**Context fields**: `requesting_user`, `visibility`, `total_responses`, `visible_responses`.
**Expected behavior**: This is normal for private-mode requests. Only notable if a user reports missing responses.

### Git Push Failures

**Detection**: Existing "git push conflict, retrying with pull-rebase" warn log in git-adapter.
**Impact on group ops**: Claim retries are the primary case. The existing retry mechanism handles this.

---

## Log Correlation

### Request Lifecycle (Group)

A complete group request lifecycle produces this log sequence:

```
1. {"level":"info", "msg":"tool invocation start", "tool":"pact_do", "action":"send"}
2. {"level":"info", "msg":"group request sent", "action":"send", "request_id":"req-...", "group_ref":"@backend-team", "recipients_count":4}
3. {"level":"info", "msg":"tool invocation complete", "tool":"pact_do", "action":"send", "duration_ms":312}
...
4. {"level":"info", "msg":"request claimed", "action":"claim", "request_id":"req-...", "claimed_by":"kenji"}
...
5. {"level":"info", "msg":"group response recorded", "action":"respond", "request_id":"req-...", "responder":"kenji", "responses_received":1, "responses_needed":4, "completed":false}
6. {"level":"info", "msg":"group response recorded", "action":"respond", "request_id":"req-...", "responder":"maria", "responses_received":2, "responses_needed":4, "completed":false}
...
7. {"level":"info", "msg":"group response recorded", "action":"respond", "request_id":"req-...", "responder":"priya", "responses_received":4, "responses_needed":4, "completed":true}
```

**Correlation key**: `request_id`. All events for a single request share the same `request_id`.

### Filtering by Group

```bash
# All log events for a specific group
jq 'select(.group_ref == "@backend-team")' /tmp/pact-stderr.log

# All claim events
jq 'select(.action == "claim")' /tmp/pact-stderr.log
```

---

## What We Do Not Add

| Omitted | Rationale |
|---------|-----------|
| External log aggregation | Local dev tool. Logs go to stderr, readable by MCP host or redirected to file |
| Metrics service (Prometheus, etc.) | No HTTP server to expose /metrics. jq on log files is sufficient |
| Distributed tracing | Single process, no distributed system |
| Log sampling | Volume is trivially low (~100 users, each generating <100 log lines/day) |
| Structured error codes in logs | Error types are in `msg` field. Formal codes add complexity without value at this scale |
| Request-scoped correlation IDs | `request_id` already serves this role. No need for a separate trace ID |
