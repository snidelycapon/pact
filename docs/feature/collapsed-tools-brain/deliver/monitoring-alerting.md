# Monitoring and Alerting Design: Collapsed Tools + Declarative Brain

**Feature**: collapsed-tools-brain
**Date**: 2026-02-22
**Author**: Apex (nw-platform-architect)
**Status**: Draft

---

## 1. Context: Local Development Tool

GARP is a **local MCP server** running as a stdio process on developer workstations. It is not a production service, not distributed, and not multi-tenant. Traditional monitoring and alerting strategies (APM, distributed tracing, alerting pipelines) are not applicable.

### Key Constraints

- **No network endpoints** - GARP communicates via stdio, not HTTP
- **No centralized logs** - Each developer's instance logs independently
- **No shared metrics** - No metrics aggregation across developers
- **No on-call rotation** - Developers debug their own local instance
- **No SLAs** - This is a dev tool, not a customer-facing service

### Monitoring Strategy

Use **structured logging to stderr** as the primary observability mechanism. Developers and host applications (Craft Agents) can consume logs for debugging, auditing, and operational visibility.

---

## 2. Structured Logging Design

### Log Format

All log entries are **JSON objects** written to stderr. Each entry includes:

```json
{
  "timestamp": "2026-02-22T10:30:00.000Z",  // ISO 8601 UTC
  "level": "info",                          // debug | info | warn | error
  "message": "Tool invoked",                // Human-readable message
  "component": "garp-do",                   // Component or module name
  "action": "send",                         // Action discriminator (for garp_do)
  "request_id": "req_20260222_103000_abc123", // Request ID (if applicable)
  "duration_ms": 150,                       // Operation duration (if applicable)
  "error": "...",                           // Error message (if level=error)
  "stack": "..."                            // Stack trace (if level=error)
}
```

### Log Levels

| Level | Usage | Examples |
|-------|-------|----------|
| `debug` | Internal state transitions, verbose diagnostics | "Parsed YAML frontmatter", "Dispatching action to handler" |
| `info` | Normal operations, successful actions | "Tool invoked", "Request created", "Git push successful" |
| `warn` | Recoverable issues, degraded functionality | "Git pull failed, using local data", "Validation warning" |
| `error` | Operation failures, unhandled exceptions | "Unknown action", "Skill not found", "Git commit failed" |

### Log Emission Points

| Component | Log Events |
|-----------|------------|
| `mcp-server.ts` | Tool registration, MCP request received, MCP response sent |
| `garp-discover.ts` | Discovery invoked, skills loaded, catalog returned |
| `garp-do.ts` | Action received, dispatcher invoked |
| `action-dispatcher.ts` | Action validated, handler dispatched, unknown action error |
| `skill-loader.ts` | SKILL.md read, YAML parsed, parse error |
| `garp-request.ts` | Request created, validation warnings, git commit success/failure |
| `garp-inbox.ts` | Inbox query, enrichment applied, response returned |
| All handlers | Handler invoked, operation completed, error encountered |

### Example Log Sequence (Send Request)

```jsonl
{"timestamp":"2026-02-22T10:30:00.000Z","level":"info","message":"MCP request received","tool":"garp_do"}
{"timestamp":"2026-02-22T10:30:00.010Z","level":"debug","message":"Action dispatched","action":"send","component":"action-dispatcher"}
{"timestamp":"2026-02-22T10:30:00.020Z","level":"debug","message":"Loading skill metadata","skill":"ask","component":"skill-loader"}
{"timestamp":"2026-02-22T10:30:00.030Z","level":"debug","message":"Parsed YAML frontmatter","skill":"ask","fields":["question","background"],"component":"skill-loader"}
{"timestamp":"2026-02-22T10:30:00.040Z","level":"info","message":"Request created","request_id":"req_20260222_103000_abc123","request_type":"ask","recipient":"dan","component":"garp-request"}
{"timestamp":"2026-02-22T10:30:00.120Z","level":"info","message":"Git commit successful","commit":"a1b2c3d","component":"git-adapter"}
{"timestamp":"2026-02-22T10:30:00.150Z","level":"info","message":"MCP response sent","tool":"garp_do","action":"send","duration_ms":150}
```

---

## 3. Log Consumption

### Host Application (Craft Agents)

The MCP host application captures GARP's stderr and can:

1. Display logs in a debug panel
2. Write logs to a file (e.g., `~/.craft-agents/logs/garp.log`)
3. Filter logs by level or component
4. Search logs by request ID

This is entirely controlled by the host application. GARP has no opinion on log storage.

### Developer Debugging

Developers can run GARP directly and pipe stderr to a file:

```bash
node dist/index.js 2> garp-debug.log
```

Or use a JSON log viewer:

```bash
node dist/index.js 2>&1 | jq -C '.'
```

### Audit Trail

Request IDs in logs provide an audit trail:

- Which tool was invoked
- Which action was dispatched
- Which skill was used
- Which files were written
- Which git commits were created

Logs can be correlated with git history (`git log`) for forensics.

---

## 4. Error Tracking

### Error Logging

All errors are logged at `level: "error"` with:

- **message**: High-level error description
- **error**: Detailed error message (from exception)
- **stack**: Full stack trace (for debugging)
- **request_id**: Request ID (if error occurred during request processing)
- **component**: Component where error originated

### Error Categories

| Error Type | Handling | Log Level |
|------------|----------|-----------|
| Unknown action | Validation error, return to caller | `error` |
| Skill not found | Validation error, return to caller | `error` |
| YAML parse error | Log error, skill unavailable | `error` |
| Git operation failure | Log error, attempt retry or degrade | `error` |
| File I/O failure | Log error, return to caller | `error` |
| Validation warning | Log warning, continue processing | `warn` |
| Missing required field | Log warning, continue processing | `warn` |

### No Crash Reporting Service

GARP does not send error reports to external services (Sentry, Bugsnag, etc.). Errors are logged to stderr only. Developers report bugs manually via GitHub Issues.

---

## 5. Performance Metrics

### Operation Duration Logging

Log entries include `duration_ms` for time-sensitive operations:

```json
{
  "timestamp": "2026-02-22T10:30:00.150Z",
  "level": "info",
  "message": "Git push completed",
  "duration_ms": 850,
  "component": "git-adapter"
}
```

### Metrics of Interest

| Metric | Logged Where | Purpose |
|--------|--------------|---------|
| Tool invocation duration | `mcp-server.ts` | Identify slow operations |
| Git pull/push duration | `git-adapter.ts` | Detect network latency |
| Skill loading duration | `skill-loader.ts` | Detect YAML parsing bottlenecks |
| Inbox query duration | `garp-inbox.ts` | Detect filesystem scan slowness |

### No Metrics Aggregation

GARP does not aggregate metrics. Each log entry is independent. Developers can analyze logs manually to identify performance issues:

```bash
cat garp-debug.log | jq 'select(.duration_ms > 1000)'
```

This identifies operations taking >1 second.

---

## 6. Health Checks

### No Health Endpoint

GARP has no HTTP endpoint, so there is no `/health` or `/ready` endpoint. The MCP host application determines health based on:

1. **Process running**: GARP process is alive (not crashed)
2. **Responding to MCP requests**: GARP responds within timeout (30 seconds default)

If GARP crashes or hangs, the host application detects it and restarts the process.

### Self-Diagnostics

GARP can include diagnostic information in logs:

```json
{
  "timestamp": "2026-02-22T10:30:00.000Z",
  "level": "info",
  "message": "GARP server started",
  "version": "0.2.0",
  "node_version": "v20.10.0",
  "cwd": "/Users/cory/repos/grimmdustries",
  "component": "index"
}
```

This helps verify correct configuration on startup.

---

## 7. Alerting Strategy

### No Automated Alerts

GARP does not send alerts. There is no PagerDuty, no Slack webhooks, no email notifications.

### Manual Monitoring

Developers notice issues when:

1. The MCP host application shows an error
2. A request doesn't complete as expected
3. Logs contain `level: "error"` entries

Developers then inspect logs and git repository state to diagnose.

### Error Visibility in Host Application

The MCP host (Craft Agents) can optionally surface GARP errors in its UI:

- Badge on GARP tool icon when errors occur
- Error notification in chat interface
- Link to view GARP logs in debug panel

This is entirely controlled by the host application.

---

## 8. Audit and Compliance

### Audit Trail via Git

Every GARP operation that modifies state creates a git commit. The git log is a complete audit trail:

```bash
git log --oneline requests/
```

Shows:

- When requests were created
- Who created them (sender user ID in commit message)
- When requests were responded to, cancelled, or amended

### Log Retention

Logs written to stderr are ephemeral unless captured by the host application. If audit compliance requires log retention, the host application must:

1. Capture stderr to a file
2. Rotate logs periodically (e.g., daily)
3. Archive old logs to long-term storage

GARP itself has no log retention policy.

### Sensitive Data in Logs

Logs may contain:

- User IDs (e.g., `sender: "cory"`)
- Request IDs
- Skill names
- File paths

Logs **do not** contain:

- Full request payloads (context_bundle)
- Full response payloads (response_bundle)
- Attachment file contents
- Passwords or API keys (GARP has none)

Log redaction is not required. If sensitive data appears in request payloads (e.g., PII in a `context_bundle.question` field), it is **not logged**.

---

## 9. Debugging Workflows

### Scenario 1: Request Fails to Send

1. Developer checks stderr logs from Craft Agents
2. Search for `request_id` or `level: "error"`
3. Identify error message (e.g., "Skill not found")
4. Fix issue (e.g., add missing skill directory)
5. Retry operation

### Scenario 2: Git Push Hangs

1. Developer notices GARP is unresponsive
2. Check logs for `"Git push started"` without corresponding `"Git push completed"`
3. Kill GARP process
4. Manually run `git push` in the shared repo to diagnose network issue
5. Restart GARP after network issue resolved

### Scenario 3: YAML Parse Error

1. Developer invokes `garp_discover`
2. Logs show `"YAML parse error", "skill": "ask"`
3. Developer opens `skills/ask/SKILL.md`
4. Fix YAML syntax error (e.g., unmatched quote)
5. Retry discovery

### Diagnostic Tools

| Tool | Purpose |
|------|---------|
| `jq` | Parse JSON logs |
| `grep` | Search logs for keywords |
| `git log` | Audit trail of GARP operations |
| `git status` | Check repository state |
| `node --inspect` | Attach debugger to GARP process |

---

## 10. Log Schema Evolution (Future)

As GARP evolves, new log fields may be added. Examples:

### Brain Processing (Future Feature)

```json
{
  "timestamp": "2026-02-22T10:30:00.100Z",
  "level": "info",
  "message": "Brain enrichment applied",
  "request_id": "req_20260222_103000_abc123",
  "enrichment_fields": ["priority_flag", "sla_hours"],
  "component": "brain-processor"
}
```

### Telemetry (Optional Future Feature)

```json
{
  "timestamp": "2026-02-22T10:30:00.000Z",
  "level": "info",
  "message": "Daily usage summary",
  "requests_sent": 15,
  "requests_responded": 12,
  "requests_cancelled": 2,
  "component": "telemetry"
}
```

Telemetry is **not planned** for Phase 1-3 but could be added later for local usage insights.

---

## 11. Log Format Stability

### Semantic Versioning for Logs

Log format changes are **non-breaking**:

- Adding new fields: Non-breaking (parsers ignore unknown fields)
- Removing fields: Breaking (rare, requires major version bump)
- Changing field types: Breaking (requires major version bump)

### JSON Schema (Future)

Define a JSON schema for log entries to enable:

- Validation of log output
- Autocomplete in log parsers
- Breaking change detection

Example:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["timestamp", "level", "message"],
  "properties": {
    "timestamp": { "type": "string", "format": "date-time" },
    "level": { "enum": ["debug", "info", "warn", "error"] },
    "message": { "type": "string" },
    "component": { "type": "string" },
    "request_id": { "type": "string" },
    "duration_ms": { "type": "number" }
  }
}
```

This is optional but recommended for long-term log stability.

---

## 12. Comparison: Local vs. Cloud Monitoring

| Concern | Cloud Service | GARP (Local) |
|---------|---------------|--------------|
| **Logs** | Centralized (CloudWatch, Datadog) | Stderr per instance |
| **Metrics** | Aggregated (Prometheus, Grafana) | Per-operation duration in logs |
| **Traces** | Distributed tracing (Jaeger, Zipkin) | N/A (single process) |
| **Alerts** | PagerDuty, Slack webhooks | None (manual monitoring) |
| **Dashboards** | Real-time metrics dashboards | N/A (parse logs manually) |
| **Error tracking** | Sentry, Bugsnag | Stderr logs + GitHub Issues |
| **Retention** | 7-90 days (configurable) | Ephemeral (unless host captures) |
| **Cost** | $50-500/month | $0 |

GARP's monitoring strategy is appropriate for a local dev tool. Cloud monitoring infrastructure is unnecessary overhead.

---

## 13. Migration-Specific Logging (Phase 2)

During Phase 2 (Behavioral Equivalence Validation), add temporary debug logs to track dual-surface execution:

```json
{
  "timestamp": "2026-02-22T10:30:00.000Z",
  "level": "debug",
  "message": "Equivalence test: legacy surface",
  "tool": "garp_request",
  "params": "{...}",
  "component": "equivalence-test"
}
```

```json
{
  "timestamp": "2026-02-22T10:30:00.200Z",
  "level": "debug",
  "message": "Equivalence test: collapsed surface",
  "tool": "garp_do",
  "action": "send",
  "params": "{...}",
  "component": "equivalence-test"
}
```

These logs help verify that both surfaces are executing the same underlying logic.

**Remove in Phase 3** after equivalence is proven.

---

## 14. Summary

| Aspect | Strategy |
|--------|----------|
| **Primary observability** | Structured JSON logs to stderr |
| **Log consumption** | Host application captures stderr; developers pipe to files |
| **Error tracking** | Logged at `level: "error"` with stack traces |
| **Performance metrics** | `duration_ms` field in log entries |
| **Alerting** | None (manual monitoring) |
| **Audit trail** | Git commit history + log correlation by request ID |
| **Health checks** | Host application monitors process liveness + MCP responsiveness |
| **Distributed tracing** | N/A (single process, no network calls) |
| **Metrics aggregation** | N/A (local tool, no shared metrics) |
| **Cost** | $0 (no external monitoring services) |

This monitoring and alerting design is intentionally minimal, aligned with GARP's nature as a local development tool.
