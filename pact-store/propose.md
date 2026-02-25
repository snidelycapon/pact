---
name: propose
description: Workshop an idea through structured iteration
version: "1.0.0"
scope: global

when_to_use:
  - You have an idea or approach that needs refinement before committing
  - You want structured feedback that evolves the proposal across rounds
  - The idea is too complex for a single ask/answer exchange

multi_round: true

context_bundle:
  required: [proposal]
  fields:
    proposal: { type: string, description: "The idea or approach — state it concretely" }
    goal: { type: string, description: "What success looks like if this proposal is adopted" }
    constraints: { type: array, description: "Hard constraints the proposal must satisfy" }
    open_questions: { type: array, description: "Specific areas where you want pushback or alternatives" }
    round: { type: number, description: "Current iteration number, starting at 1" }

response_bundle:
  required: [assessment]
  fields:
    assessment: { type: string, description: "Overall take — viable / needs-work / rethink" }
    strengths: { type: array, description: "What works well in the proposal" }
    concerns: { type: array, description: "Issues to address, with severity" }
    suggested_changes: { type: array, description: "Concrete modifications to improve the proposal" }
    ready: { type: boolean, description: "true if the proposal is ready to act on" }
---

# Propose

## Example

**Round 1 — Request:**
```yaml
context_bundle:
  proposal: "Replace our REST API gateway with GraphQL federation across 3 services."
  goal: "Reduce frontend data-fetching round trips from 4 to 1 per page load."
  constraints: ["Must support existing mobile clients for 6 months", "No new infrastructure beyond what we run today"]
  open_questions: ["Is federation overkill for 3 services?", "How do we handle the mobile backward compat?"]
  round: 1
```

**Round 1 — Response:**
```yaml
response_bundle:
  assessment: "needs-work"
  strengths: ["Round-trip reduction goal is sound", "Federation scales well if you add services later"]
  concerns: ["Federation adds complexity for only 3 services — a simple gateway may suffice", "Mobile backward compat needs a concrete migration path"]
  suggested_changes: ["Consider a BFF (backend-for-frontend) pattern instead of full federation", "Sketch the mobile migration timeline before committing"]
  ready: false
```

## Multi-Round Flow

Each round refines the proposal. Update `proposal` with changes made, increment `round`, and narrow `open_questions` to remaining gaps. The responder sets `ready: true` when the proposal is actionable.
