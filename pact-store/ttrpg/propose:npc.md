---
name: propose:npc
extends: propose
description: Fleshing out a key Non-Player Character (NPC) for the sandbox
version: "1.0.0"
scope: ttrpg

when_to_use:
  - You need to design a major antagonist, patron, or wildcard character
  - You want to ensure an NPC has enough depth to react organically to player actions
  - You are populating a specific location with movers and shakers

context_bundle:
  required: [npc_name, role, drive]
  fields:
    npc_name: { type: string, description: "Name and title" }
    role: { type: string, description: "Their function in the world (e.g., 'Captain of the Guard', 'Smuggler King')" }
    drive: { type: string, description: "What do they want above all else?" }
    line_not_crossed: { type: string, description: "What is the one thing they will never do to get what they want?" }
    secrets: { type: array, description: "Things they are hiding from the public (or the players)" }

response_bundle:
  required: [assessment]
  fields:
    plot_hooks: { type: array, description: "Ways the players might interact with or be hired by them" }
    faction_ties: { type: array, description: "How they connect to the broader political web" }
    suggested_changes: { type: array, description: "Tweaks to make them more memorable or integrated" }
---

# Major NPC Proposal

## Example

**Round 1 — Request:**
```yaml
context_bundle:
  npc_name: "Silas Vance, the 'Coin-Clipper'"
  role: "Quartermaster of the City Watch"
  drive: "To amass enough wealth to buy his family's way back into the nobility."
  line_not_crossed: "He will never harm a child, no matter the payout."
  secrets: ["He is secretly funding the Thieves Guild to justify a larger budget for the Watch."]
  round: 1
```

**Round 1 — Response:**
```yaml
response_bundle:
  assessment: "viable"
  plot_hooks:
    - "Players could be hired by Silas to investigate the Thieves Guild, only to realize he's setting them up as fall guys."
  faction_ties:
    - "If he's funding the Thieves Guild, maybe the Guildmaster is actually his disgraced brother?"
  ready: false
```

## Notes

- The `line_not_crossed` is a crucial GM tool—it dictates how the NPC will behave when backed into a corner by the players.
- Focuses on the NPC as an active agent in the sandbox, not just a static quest-giver.
