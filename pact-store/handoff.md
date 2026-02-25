---
name: handoff
description: Transfer ownership of in-progress work
version: "1.0.0"
scope: global

when_to_use:
  - You're handing off work you started but can't or shouldn't finish
  - Ownership needs to transfer cleanly with full context
  - The recipient needs to continue where you left off, not start fresh

multi_round: false

context_bundle:
  required: [work_item, current_state, next_steps]
  fields:
    work_item: { type: string, description: "What's being handed off — be specific" }
    current_state: { type: string, description: "Where the work stands right now" }
    next_steps: { type: array, description: "What needs to happen next, in order" }
    gotchas: { type: array, description: "Pitfalls, blockers, or non-obvious context" }
    references: { type: array, description: "Links, files, or docs the recipient needs" }

response_bundle:
  required: [accepted]
  fields:
    accepted: { type: boolean, description: "Whether the recipient accepts the handoff" }
    questions: { type: array, description: "Clarifying questions before starting" }
    revised_plan: { type: string, description: "Any changes to next_steps the recipient plans" }
---

# Handoff

## Example

**Request:**
```yaml
context_bundle:
  work_item: "Migration of user table from MySQL to PostgreSQL"
  current_state: "Schema is translated and tested. Data migration script is written but untested against production volume. Dual-write is not implemented yet."
  next_steps:
    - "Test migration script against prod-sized dataset (50M rows)"
    - "Implement dual-write adapter in UserRepository"
    - "Run shadow reads for 1 week to validate consistency"
    - "Cut over with feature flag"
  gotchas:
    - "The migration script assumes UTC timestamps — prod has some rows in EST from 2019"
    - "UserRepository has 3 callers that bypass the repository pattern (grep for raw SQL)"
  references:
    - "Migration script: scripts/migrate-users.sql"
    - "Schema diff: docs/pg-migration/schema-diff.md"
    - "ADR: docs/adr/adr-012-pg-migration.md"
```

**Response:**
```yaml
response_bundle:
  accepted: true
  questions:
    - "Do the 3 raw SQL callers need to be fixed before or after dual-write?"
  revised_plan: "I'll fix the raw SQL callers first so dual-write has a single code path. Otherwise same plan."
```

## Notes

- For group handoffs (relay chain), send to the group. The first agent to respond with `accepted: true` takes ownership.
- If you're asking someone to do new work rather than continue yours, use `request`.
