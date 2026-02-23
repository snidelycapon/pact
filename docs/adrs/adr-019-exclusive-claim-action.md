# ADR-019: Exclusive Claim Action via Envelope Mutation

## Status

Accepted

## Context

Group requests with `claimable: true` need a mechanism for one recipient to signal "I'm working on this" before submitting a response. This prevents duplicate work (e.g., two agents both spending 20 minutes on the same code review).

Design questions:
1. Is claiming a separate action or implicit in the first response?
2. How is exclusivity enforced in a git-based system without a lock server?
3. What happens on concurrent claims?

## Decision

**Claiming is a separate `pact_do(action: "claim")` action that mutates the request envelope.**

Claiming writes three fields to the pending request envelope:
```json
{
  "claimed": true,
  "claimed_by": { "user_id": "kenji", "display_name": "Kenji" },
  "claimed_at": "2026-02-23T10:05:30Z"
}
```

**Exclusivity is enforced by git's pull-before-write pattern:**

1. Agent A reads envelope (unclaimed). Agent B reads envelope (unclaimed).
2. Agent A writes claim, commits, pushes. Push succeeds.
3. Agent B writes claim, commits, attempts push. Push fails (remote changed).
4. Agent B's push retry: `git pull --rebase` → rebase succeeds (no file conflict, but envelope now has claim). Agent B re-reads envelope → sees `claimed: true` → returns `already_claimed` error.

**Claiming does not change request status** — the request stays in `pending/`. The claimer must still respond to complete the request.

## Alternatives Considered

### A: First response = implicit claim
The first response to a `claimable: true` request implicitly claims it.

**Rejected for v1**: Conflates two distinct actions. In real-world systems (PagerDuty, support queues), acknowledging/claiming happens before the work is done. An agent should claim first (signal ownership), then spend time investigating and responding. If claiming and responding were the same action, other agents wouldn't know someone is working until the full response is ready.

**Monitored assumption**: If >30% of claimable pacts show that agents always claim-and-respond atomically (never claim-then-delay-then-respond), this separation adds unnecessary overhead. Track in production.

### B: Separate claim file (not envelope mutation)
Write a claim file to `claims/{request_id}.json` instead of mutating the envelope.

**Rejected**: Adds a new directory to the storage layout and requires checking two files (envelope + claim) on every inbox query. Envelope mutation keeps claim status co-located with the request, simplifying reads.

### C: Lock file mechanism
Write a `.lock` file to signal claiming, similar to PID files.

**Rejected**: Lock files are fragile (agent crash leaves stale lock). Envelope mutation is durable (claim persists even if agent crashes). Git's atomic commit provides the exclusivity guarantee without needing a separate locking mechanism.

## Concurrency Specification

### Timestamp Ordering

Claim timestamps use ISO 8601 with second precision (`2026-02-23T10:05:30Z`). No subsecond precision assumed. Tie-breaking for same-second claims: lexicographic ordering of `user_id`. This is deterministic and requires no coordination.

### Claim Conflict Detection

The claim handler follows this sequence:

1. `git pull` (sync latest state)
2. Read request envelope from `requests/pending/{id}.json`
3. Validate `defaults_applied.claimable === true` → else return `{ error: "not_claimable" }`
4. Validate `claimed !== true` → else return `{ error: "already_claimed", claimed_by, claimed_at }`
5. Validate current user is in `recipients[]` → else return `{ error: "not_a_recipient" }`
6. Write `claimed: true`, `claimed_by: UserRef`, `claimed_at: ISO8601` to envelope
7. `git add`, `git commit` (message: `claim: {request_id} by {user_id}`)
8. `git push` → if push fails:
   a. `git pull --rebase` (rebase local claim commit on remote changes)
   b. Re-read envelope from disk (now contains remote changes)
   c. If `claimed === true` → abort local commit, return `{ error: "already_claimed", claimed_by, claimed_at }`
   d. If still unclaimed → `git push` (retry once)

### Error Response Format

```typescript
// Success
{ status: "claimed", request_id: string, claimed_by: UserRef }

// Errors
{ error: "not_claimable", request_id: string }
{ error: "already_claimed", request_id: string, claimed_by: UserRef, claimed_at: string }
{ error: "not_a_recipient", request_id: string }
```

### Agent Behavior on Race Loss

When an agent receives `already_claimed`:
1. Log the claim info (who claimed, when)
2. Notify the human: "This was just claimed by @{display_name}"
3. Do NOT start or continue work on this request
4. Present other unclaimed inbox items

### Clock Skew

Claim ordering assumes the git server's commit timestamps are authoritative. For a single git remote (the deployment target), all agents push to the same server — commit ordering is determined by push arrival, not agent-local clocks. Clock skew between agents is irrelevant because the git server determines commit order.

### Stale Claim Recovery

If an agent claims but crashes before responding:
- Claim persists on the envelope (durable)
- No automatic claim expiration in v1
- Recovery: Requester checks status, sees "claimed by X, no response yet"
- Requester can cancel and re-send if claim is stale
- Future wave may add claim timeout (monitored assumption)

## Consequences

- **Positive**: Explicit claim action matches PagerDuty acknowledge model — claim before investing work
- **Positive**: Git's atomic push provides exclusivity without a lock server
- **Positive**: Claim status co-located with request — single file read for inbox queries
- **Positive**: No new MCP tools — claim is an action within existing pact_do
- **Negative**: Extra git commit per claim (additional push latency)
- **Negative**: If agent crashes after claim but before response, claim persists without a response (human must re-send or wait)
