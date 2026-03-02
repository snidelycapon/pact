---
name: ask:lore
extends: ask
description: Query the GM or world-knowledge-base about setting details, history, or rules
version: "1.0.0"
scope: ttrpg

when_to_use:
  - A player needs context about the world to make an informed decision for their turn
  - You want to know if your character would reasonably know a piece of information
  - You need clarification on how a specific game mechanic applies to the current situation

context_bundle:
  required: [question]
  fields:
    question: { type: string, description: "What you need to know about the world or rules" }
    character_context: { type: string, description: "Relevant background, proficiencies, or backstory of your character" }
    source_material: { type: string, description: "If referencing a specific rulebook or wiki page, mention it here" }

response_bundle:
  required: [answer]
  fields:
    answer: { type: string, description: "The lore, fact, or ruling" }
    knowledge_source: { type: string, description: "How the character knows this (e.g., 'Common knowledge', 'History check: 18')" }
    mechanics_note: { type: string, description: "Any mechanical implications of this knowledge" }
---

# Lore & Rule Query

## Example

**Player Request:**
```yaml
context_bundle:
  question: "Who are the 'Silent Choir' that the harbor master mentioned?"
  character_context: "Lyra is a former smuggler from the neighboring kingdom, proficient in Criminal Underworld history."
```

**GM Response:**
```yaml
response_bundle:
  answer: "The Silent Choir is a notorious syndicate of assassins who communicate entirely through magical sign language. They rarely operate this far north."
  knowledge_source: "Given your smuggler background, you've heard terrifying tavern rumors about them, though you've never met one."
  mechanics_note: "They are known for immunity to magical charm and sleep effects."
```

## Notes

- This pact supports players getting their bearings during the discussion phase of a turn.
- In campaigns with AI agents, an agent could act as the "Librarian" and answer these automatically based on a campaign wiki.
