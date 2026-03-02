---
name: propose:scheme
extends: propose
description: Brainstorm a complex party plan or strategy
version: "1.0.0"
scope: ttrpg

when_to_use:
  - The party is facing a complex obstacle (a heist, a boss fight, political negotiation)
  - Players want to coordinate their actions before submitting them to the GM
  - You want to workshop an idea and identify fatal flaws before executing it

context_bundle:
  required: [proposal, goal]
  fields:
    proposal: { type: string, description: "The core idea for the scheme" }
    goal: { type: string, description: "The ultimate objective" }
    roles: { type: array, description: "Suggested tasks for other party members" }
    open_questions: { type: array, description: "Missing pieces of the plan (e.g., 'How do we bypass the arcane ward?')" }

response_bundle:
  required: [assessment]
  fields:
    strengths: { type: array, description: "Parts of the plan that work well" }
    concerns: { type: array, description: "Flaws or risks in the plan" }
    suggested_changes: { type: array, description: "Alternative approaches or additions" }
---

# Scheme Proposal

## Example

**Player 1 Request:**
```yaml
context_bundle:
  proposal: "We stage a distraction at the front gate with Kael's illusions, while Lyra and Thorne scale the back wall to rescue the prisoner."
  goal: "Get the prisoner out without sounding the general alarm."
  roles: ["Kael: Distraction", "Lyra: Lockpicking/Stealth", "Thorne: Carrying the prisoner"]
  open_questions: ["Thorne is in heavy armor. Can we muffle his steps?"]
```

**Player 2 Response:**
```yaml
response_bundle:
  assessment: "needs-work"
  strengths: ["Kael's illusions are perfect for drawing the guards away."]
  concerns: ["Thorne will definitely fail the stealth check scaling the wall in heavy armor."]
  suggested_changes: ["Have Kael cast 'Pass Without Trace' on Thorne before starting the distraction."]
```

## Notes

- This pact facilitates player-to-player collaboration. It operates outside the strict game mechanics, simulating the table-talk of planning a heist or encounter.
