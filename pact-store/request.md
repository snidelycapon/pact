---
name: request
description: Ask someone to do something and deliver a result
version: "1.0.0"
scope: global

when_to_use:
  - You need someone to perform a specific task and deliver a result
  - The work has clear completion criteria
  - You're delegating, not collaborating — use propose for collaboration

multi_round: false

context_bundle:
  required: [what, done_when]
  fields:
    what: { type: string, description: "What needs to be done — specific and actionable" }
    done_when: { type: string, description: "How to know the work is complete" }
    deadline: { type: string, description: "When it needs to be done by" }
    background: { type: string, description: "Context that helps the recipient do the work" }

response_bundle:
  required: [status, result]
  fields:
    status: { type: string, enum: [done, blocked, declined], description: "Outcome of the request" }
    result: { type: string, description: "The deliverable or outcome" }
    blockers: { type: array, description: "What's blocking, if status is blocked" }
    notes: { type: string, description: "Anything the requester should know" }

defaults:
  claimable: true
---

# Request

## Example

**Request:**
```yaml
context_bundle:
  what: "Write integration tests for the payment webhook handler covering success, idempotency, and signature verification failure."
  done_when: "Tests pass in CI and cover all 3 scenarios with assertions on side effects."
  deadline: "End of sprint (Friday)"
  background: "Handler is in src/webhooks/payment.ts. We use Stripe webhooks with signature verification. No tests exist yet."
```

**Response:**
```yaml
response_bundle:
  status: "done"
  result: "Added 3 integration tests in tests/webhooks/payment.test.ts. All pass in CI. Coverage: success (creates order + sends email), idempotency (skips duplicate event IDs), sig failure (returns 400 + logs alert)."
  notes: "Found a bug in the idempotency check — it wasn't using the Stripe event ID. Fixed in the same PR."
```

## Notes

- `defaults.claimable: true` signals that in group requests, a recipient can claim the work so others don't duplicate effort. The protocol doesn't enforce claiming — agents coordinate this.
- If you're transferring ongoing work rather than requesting new work, use `handoff`.
