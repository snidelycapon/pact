---
name: ask
description: Get input that unblocks current work
version: "1.0.0"
scope: global

when_to_use:
  - You have a specific question that blocks your current task
  - You need another person or agent's perspective to proceed
  - The question doesn't fit a more structured pact like review or decide

multi_round: false

context_bundle:
  required: [question]
  fields:
    question: { type: string, description: "The question — be specific and actionable" }
    background: { type: string, description: "Context the recipient needs to answer well" }
    options_considered: { type: array, description: "What you already considered and why it's insufficient" }

response_bundle:
  required: [answer]
  fields:
    answer: { type: string, description: "Direct answer to the question" }
    reasoning: { type: string, description: "Why this answer, briefly" }
    caveats: { type: string, description: "Conditions or exceptions to the answer" }
---

# Ask

## Example

**Request:**
```yaml
context_bundle:
  question: "Should we use Redis or PostgreSQL advisory locks for the distributed rate limiter?"
  background: "We need sub-10ms lock acquisition. Current stack is PostgreSQL 16 + Node.js. No Redis instance exists yet."
  options_considered: ["PostgreSQL advisory locks are simpler but we're unsure about performance at 5k req/s", "Redis is proven but adds operational overhead"]
```

**Response:**
```yaml
response_bundle:
  answer: "PostgreSQL advisory locks. At 5k req/s they perform well and avoid adding Redis to your stack."
  reasoning: "pg_advisory_lock benchmarks show <2ms acquisition up to 10k concurrent. Adding Redis for this alone isn't justified."
  caveats: "Revisit if you need cross-database coordination or exceed 10k req/s."
```

## Notes

- If the answer needs iteration, use `propose` instead.
- If you need multiple people's independent input, use `decide` with the question framed as options.
