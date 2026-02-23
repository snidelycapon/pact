# Journey: Group Envelope Primitives (pact-fmt)

**Epic**: pact-y30 — Pact store: flat-file format, default pacts, and group addressing
**Date**: 2026-02-23
**Author**: Luna (nw-product-owner)
**Discovery**: Q1–Q15 interactive session with Cory

---

## Actors

| Actor | Description | Interface |
|-------|-------------|-----------|
| **Pact Author** | Team member writing/editing pact definitions | Text editor → git |
| **Sending Human** | Person who needs something from a group | Natural language → their agent |
| **Sending Agent** | AI agent composing and dispatching a group request | MCP tool calls (pact_discover, pact_do) |
| **Receiving Agent** | AI agent monitoring inbox and presenting requests | MCP tool calls (pact_do: inbox, claim, respond) |
| **Receiving Human** | Person deciding whether to claim and how to respond | Natural language ← their agent |

---

## Flow A: Pact Author Adds Group Defaults

**Trigger**: Team decides their `code-review` pact should be claimable by one person.
**Goal**: Update the pact definition so all future requests use the right group behavior.
**Emotional arc**: Familiar → Confident → Done

```
┌─────────────────────────────────────────────────────────────────────┐
│  A1: OPEN PACT FILE                                                │
│  Emotion: Familiar ("I know where this lives")                     │
│                                                                    │
│  Author opens pacts/code-review/PACT.md in their editor.           │
│  The file already has YAML frontmatter they've edited before.      │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  A2: ADD DEFAULTS SECTION                                          │
│  Emotion: Confident ("this is just YAML, I know what I want")      │
│                                                                    │
│  Author adds a `defaults:` block to frontmatter.                   │
│  Only fields that differ from protocol defaults are written.       │
│                                                                    │
│  ┌─── pacts/code-review/PACT.md ──────────────────────────────┐    │
│  │ ---                                                        │    │
│  │ name: code-review                                          │    │
│  │ description: Request a code review from the team           │    │
│  │ defaults:                                                  │    │
│  │   claimable: true                                          │    │
│  │ context_bundle:                                            │    │
│  │   required: [repository, branch, description]              │    │
│  │   ...                                                      │    │
│  │ ---                                                        │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                    │
│  Note: response_mode, visibility NOT specified — protocol          │
│  defaults apply (response_mode: any, visibility: shared).          │
│  Only `claimable: true` is written because it differs.             │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  A3: COMMIT AND PUSH                                               │
│  Emotion: Done ("it's live, the team gets it on next pull")        │
│                                                                    │
│  Author commits and pushes. No validation step required by PACT —  │
│  agents will nudge toward valid schema when they encounter it.     │
│  Teams can build their own auditor skills for deeper validation.   │
└─────────────────────────────────────────────────────────────────────┘
```

**Protocol Defaults (v1 — hardcoded, no frontmatter needed):**
```yaml
response_mode: any        # first response sufficient
visibility: shared        # all responses visible to all recipients
claimable: false          # no ownership claiming
```

---

## Flow B: Sending Agent Creates a Group Request

**Trigger**: Human says "Hey, can someone on backend review my auth changes?"
**Goal**: Request lands in every backend team member's inbox with correct group behavior.
**Emotional arc**: Intent → Confirmation → Confidence

```
┌─────────────────────────────────────────────────────────────────────┐
│  B1: HUMAN EXPRESSES INTENT                                        │
│  Emotion: Intent ("I need help from the team")                     │
│                                                                    │
│  Human: "Can someone on backend review my auth changes?            │
│          Branch is feature/oauth-cleanup."                         │
│                                                                    │
│  Agent recognizes: group request, code-review pact type,           │
│  @backend-team addressing.                                         │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  B2: AGENT DISCOVERS PACT + RESOLVES GROUP                         │
│  Emotion: (agent-internal, no human interaction)                   │
│                                                                    │
│  Agent calls:                                                      │
│    pact_discover(keyword: "code-review")                           │
│    → Returns pact metadata with defaults: { claimable: true }      │
│    → Protocol fills in: response_mode: any, visibility: shared     │
│                                                                    │
│  Agent resolves @backend-team → [Maria, Tomás, Kenji, Priya]      │
│  (from config.json team membership)                                │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  B3: AGENT SENDS GROUP REQUEST                                     │
│  Emotion: (agent-internal)                                         │
│                                                                    │
│  Agent calls:                                                      │
│    pact_do(action: "send",                                         │
│            request_type: "code-review",                            │
│            recipients: ["maria", "tomas", "kenji", "priya"],       │
│            context_bundle: {                                       │
│              repository: "pact",                                   │
│              branch: "feature/oauth-cleanup",                      │
│              description: "OAuth cleanup — simplified token flow"  │
│            })                                                      │
│                                                                    │
│  System creates request in pending/ with:                          │
│    recipients: [maria, tomas, kenji, priya]                        │
│    group_ref: "@backend-team"                                      │
│    defaults applied: claimable: true, response_mode: any,          │
│                      visibility: shared                            │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  B4: CONFIRMATION TO SENDER                                        │
│  Emotion: Confidence ("it's in their inboxes, I know who sees it") │
│                                                                    │
│  Agent responds to human:                                          │
│    "Sent code-review request to @backend-team                      │
│     (Maria, Tomás, Kenji, Priya). Claimable — first person         │
│     to claim will own the review. Request ID: req-20260223-..."    │
│                                                                    │
│  Human knows: who can see it, that it's claimable,                 │
│  and can check_status later.                                       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Flow C: Receiving Agent Processes a Group Request

**Trigger**: Agent polls inbox (or is asked "anything in my inbox?").
**Goal**: Human sees the request, decides to claim, agent does the work, responds.
**Emotional arc**: Awareness → Clarity → Decision → Commitment → Completion

```
┌─────────────────────────────────────────────────────────────────────┐
│  C1: INBOX CHECK                                                   │
│  Emotion: Awareness ("let me see what's pending")                  │
│                                                                    │
│  Agent calls:                                                      │
│    pact_do(action: "inbox")                                        │
│    → Returns list including direct AND group requests              │
│                                                                    │
│  ┌─── Agent presents to Kenji ─────────────────────────────────┐   │
│  │                                                             │   │
│  │  📥 Inbox (3 pending)                                       │   │
│  │                                                             │   │
│  │  1. code-review from @cory → @backend-team                  │   │
│  │     "OAuth cleanup — simplified token flow"                 │   │
│  │     ⚡ Claimable · Unclaimed · 2h ago                       │   │
│  │                                                             │   │
│  │  2. ask from @priya → @kenji (direct)                       │   │
│  │     "Where's the rate limiter config?"                      │   │
│  │     1h ago                                                  │   │
│  │                                                             │   │
│  │  3. design-pact from @maria → @backend-team                 │   │
│  │     "Event sourcing proposal for audit log"                 │   │
│  │     ⚡ Claimable · Claimed by @tomas · 4h ago               │   │
│  │                                                             │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                    │
│  Key: group addressing ("→ @backend-team") and claim status        │
│  are first-class visible metadata on every entry.                  │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  C2: HUMAN REVIEWS DETAILS                                         │
│  Emotion: Clarity ("I can see what this is about")                 │
│                                                                    │
│  Kenji: "Show me more about that code review."                     │
│  Agent shows context_bundle: repo, branch, description,            │
│  who it's from, who else is on the team, claim status.             │
│                                                                    │
│  Agent proactively asks:                                           │
│    "This is claimable and unclaimed. Would you like to             │
│     claim this review?"                                            │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  C3: HUMAN DECIDES TO CLAIM                                        │
│  Emotion: Decision → Commitment ("yeah, I'll take it")             │
│                                                                    │
│  Kenji: "Yeah, I'll take it."                                      │
│                                                                    │
│  Agent calls:                                                      │
│    pact_do(action: "claim", request_id: "req-20260223-...")        │
│                                                                    │
│  System response:                                                  │
│    ✓ Claimed by @kenji. Other recipients can see you're            │
│      working on this.                                              │
│                                                                    │
│  For other recipients (Maria, Tomás, Priya):                       │
│    Request stays in inbox, now shows "Claimed by @kenji"           │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  C4: AGENT WORKS (may take time)                                   │
│  Emotion: Focus ("someone's on it, work is happening")             │
│                                                                    │
│  Agent investigates: pulls the branch, reads the diff,             │
│  analyzes the changes, forms review comments.                      │
│  This may take significant time and tokens.                        │
│  The claim ensures no one else duplicates this work.               │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  C5: AGENT RESPONDS                                                │
│  Emotion: Completion ("done, review submitted")                    │
│                                                                    │
│  Agent calls:                                                      │
│    pact_do(action: "respond",                                      │
│            request_id: "req-20260223-...",                          │
│            response_bundle: {                                      │
│              status: "changes_requested",                          │
│              summary: "Token refresh logic looks good, but...",    │
│              blocking_feedback: [...],                             │
│              advisory_feedback: [...]                              │
│            })                                                      │
│                                                                    │
│  System: request moves pending → completed.                        │
│  Sender's agent can check_status to see the review.                │
│  (response_mode: any — first response completes the request)       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Flow D: Private Visibility Request

**Trigger**: Team lead needs independent assessments without groupthink.
**Goal**: Each recipient responds without seeing others' responses.
**Emotional arc**: Trust → Independence → Honest assessment

```
┌─────────────────────────────────────────────────────────────────────┐
│  D1: SENDER CREATES PRIVATE-VISIBILITY REQUEST                     │
│  Emotion: Trust ("I need honest, independent takes")               │
│                                                                    │
│  Human: "I need each person's independent assessment of the        │
│          new caching strategy. Don't let them see each             │
│          other's responses."                                       │
│                                                                    │
│  Agent sends with pact that has:                                   │
│    defaults:                                                       │
│      visibility: private                                           │
│      response_mode: all                                            │
│                                                                    │
│  All recipients see the request. None see others' responses.       │
│  Requester sees ALL responses.                                     │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  D2: RECIPIENT RESPONDS INDEPENDENTLY                              │
│  Emotion: Independence → Honesty ("my real opinion, uninfluenced") │
│                                                                    │
│  Each recipient's agent shows the request.                         │
│  They cannot see if others have responded or what they said.       │
│  They form their own assessment and respond.                       │
│                                                                    │
│  This is the 360-feedback model: requester collects all            │
│  perspectives, recipients are shielded from groupthink.            │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Flow E: Broadcast (FYI, No Response Expected)

**Trigger**: Team lead announces something, no action needed.
**Goal**: Information reaches everyone, no response tracking.
**Emotional arc**: Informed ("noted, nothing to do")

```
┌─────────────────────────────────────────────────────────────────────┐
│  E1: BROADCAST                                                     │
│  Emotion: Informed                                                 │
│                                                                    │
│  Pact defaults:                                                    │
│    response_mode: none_required                                    │
│    claimable: false                                                │
│                                                                    │
│  Request appears in inbox. Agent may note it to user.              │
│  No response expected. Request auto-completes (or stays            │
│  informational — protocol decides lifecycle).                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Shared Artifacts

| Artifact | Source | Consumed By |
|----------|--------|-------------|
| `${pact_defaults}` | Pact YAML frontmatter `defaults:` section | Sending agent (merge with protocol defaults), system (validation) |
| `${protocol_defaults}` | Hardcoded in PACT system | All agents (fallback when pact has no defaults) |
| `${recipients}` | Request envelope `recipients[]` field | Inbox filtering, claim tracking, response routing |
| `${group_ref}` | Request envelope `group_ref` field | Inbox display ("→ @backend-team") |
| `${claim_status}` | Request state (who claimed, when) | Inbox display, duplicate-work prevention |
| `${response_mode}` | Merged defaults → request | System (when to mark request complete) |
| `${visibility}` | Merged defaults → request | System (whether to expose others' responses) |

---

## Integration Checkpoints

| Checkpoint | Between | Validates |
|------------|---------|-----------|
| IC1: Defaults merge | pact_discover → pact_do:send | Protocol defaults + pact defaults produce valid merged config |
| IC2: Group resolution | config.json → pact_do:send | Group ref resolves to valid user IDs |
| IC3: Inbox filtering | pact_do:send → pact_do:inbox | Group requests appear for all recipients |
| IC4: Claim exclusivity | pact_do:claim → pact_do:claim | Second claim on exclusive request fails gracefully |
| IC5: Claim visibility | pact_do:claim → pact_do:inbox | Claimed status visible to all recipients |
| IC6: Response routing | pact_do:respond → visibility | Private responses hidden from other respondents |
| IC7: Completion | pact_do:respond → response_mode | Request completes according to mode (any=first, all=last) |

---

## Key Design Decisions from Discovery

1. **Claim is a separate action** — not first-response-wins. Claim before work.
2. **Claimable is binary** — exclusive or not. No "open claim" / multi-claim.
3. **Quorum deferred** — 3 response modes for v1: any, all, none_required.
4. **Convention over configuration** — pact files omit fields that match protocol defaults.
5. **PACT is apathetic** — no per-response tracking ("who hasn't responded"), no enforcement.
6. **Pact inheritance deferred** — flagged for future DISCOVER. v1 is flat overrides only.
7. **Agents nudge, don't enforce** — validation is advisory, teams build their own auditor skills.
