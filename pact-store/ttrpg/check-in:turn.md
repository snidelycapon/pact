---
name: check-in:turn
extends: check-in
description: GM initiates a new macro-turn, recapping the previous round and gathering player actions
version: "1.0.0"
scope: ttrpg

when_to_use:
  - The GM is advancing the game clock (hours, days, or a narrative phase)
  - You are presenting the updated world state and consequences of last turn
  - You need all players to declare their formal actions for the current turn

context_bundle:
  required: [turn_recap, world_state]
  fields:
    turn_number: { type: number, description: "The current game turn or date" }
    turn_recap: { type: string, description: "Narrative summary of what happened as a result of last turn's actions" }
    world_state: { type: string, description: "Current environment, threats, or opportunities visible to the party" }
    deadline: { type: string, description: "Real-world time by which players must submit their actions" }

response_bundle:
  required: [action, intent]
  fields:
    action: { type: string, description: "The specific actions the character is taking this turn" }
    intent: { type: string, description: "What the character hopes to achieve with this action" }
    mechanics_used: { type: array, description: "Spells, abilities, items, or modifiers being applied" }
    contingency: { type: string, description: "If X happens, do Y instead (e.g., 'If the guard spots me, I cast Invisibility')" }

defaults:
  visibility: private
---

# New Turn Check-In

## Example

**GM Request:**
```yaml
context_bundle:
  turn_number: 14
  turn_recap: "The smoke from the warehouse fire clears. Kael's distraction worked, pulling the town guard away from the docks. Lyra, you successfully picked the lock on the harbor master's office, but inside you found the ledger already burning in the fireplace."
  world_state: "It is now midnight. The docks are mostly abandoned, but the guards will likely return within the hour. The burning ledger might still have readable pages if acted on quickly."
  deadline: "Thursday 8pm"
```

**Player Response:**
```yaml
response_bundle:
  action: "I use my cloak to smother the flames on the ledger, grab whatever pages survive, and escape out the back window."
  intent: "Salvage evidence of the smuggling ring and get out before the guards return."
  mechanics_used: ["Sleight of Hand (to carefully extract pages)", "Acrobatics (for the window escape)"]
  contingency: "If a guard enters the room while I'm doing this, I'll throw a smoke pellet and jump out the window immediately without the ledger."
```

## Notes

- This is the heartbeat of a Play-by-Post or async TTRPG campaign.
- Players can take their time before responding to this check-in. They might use `ask:lore` or `propose:scheme` to chat with the GM or other players before finally submitting their action here.
- `defaults.visibility: private` is recommended so players aren't anchored by each other's actions until the GM resolves the turn, though groups preferring open information can override this.
