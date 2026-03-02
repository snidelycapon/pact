---
name: decide:world-truth
extends: decide
description: Resolve an ambiguous or disputed fact about the setting's metaphysics or history
version: "1.0.0"
scope: ttrpg

when_to_use:
  - Co-GMs are trying to figure out how a specific magic system or physical law actually works
  - You need to establish the "true" history behind a common myth before the players investigate it
  - There is a contradiction in the notes that needs a definitive ruling

context_bundle:
  required: [question, options]
  fields:
    question: { type: string, description: "The cosmological or historical question to answer" }
    options: { type: array, description: "The possible truths, with their implications for the sandbox" }
    impact: { type: string, description: "How this decision will affect gameplay or faction behavior" }

response_bundle:
  required: [choice, rationale]
  fields:
    choice: { type: string, description: "The truth we are canonizing" }
    rationale: { type: string, description: "Why this makes for a better sandbox environment" }
    hidden_twist: { type: string, description: "A secret caveat to the truth that only the GMs know" }

defaults:
  visibility: private
---

# World Truth Decision

## Example

**Request:**
```yaml
context_bundle:
  question: "Where do the 'Aether-cores' actually come from?"
  options:
    - "A: They are mined from deep underground (standard resource scarcity)."
    - "B: They are the crystallized souls of the First Era inhabitants (moral dilemma)."
    - "C: They fall from the sky during the yearly meteor showers (seasonal scarcity)."
  impact: "If B, the players using Aether-tech are unknowingly committing necromancy, which the Paladin order will eventually notice."
```

**Response:**
```yaml
response_bundle:
  choice: "Option B"
  rationale: "It creates an incredible moral dilemma for the players later in the campaign once they are heavily reliant on Aether-tech."
  hidden_twist: "The souls inside aren't dead—they are dreaming, and sometimes the tech glitches because the soul is having a nightmare."
```

## Notes

- Useful for answering the deep "why" questions of worldbuilding.
- The `hidden_twist` allows for the "truth" to have layers that players will slowly peel back.
