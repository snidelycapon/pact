---
name: check-in:world-state
extends: check-in
description: Periodic sync between co-GMs to update the sandbox based on player actions
version: "1.0.0"
scope: ttrpg

when_to_use:
  - After a major campaign arc or between sessions
  - When the players have done something highly disruptive (e.g., assassinated a king, burned a town)
  - You need to coordinate how the "off-screen" factions will react to recent events

context_bundle:
  required: [player_actions, affected_factions]
  fields:
    session_summary: { type: string, description: "Brief recap of what the players actually did" }
    player_actions: { type: array, description: "Specific disruptive events caused by the party" }
    affected_factions: { type: array, description: "Which groups are noticing or reacting to these events" }
    power_vacuum: { type: string, description: "Who is moving in to take advantage of the chaos?" }

response_bundle:
  required: [faction_reactions]
  fields:
    faction_reactions: { type: array, description: "Specific moves the affected factions will make 'off-screen' before next session" }
    new_rumors: { type: array, description: "What the common folk are saying about the events" }
    next_session_prep: { type: string, description: "What we need to build before the players sit down again" }

defaults:
  response_mode: all
  visibility: shared
---

# World State Check-In

## Example

**Request:**
```yaml
context_bundle:
  session_summary: "The party successfully raided the Iron Consortium's land-ship and stole the primary Aether-core."
  player_actions:
    - "Stole the core."
    - "Killed the Chief Artificer."
    - "Left behind a dagger belonging to the Thieves Guild (framing them)."
  affected_factions: ["Iron Consortium", "Thieves Guild", "City Watch"]
  power_vacuum: "Without the Chief Artificer, the Consortium's leadership is currently paralyzed."
```

**Response:**
```yaml
response_bundle:
  faction_reactions:
    - "The Consortium will hire the Silent Choir (assassins) to wipe out the Thieves Guild in retaliation."
    - "The Thieves Guild will go to ground, making them harder for the players to contact."
  new_rumors:
    - "'I heard the Guild blew up a land-ship!'"
    - "'The price of smokeless powder just tripled in the black market.'"
  next_session_prep: "We need to stat up the Silent Choir assassins for when they inevitably cross paths with the players."
```

## Notes

- This is the engine that keeps a living sandbox moving. It forces the world to react logically to the players' chaos.
- Generating `new_rumors` provides immediate, diegetic feedback to the players in the next session.
