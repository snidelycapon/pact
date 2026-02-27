---
name: check-in
description: Async status round across a group
version: "1.0.0"
scope: global

subject_hint: "Topic of the check-in"

when_to_use:
  - You want a status update from multiple people or agents
  - You're running an async standup or progress check
  - You need everyone to report, not just one person

multi_round: false

context_bundle:
  required: [topic]
  fields:
    topic: { type: string, description: "What the check-in is about" }
    questions: { type: array, description: "Specific questions each respondent should answer" }
    deadline: { type: string, description: "When responses are needed by" }

response_bundle:
  required: [status]
  fields:
    status: { type: string, enum: [on-track, at-risk, blocked, done], description: "Current status" }
    update: { type: string, description: "What happened since last check-in" }
    blockers: { type: array, description: "Current blockers, if any" }
    next: { type: string, description: "What you'll do before the next check-in" }

defaults:
  response_mode: all
  visibility: shared
---

# Check-In

## Example

**Request:**
```yaml
subject: "Sprint 14 mid-week standup"
context_bundle:
  topic: "Sprint 14 mid-week check-in"
  questions:
    - "Are you on track for your sprint commitments?"
    - "Any blockers that need team help?"
  deadline: "Wednesday 5pm ET"
```

**Response (from one participant):**
```yaml
response_bundle:
  status: "at-risk"
  update: "Payment webhook tests are done. Dual-write adapter is 60% complete."
  blockers:
    - "Need access to staging Stripe account to test webhooks end-to-end"
  next: "Finish dual-write adapter, start shadow reads if staging access comes through."
```

## Notes

- `defaults.response_mode: all` signals that every recipient should respond.
- `defaults.visibility: shared` signals that responses are visible to all participants — useful for standup-style transparency.
- The protocol delivers to all recipients and presents all responses. It doesn't enforce or track completeness — agents decide how to handle missing responses.
