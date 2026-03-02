---
name: propose:faction
extends: propose
description: Pitch a new faction, guild, or political entity for the world sandbox
version: "1.0.0"
scope: ttrpg

when_to_use:
  - You are fleshing out the political landscape of a region
  - You want to introduce a new power player (e.g., a merchant guild, a cult, a noble house)
  - You need to ensure the new faction creates interesting friction with existing ones

context_bundle:
  required: [faction_name, core_belief, goals]
  fields:
    faction_name: { type: string, description: "Name and type (e.g., 'The Iron Consortium - Artificer Guild')" }
    core_belief: { type: string, description: "The ideology that unites them" }
    goals: { type: array, description: "What they are actively trying to achieve in the world right now" }
    assets: { type: array, description: "What gives them power (e.g., 'Monopoly on smokeless powder', 'Hidden assassin network')" }
    friction_points: { type: array, description: "Which existing factions they naturally oppose or ally with" }

response_bundle:
  required: [assessment]
  fields:
    integration_ideas: { type: array, description: "Ways to tie them deeper into the existing lore" }
    missing_vulnerabilities: { type: string, description: "What is their fatal flaw or weakness?" }
    suggested_changes: { type: array, description: "Tweaks to their goals or assets to make them fit better" }
---

# Faction Proposal

## Example

**Round 1 — Request:**
```yaml
context_bundle:
  faction_name: "The Silent Choir - Assassin Cult"
  core_belief: "Words are the source of all lies; truth is only found in silence and death."
  goals:
    - "Assassinate the Orator of the High Council"
    - "Establish a stronghold in the lower wards of Oakhaven"
  assets: ["Immunity to magical charm", "A network of mute informants"]
  friction_points: ["They naturally oppose the Bardic College (who value spoken history)"]
  round: 1
```

**Round 1 — Response:**
```yaml
response_bundle:
  assessment: "needs-work"
  integration_ideas: ["What if the Orator they are trying to kill is secretly using them to eliminate his rivals?"]
  missing_vulnerabilities: "They seem too powerful. If they can't be charmed and don't speak, how are they recruited? Maybe they require a rare alchemical substance to maintain their immunity?"
  ready: false
```

## Notes

- Focuses on "friction"—good sandbox design requires factions that naturally bump into each other.
- The `missing_vulnerabilities` field ensures factions aren't pitched as invincible "Mary Sues."
