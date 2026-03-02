---
name: handoff:escalation
extends: handoff
description: Escalate a complex support ticket to a higher tier or specialized team
version: "1.0.0"
scope: support

when_to_use:
  - Tier 1 support has exhausted their playbooks and needs Tier 2/3 help
  - A technical issue requires specialized domain knowledge (e.g., routing to the Security or Billing team)
  - You need to transfer ownership of an angry customer to a manager

context_bundle:
  required: [ticket_link, customer_sentiment, steps_taken]
  fields:
    ticket_link: { type: string, description: "Link to the Zendesk/Intercom thread" }
    customer_sentiment: { type: string, enum: [calm, frustrated, at-risk], description: "The customer's current mood" }
    steps_taken: { type: array, description: "Everything you've already tried or verified" }
    why_escalating: { type: string, description: "Exactly what you need the next tier to do" }
    urgency: { type: string, enum: [normal, high, drop-everything], description: "How fast this needs attention" }

response_bundle:
  required: [status]
  fields:
    status: { type: string, enum: [accepted, pushed-back], description: "Whether the escalation is accepted" }
    next_action: { type: string, description: "What the receiving agent is doing right now" }
    feedback: { type: string, description: "If pushed back, what Tier 1 missed in the playbook" }
---

# Escalation Handoff

## Example

**Request (Tier 1 to Tier 2):**
```yaml
context_bundle:
  ticket_link: "https://zendesk.internal/agent/tickets/88412"
  customer_sentiment: "frustrated"
  steps_taken:
    - "Verified the user's API key is active."
    - "Checked Datadog: 401 Unauthorized errors are hitting our edge gateway."
    - "Had the user rotate their key; new key still gets 401."
  why_escalating: "The edge gateway seems to be rejecting valid keys. Needs someone from the Auth team to check the Redis cache."
  urgency: "high"
```

**Response (Tier 2):**
```yaml
response_bundle:
  status: "accepted"
  next_action: "I am taking ownership of the ticket. I will check the Redis replica sync status and message the customer."
```

## Notes

- Prevents the classic "ping-pong" between support tiers by forcing the escalating agent to explicitly state `steps_taken` and `why_escalating`.
- Ensures the customer doesn't have to repeat themselves to the new agent.
