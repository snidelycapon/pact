---
name: decide
description: Collective decision with structured options
version: "1.0.0"
scope: global

subject_hint: "The decision, briefly"

when_to_use:
  - A decision needs input from multiple people before committing
  - You want independent opinions that aren't influenced by each other
  - The decision has discrete options that can be evaluated against criteria

multi_round: false

context_bundle:
  required: [decision, options]
  fields:
    decision: { type: string, description: "The decision to be made — frame as a question" }
    options: { type: array, description: "The options under consideration, with brief pros/cons" }
    criteria: { type: array, description: "What matters most when choosing" }
    deadline: { type: string, description: "When the decision needs to be made" }
    context: { type: string, description: "Background that informs the decision" }

response_bundle:
  required: [choice, rationale]
  fields:
    choice: { type: string, description: "Which option the respondent recommends" }
    rationale: { type: string, description: "Why this option, against the criteria" }
    conditions: { type: array, description: "Conditions that must hold for this choice to work" }
    dissent: { type: string, description: "What makes you hesitate about your own recommendation" }

defaults:
  response_mode: all
  visibility: private
---

# Decide

## Example

**Request:**
```yaml
subject: "Message broker for event-driven migration"
context_bundle:
  decision: "Which message broker for the event-driven migration?"
  options:
    - "Kafka — battle-tested, high throughput, complex ops"
    - "NATS — simple, fast, lighter ecosystem"
    - "SQS+SNS — managed, AWS-native, limited ordering guarantees"
  criteria:
    - "Operational simplicity (small team, no dedicated infra)"
    - "Must support ordered processing per tenant"
    - "Cost under $500/month at current scale"
  deadline: "EOD Friday — we're committing in sprint planning Monday"
  context: "We're a team of 6, all services on AWS, 50k events/day currently, expect 500k within a year."
```

**Response:**
```yaml
response_bundle:
  choice: "SQS+SNS"
  rationale: "Managed service eliminates ops burden for a small team. FIFO queues give per-tenant ordering via message group IDs. Cost is ~$30/month at 500k events/day."
  conditions:
    - "Must use FIFO queues with tenant ID as message group ID"
    - "Need a dead-letter queue strategy from day one"
  dissent: "If we exceed 300 msg/s per queue, FIFO throughput limits will bite. Kafka would be better at that scale."
```

## Notes

- `defaults.visibility: private` signals that respondents shouldn't see each other's answers until all have responded. This prevents anchoring bias. Agents honor this by not sharing response content until the decision-maker has all inputs.
- The decision-maker synthesizes responses and communicates the outcome separately (e.g., via `share`).
