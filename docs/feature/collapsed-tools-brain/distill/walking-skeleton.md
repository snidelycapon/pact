# Walking Skeleton: Collapsed Tools + Declarative Brain

**Feature**: collapsed-tools-brain
**Wave**: DISTILL
**Date**: 2026-02-22

---

## Walking Skeleton Strategy

Two walking skeletons prove the collapsed MCP surface is functional end-to-end. Together they answer: **"Can an agent discover what's available and perform actions through the 2-tool surface?"**

### WS-1: Discovery (pact-discover.test.ts)

**User goal**: An agent discovers available request types and team members so it knows what it can do and who it can reach.

**Scenario**: "Agent discovers available request types and team members from YAML pacts"

**Journey**:
1. Pacts installed as YAML frontmatter PACT.md files (3 pacts: ask, code-review, sanity-check)
2. Agent calls `pact_discover` with no query
3. Response includes all 3 pacts sorted alphabetically with structured metadata
4. Response includes team members (alice, bob)

**Observable outcomes**:
- Pacts array has 3 entries with correct names
- Each pact has description and when_to_use parsed from YAML frontmatter
- Each pact has context_bundle with required fields and field definitions (type + description)
- Team array has 2 members with user_id and display_name

**Why this is user-centric**: An agent receiving this response has everything needed to compose a request — it knows the pacts, the fields, and the recipients. One round-trip to go from "I know nothing" to "I can act."

### WS-2: Action Dispatch (pact-do.test.ts)

**User goal**: An agent sends a request to a teammate, and the recipient can see it in their inbox — all through `pact_do`.

**Scenario**: "Agent sends a request to a teammate and the recipient sees it in their inbox"

**Journey**:
1. Pacts installed as YAML frontmatter format
2. Alice's agent calls `pact_do({ action: "send", ... })` with a sanity-check request to Bob
3. Result confirms pending status and returns request_id
4. Request file created in `requests/pending/` with correct envelope
5. Bob's agent calls `pact_do({ action: "inbox" })`
6. Bob's inbox contains Alice's request

**Observable outcomes**:
- Send result has status "pending" and message "Request submitted"
- Envelope has correct sender, recipient, request_type, context_bundle
- Inbox shows 1 request with matching request_id and sender "Alice"

**Why this is user-centric**: This proves the core collaboration loop works through the collapsed surface — send and receive. A stakeholder can understand this scenario without technical context.

---

## Skeleton-to-Milestone Progression

```
WS-1 (discover) ──┬── Milestone 1: Catalog details
                   ├── Milestone 2: Filtering
                   └── Milestone 3: Error resilience

WS-2 (do)     ────┬── Milestone 4: All 7 actions
                   └── Milestone 5: Error handling
```

After both walking skeletons pass, milestones are enabled one scenario at a time (`.skip` removed) following Outside-In TDD.

---

## Litmus Test

Each walking skeleton passes the Quinn litmus test:
- **Stakeholder-demonstrable?** Yes — "The agent discovers 3 pacts and 2 team members" / "Alice sends Bob a request and he sees it"
- **User-centric value?** Yes — agent can discover capabilities and perform the core collaboration loop
- **Observable outcome?** Yes — catalog shape, request file on disk, inbox contents
- **Through driving ports?** Yes — `createPactServer().callTool()` is the hexagonal boundary
