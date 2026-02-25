# Observability Design: pact-y30 (Post-Apathy Revision)

**Feature**: pact-y30 — Flat-file format, catalog metadata, default pacts, group addressing
**Architect**: Apex (nw-platform-architect)
**Date**: 2026-02-24
**Supersedes**: pact-q6y observability-design (pre-apathy, 2026-02-23)

---

## Existing Observability

PACT uses structured JSON logging to stderr. The logger (`src/logger.ts`) writes one JSON object per line:

```typescript
log(level: LogLevel, msg: string, fields?: Record<string, unknown>): void
```

Output format:
```json
{"ts":"2026-02-24T10:00:00.000Z","level":"info","msg":"tool invocation complete","tool":"pact_do","action":"send","duration_ms":312}
```

Current log points (from `src/`):
- **mcp-server.ts**: Tool invocation start/complete/failed (tool name, action, duration_ms)
- **git-adapter.ts**: Git operations (pull, push, push retry) with duration_ms
- **pact-discover.ts**: Warnings for missing pacts dir, failed team member reads
- **pact-inbox.ts**: Warnings for malformed envelopes
- **pact-status.ts**: Warnings for malformed request/response envelopes
- **pact-thread.ts**: Warnings for malformed envelopes in thread scan

**Cost**: $0. stderr only. No external services.

---

## New Log Events for pact-y30

Each new log point follows the existing pattern: `log(level, msg, fields)`.

### 1. Flat-File Pact Scan (pact-loader.ts)

```typescript
// After scanning pact store
log("info", "pact store loaded", {
  store_root,                      // e.g., "./pact-store"
  pacts_found: count,              // total .md files found
  inheritance_resolved: inheritCount,  // pacts with extends
  scan_ms: elapsed,
});

// When a pact extends a missing parent
log("warn", "pact extends missing parent", {
  pact: childName,
  extends: parentName,
  store_root,
});

// When circular or multi-level inheritance is detected
log("warn", "invalid inheritance chain", {
  pact: name,
  extends: parentName,
  reason,                          // "circular" | "multi-level"
});
```

**Why**: The flat-file loader is new code with recursive glob and inheritance. Logging scan results and resolution errors enables diagnosing missing or misconfigured pacts.

### 2. Group Send (pact-request.ts)

```typescript
// After successful group request creation
log("info", "request sent", {
  action: "send",
  request_id,
  recipients_count,                // 1 for single, >1 for group
  group_ref,                       // e.g., "@backend-team" (omitted if null)
});
```

**Why**: Distinguish group sends from 1-to-1 sends. `recipients_count > 1` marks group operations.

### 3. Per-Respondent Response (pact-respond.ts)

```typescript
// Response written to per-respondent directory
log("info", "response recorded", {
  action: "respond",
  request_id,
  responder: userId,
  storage: "per-respondent",       // vs "legacy" for old single-file format
  group_ref,
});
```

**Why**: Log the storage format used. During migration period, this distinguishes new per-respondent writes from legacy single-file reads.

### 4. Inbox Group Entries (pact-inbox.ts)

```typescript
// When inbox includes group requests
log("debug", "inbox scan complete", {
  action: "inbox",
  user_id: userId,
  total_entries: totalCount,
  group_entries: groupCount,       // entries where recipients_count > 1
});
```

**Why**: Debug-level. Helps verify inbox filtering is correctly matching the user against `recipients[]`.

### 5. Inheritance Resolution (pact-loader.ts)

```typescript
// Successful inheritance merge
log("debug", "inheritance resolved", {
  child: childName,
  parent: parentName,
  merged_sections: ["defaults", "context_bundle"],  // which sections were inherited
});
```

**Why**: Debug-level. Helps diagnose unexpected catalog entries when inheritance produces surprising results.

### 6. Compressed Catalog Generation (pact-discover.ts)

```typescript
// After generating compressed catalog
log("debug", "catalog generated", {
  total_pacts: count,
  scope_filter: scope || "none",   // if filtered by scope
  format: "pipe-delimited",
  estimated_tokens: tokenEstimate,
});
```

**Why**: Debug-level. Validates token efficiency assumptions.

---

## Log Field Reference

### New Fields (pact-y30)

| Field | Type | Present On | Purpose |
|-------|------|-----------|---------|
| `store_root` | string | pact store scan | Pact store directory path |
| `pacts_found` | number | pact store scan | Count of .md files found |
| `inheritance_resolved` | number | pact store scan | Count of pacts with extends |
| `scan_ms` | number | pact store scan | Scan duration |
| `group_ref` | string | send, respond | Group identifier (e.g., "@backend-team") |
| `recipients_count` | number | send | How many recipients in the request |
| `storage` | string | respond | "per-respondent" or "legacy" |
| `group_entries` | number | inbox | Inbox entries with >1 recipient |

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

## Error Classification (Post-Apathy)

### Errors That Exist

| Error | Detection | Severity | Notes |
|-------|-----------|----------|-------|
| **Missing parent pact** | `msg == "pact extends missing parent"` warn | warn | Pact author error. Catalog shows child without inherited fields. |
| **Invalid inheritance** | `msg == "invalid inheritance chain"` warn | warn | Circular or multi-level. Pact loads without inheritance. |
| **Malformed envelope** | Existing warn logs in inbox/status/thread | warn | JSON parse failure on request or response files. |
| **Git push conflict** | Existing warn in git-adapter | warn | Retry handles it. Only notable if retries exhaust. |
| **User not in recipients** | Respond handler rejects | error | User tried to respond to a request they're not on. |
| **Pact store empty** | `pacts_found == 0` in scan log | warn | Store root exists but contains no .md files. |

### Errors That No Longer Exist (Apathy Audit)

| Removed Error | Why |
|---------------|-----|
| Claim race condition | No claim action |
| Claim spoofing | No claim action |
| Stale claim | No claim action |
| Response completion failure | No completion logic; first response completes |
| Partial response timeout | No response counting |
| Visibility filter mismatch | No visibility filtering |
| Defaults merge conflict | No defaults-merge function |

---

## Diagnostic Patterns

### Pattern 1: "Why can't I find this pact in the catalog?"

```bash
# Check if the pact file was found during scan
PACT_LOG_LEVEL=debug node dist/index.js 2>debug.log
jq 'select(.msg == "pact store loaded")' debug.log
# Check pacts_found count

# If using inheritance, check if parent exists
jq 'select(.msg == "pact extends missing parent")' debug.log
```

### Pattern 2: "Group request not showing in my inbox"

```bash
# Check if user is in recipients
jq '.recipients[].user_id' requests/pending/req-*.json | grep "username"

# Check inbox scan results
PACT_LOG_LEVEL=debug node dist/index.js 2>debug.log
jq 'select(.msg == "inbox scan complete")' debug.log
```

### Pattern 3: "Where are the responses?"

```bash
# Check response directory
ls responses/req-20260224-*/

# Check if per-respondent or legacy format
jq 'select(.msg == "response recorded")' /tmp/pact-stderr.log
# Look at storage field: "per-respondent" vs "legacy"
```

### Pattern 4: "Pact catalog shows wrong values"

```bash
# Check inheritance resolution
PACT_LOG_LEVEL=debug node dist/index.js 2>debug.log
jq 'select(.msg == "inheritance resolved")' debug.log
# Shows which sections were inherited from parent
```

---

## Log Correlation

### Request Lifecycle (Group)

A group request lifecycle produces this log sequence:

```
1. {"level":"info", "msg":"tool invocation start", "tool":"pact_do", "action":"send"}
2. {"level":"info", "msg":"request sent", "action":"send", "request_id":"req-...", "group_ref":"@backend-team", "recipients_count":4}
3. {"level":"info", "msg":"tool invocation complete", "tool":"pact_do", "action":"send", "duration_ms":312}
...
4. {"level":"info", "msg":"response recorded", "action":"respond", "request_id":"req-...", "responder":"kenji", "storage":"per-respondent"}
```

**Correlation key**: `request_id`. All events for a single request share the same `request_id`.

### Filtering by Group

```bash
# All log events for a specific group
jq 'select(.group_ref == "@backend-team")' /tmp/pact-stderr.log

# All respond events
jq 'select(.action == "respond")' /tmp/pact-stderr.log
```

### Cross-User Correlation

Each user runs their own PACT process, so logs are local. To correlate across users:

1. **Git history** is the shared audit trail (all users push to same remote)
2. **Response directory** contains all respondent files with `responded_at` timestamps
3. **Envelope JSON** contains timestamps from the sender

There is no centralized log aggregation, by design.

---

## What We Do Not Add

| Omitted | Rationale |
|---------|-----------|
| External log aggregation | Local dev tool. Logs go to stderr, readable by MCP host or redirected to file |
| Metrics service (Prometheus, etc.) | No HTTP server to expose /metrics |
| Distributed tracing | Single process, no distributed system |
| Log sampling | Volume is trivially low (~100 users, <100 log lines/day each) |
| Structured error codes | Error types are in `msg` field. Codes add complexity without value at this scale |
| Claim/completion/visibility logging | Cut by apathy audit. These are agent concerns, not observable protocol events |
