# Sanity Check

Ask a colleague to validate your findings on a bug investigation. You send the context -- customer, product, files, what you found, your specific question -- and they respond with a yes/no/partially answer plus evidence and a recommended next step.

This is the "look at this, does it make sense?" pattern.

## When To Use

- You are investigating a bug and found something suspicious -- you want a second pair of eyes
- You need to confirm whether a pattern matches a known issue before applying a fix
- You want a colleague's domain expertise on a specific question about your findings
- You have done the initial investigation and need validation, not a full handoff

## Context Bundle Fields

| Field | Required | Description |
|-------|----------|-------------|
| customer | yes | Customer name (e.g. "Acme Corp") |
| product | yes | Product name and version (e.g. "Platform v3.2") |
| issue_summary | yes | Brief description of the issue being investigated |
| involved_files | yes | Files examined during investigation, with line ranges if relevant |
| investigation_so_far | yes | What you have found -- the core of what needs validation |
| question | yes | Specific question for the reviewer -- be precise about what you need confirmed |
| zendesk_ticket | no | Related Zendesk ticket ID (e.g. "ZD-4521") |

## Response Structure

| Field | Required | Description |
|-------|----------|-------------|
| answer | yes | YES / NO / PARTIALLY with brief explanation |
| evidence | yes | What you compared or examined to reach your conclusion |
| concerns | no | Any risks, caveats, or related issues the sender should know about |
| recommendation | yes | Suggested next step -- what the sender should do with this information |

## Worked Example

### Request: Memory Leak Investigation

**Context bundle:**
```json
{
  "customer": "Acme Corp",
  "product": "Platform v3.2",
  "issue_summary": "Refresh tokens not being garbage collected after OAuth cycle completes",
  "involved_files": [
    "src/auth/refresh.ts:L45-90",
    "src/oauth/token-manager.ts:L120-150"
  ],
  "investigation_so_far": "After an OAuth refresh cycle, the old refresh token objects remain in the WeakMap because the token-manager holds a strong reference via the retry queue. GC never collects them. Heap snapshots show linear growth correlated with refresh frequency.",
  "question": "Does this match the session service retention pattern from ZD-4102? If so, can we apply the same finally-block cleanup?",
  "zendesk_ticket": "ZD-4521"
}
```

### Response: Confirmed With Concerns

**Response bundle:**
```json
{
  "answer": "YES -- same object retention pattern as ZD-4102",
  "evidence": "Compared refresh.ts:L45-90 with session-service/cleanup.ts:L30-60. Both hold strong references through a retry/queue mechanism that prevents WeakMap eviction. The heap growth curve shape matches.",
  "concerns": "The fix in session-service was tricky -- the finally block must handle the async case correctly or you introduce a different leak (dangling promise references). See commit a1b2c3d for the gotcha.",
  "recommendation": "Apply the finally-block cleanup pattern from the ZD-4102 fix. Port cleanup.ts:L55-70 to refresh.ts, then verify with a 30-minute heap soak test."
}
```
