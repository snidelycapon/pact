---
name: review
description: Structured feedback with blocking/advisory split
version: "1.0.0"
scope: global

subject_hint: "What's being reviewed"

when_to_use:
  - You have an artifact that needs structured feedback before proceeding
  - You want to distinguish blocking issues from nice-to-haves
  - The review may need a follow-up round after changes are made

multi_round: true

context_bundle:
  required: [artifact, focus_areas]
  fields:
    artifact: { type: string, description: "What to review — describe or link to it" }
    focus_areas: { type: array, description: "Specific areas to focus feedback on" }
    context: { type: string, description: "Why this artifact exists and what it's trying to achieve" }
    round: { type: number, description: "Review round number, starting at 1" }

response_bundle:
  required: [verdict, must_change, suggestions]
  fields:
    verdict: { type: string, enum: [approve, request-changes, comment], description: "Overall review outcome" }
    must_change: { type: array, description: "Blocking issues that must be addressed" }
    suggestions: { type: array, description: "Non-blocking improvements, take-or-leave" }
    praise: { type: array, description: "What's done well — reinforce good patterns" }

defaults:
  visibility: private
---

# Review

## Example

**Round 1 — Request:**
```yaml
subject: "PR #247 — Rate limiting middleware"
context_bundle:
  artifact: "PR #247 — Add rate limiting middleware to API gateway"
  focus_areas:
    - "Correctness of the sliding window algorithm"
    - "Redis failure handling — should requests pass or fail when Redis is down?"
  context: "We had a production incident last week from a runaway client. This adds per-tenant rate limiting at the gateway layer."
  round: 1
```

**Round 1 — Response:**
```yaml
response_bundle:
  verdict: "request-changes"
  must_change:
    - "Race condition in sliding window: MULTI/EXEC isn't atomic across the GET and ZADD. Use a Lua script."
    - "Redis connection failure returns 500. Should fail-open (allow request) with a circuit breaker, not block all traffic."
  suggestions:
    - "Consider adding a X-RateLimit-Remaining header so clients can self-throttle."
    - "The 429 response body could include retry-after seconds."
  praise:
    - "Per-tenant isolation is the right approach. Clean separation of the middleware from routing."
```

## Multi-Round Flow

After addressing `must_change` items, send a new round with updated `artifact` and incremented `round`. The reviewer checks whether blocking issues are resolved and may surface new findings. The cycle ends when the reviewer responds with `verdict: approve`.

## Notes

- `defaults.visibility: private` signals that in group reviews, each reviewer gives independent feedback without seeing others' reviews. This prevents groupthink. Agents honor this by composing reviews independently.
- Teams can extend this pact for specific review types (e.g., `review:code`, `review:design`, `review:security`) with domain-specific `focus_areas` and `must_change` categories.
