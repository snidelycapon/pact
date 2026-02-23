# Monitoring & Alerting: pact-fmt

**Feature**: pact-fmt (Group Envelope Primitives)
**Architect**: Apex (nw-platform-architect)
**Date**: 2026-02-23

---

## Context

PACT is a local dev tool. There is no production server to monitor, no uptime SLA, no alerting infrastructure. "Monitoring" means: **how do developers and their agents debug problems when group operations behave unexpectedly?**

This document covers:
1. Git commit audit trail for group operations
2. Debugging workflows for pact-fmt error paths
3. Log correlation patterns for request lifecycle

---

## Git Commit Audit Trail

Every PACT state change produces a git commit. This is the primary audit mechanism -- immutable, distributed, and free.

### Group Operation Commits

| Operation | Commit Message Pattern | Files Touched |
|-----------|----------------------|---------------|
| Group send | `pact: send {request_type} to {group_ref} ({n} recipients)` | `requests/pending/{id}.json` |
| Claim | `pact: {user_id} claims {request_id}` | `requests/pending/{id}.json` (mutated) |
| Group respond | `pact: {user_id} responds to {request_id}` | `responses/{id}/{user_id}.json` |
| Completion (any) | `pact: complete {request_id} (first response)` | `requests/completed/{id}.json` (git mv) |
| Completion (all) | `pact: complete {request_id} (all responded)` | `requests/completed/{id}.json` (git mv) |

### Audit Queries

```bash
# All group sends in the last week
git log --oneline --since="1 week ago" --grep="recipients)"

# All claims for a specific request
git log --oneline --all --grep="claims req-20260223"

# Who responded to a group request
git log --oneline -- "responses/req-20260223-100000-cory-a1b2/"

# Timeline of a complete group request lifecycle
git log --oneline --all -- \
  "requests/*/req-20260223-100000-cory-a1b2.json" \
  "responses/req-20260223-100000-cory-a1b2/"

# View the exact state of an envelope at claim time
git show <claim-commit-hash>:requests/pending/req-20260223-100000-cory-a1b2.json
```

### Advantages Over Log-Based Audit

- **Immutable**: Git history cannot be silently edited (without force push)
- **Distributed**: Every team member has a full copy
- **Diffable**: `git diff` shows exact state changes (what fields were modified during claim)
- **Time-travel**: `git show <commit>:<path>` reconstructs any historical state

---

## Debugging Workflows

### ERR1: Claim Race Condition

**Symptom**: User reports "I tried to claim but it was already taken."

**Debugging steps**:

1. **Check stderr logs** (if available):
   ```bash
   jq 'select(.action == "claim" and .request_id == "req-...")' /tmp/pact-stderr.log
   ```
   Look for: `"msg": "claim rejected: already claimed"` with `claimed_by` and `attempted_by`.

2. **Check git history**:
   ```bash
   git log --oneline --all --grep="claims req-20260223"
   ```
   Shows who claimed and when.

3. **Inspect envelope state**:
   ```bash
   git show HEAD:requests/pending/req-20260223-100000-cory-a1b2.json | jq '{claimed, claimed_by, claimed_at}'
   ```

**Resolution**: This is expected behavior. The first claimer wins. The agent should present alternative unclaimed requests.

### ERR2: Stale Claim (No One Claims)

**Symptom**: Sender asks "Why hasn't anyone picked up my request?"

**Debugging steps**:

1. **Check request state**:
   ```bash
   jq '{claimed, claimable: .defaults_applied.claimable, recipients}' \
     requests/pending/req-20260223-100000-cory-a1b2.json
   ```
   Verify: `claimable: true`, `claimed: false` (or absent).

2. **Check inbox visibility for recipients**:
   Each recipient's agent should see this in their inbox. Verify by running the inbox action as a specific user:
   ```bash
   PACT_USER=kenji node dist/index.js  # Then send inbox request via MCP
   ```

**Resolution**: PACT is apathetic about nudging. Sender can re-send, direct-message a specific person, or amend the request with urgency context.

### ERR3: All-Mode Partial Responses

**Symptom**: `response_mode: all` request stays pending even though "most people responded."

**Debugging steps**:

1. **Count responses**:
   ```bash
   ls responses/req-20260223-100000-cory-a1b2/ | wc -l
   # Compare with recipients count
   jq '.recipients | length' requests/*/req-20260223-100000-cory-a1b2.json
   ```

2. **Identify missing respondents**:
   ```bash
   # Who has responded
   ls responses/req-20260223-100000-cory-a1b2/
   # kenji.json  maria.json  tomas.json

   # Who should have responded
   jq -r '.recipients[].user_id' requests/*/req-20260223-100000-cory-a1b2.json
   # kenji  maria  tomas  priya

   # Missing: priya
   ```

3. **Check stderr logs** (if available):
   ```bash
   jq 'select(.request_id == "req-..." and .action == "respond")' /tmp/pact-stderr.log
   ```
   Shows `responses_received` vs `responses_needed` progression.

**Resolution**: Sender uses `check_status` to see progress. They can contact the missing respondent directly, or cancel and re-send to a smaller group.

### ERR4: Private Response Visibility

**Symptom**: User asks "Where are the other responses? I can only see mine."

**Debugging steps**:

1. **Check visibility setting**:
   ```bash
   jq '.defaults_applied.visibility' requests/*/req-20260223-100000-cory-a1b2.json
   # "private"
   ```

2. **Verify response files exist** (admin check):
   ```bash
   ls -la responses/req-20260223-100000-cory-a1b2/
   ```

3. **Check who is requesting** (from stderr debug logs):
   ```bash
   jq 'select(.msg == "visibility filter applied" and .request_id == "req-...")' /tmp/pact-stderr.log
   ```
   Shows `requesting_user`, `total_responses`, `visible_responses`.

**Resolution**: This is by design. `visibility: private` means respondents only see their own response. The requester (sender) sees all responses. If the pact author wants shared visibility, they change the pact definition.

### General: Git Push Failure on Group Operation

**Symptom**: Agent reports "Failed to push" or operation seems to hang.

**Debugging steps**:

1. **Check git status**:
   ```bash
   cd $PACT_REPO && git status
   ```

2. **Check for rebase in progress**:
   ```bash
   ls .git/rebase-merge/ 2>/dev/null && echo "Rebase in progress"
   ```

3. **Check stderr for retry logs**:
   ```bash
   jq 'select(.msg | contains("push conflict"))' /tmp/pact-stderr.log
   ```

**Resolution**: If rebase is stuck, `git rebase --abort` and retry the operation. The git-adapter already retries once. If the remote is consistently ahead, it may indicate high concurrency -- increase retry count in git-adapter.

---

## Log Correlation Patterns

### Correlating a Full Group Lifecycle

Use `request_id` as the correlation key across all log events:

```bash
REQUEST_ID="req-20260223-100000-cory-a1b2"

# Full timeline for one request
jq "select(.request_id == \"$REQUEST_ID\" or (.msg | contains(\"$REQUEST_ID\")))" \
  /tmp/pact-stderr.log
```

Expected event sequence for a claimed, all-mode group request:

```
[T+0ms]    info  tool invocation start       action=send
[T+50ms]   info  group request sent          recipients_count=4, response_mode=all
[T+300ms]  info  tool invocation complete     duration_ms=300
...
[T+5min]   info  request claimed             claimed_by=kenji
...
[T+10min]  info  group response recorded     responder=kenji, 1/4, completed=false
[T+2hr]    info  group response recorded     responder=maria, 2/4, completed=false
[T+3hr]    info  group response recorded     responder=tomas, 3/4, completed=false
[T+5hr]    info  group response recorded     responder=priya, 4/4, completed=true
```

### Correlating Across Users

Since each user runs their own PACT process, logs are local to each machine. To correlate across users:

1. **Git history** is the shared audit trail (all users push to same remote)
2. **Envelope JSON** contains timestamps from all participants
3. **Response directory** contains all respondent files with `responded_at` timestamps

There is no centralized log aggregation, by design.

---

## What We Do Not Add

| Omitted | Rationale |
|---------|-----------|
| External alerting (PagerDuty, etc.) | Local dev tool. No one is on-call for PACT |
| Uptime monitoring | No server. Process starts/stops with MCP host |
| Error rate dashboards | Volume is too low to trend. Individual debugging suffices |
| SLI/SLO definitions | No service to measure. Git push latency varies by network |
| Automated remediation | Nothing to remediate. Retry logic is built into git-adapter |
| Log forwarding | Each developer's logs stay on their machine. Git is the shared record |
| Health checks | Stdio process. If it's not responding, the MCP host restarts it |
