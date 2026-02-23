# Opportunity Tree: Group Envelope Primitives

**Date**: 2026-02-23
**Researcher**: Scout (Product Discovery Facilitator)
**Context**: Scoring each proposed group envelope primitive for inclusion in pact-fmt

---

## Desired Outcome

Extend the pact format specification with group addressing primitives that enable multi-recipient requests, response collection, and visibility control -- while keeping the format simple enough that agents can compose valid group requests from frontmatter alone.

---

## Scoring Criteria

Each opportunity scored on 4 dimensions (1-5 each, max 20):

| Dimension | Meaning |
|---|---|
| **Problem Evidence** | Real-world systems use this pattern. Past behavior, not speculation. |
| **Agent Utility** | Does this help agents compose or handle group pacts correctly? |
| **Format Simplicity** | Can this be expressed concisely in YAML frontmatter? |
| **Incrementality** | Can this be added without breaking existing 1-to-1 pacts? |

---

## GE1: response_mode (all, any, quorum, none_required)

**Score: 19/20**

| Dimension | Score | Evidence |
|---|---|---|
| Problem Evidence | 5 | All 4 modes map to real systems: GitHub required reviews (all/quorum), PagerDuty acknowledge (any), Apache lazy consensus (none_required), Jira approval workflows (all/any/N) |
| Agent Utility | 5 | An agent MUST know response_mode to decide behavior: "Should I respond to this? Am I the only one who needs to? How many others are expected?" |
| Format Simplicity | 5 | Single enum field: `response_mode: any`. Quorum adds one integer field: `quorum_threshold: 3` |
| Incrementality | 4 | Existing 1-to-1 pacts are implicitly `response_mode: all` with one recipient. No breaking change. But the protocol must handle multi-response collection (new lifecycle logic). |

**What to add to the format spec**:

```yaml
defaults:
  response_mode: any  # any | all | quorum | none_required

# When response_mode: quorum
quorum_threshold: 3   # integer: minimum responses needed
```

**Lifecycle implications**:
- `any`: Pact completes when first response arrives
- `all`: Pact completes when all recipients have responded
- `quorum`: Pact completes when N responses arrive (N = quorum_threshold)
- `none_required`: Pact completes immediately on send (broadcast)

---

## GE2: visibility (private, shared)

**Score: 17/20**

| Dimension | Score | Evidence |
|---|---|---|
| Problem Evidence | 5 | Email CC/BCC (40+ years), 360 feedback (private), GitHub PR comments (shared), Google Docs comments (shared + private add-on) |
| Agent Utility | 4 | Agents need to know if they can reference other responses when composing theirs. With `visibility: private`, an agent must ignore other responses. |
| Format Simplicity | 5 | Single enum field: `visibility: shared`. Two values, no additional fields needed. |
| Incrementality | 3 | Shared is current behavior (1-to-1 is inherently shared between sender+recipient). Private requires response isolation in the protocol. |

**What to add to the format spec**:

```yaml
defaults:
  visibility: shared  # shared | private
```

**Protocol implications**:
- `shared`: All responses stored in the same location, readable by all recipients
- `private`: Each response stored separately, readable only by the sender (requester)

**Deferred (v2)**:
- `sequential`: Better modeled by `multi_round: true`
- `private_then_shared`: Two-phase workflow, not a primitive

---

## GE3: claimable

**Score: 16/20**

| Dimension | Score | Evidence |
|---|---|---|
| Problem Evidence | 5 | PagerDuty acknowledge, Zendesk/Freshdesk ticket claiming, Linear triage, Slack emoji reactions as claims |
| Agent Utility | 4 | An agent receiving a `claimable: true` pact knows to claim before starting work, preventing duplicate effort |
| Format Simplicity | 4 | Single boolean field: `claimable: false`. Clean. But interaction with response_mode needs documentation. |
| Incrementality | 3 | Existing 1-to-1 pacts do not need claiming. Adding claiming requires protocol support for a "claimed" state or treating first response as implicit claim. |

**What to add to the format spec**:

```yaml
defaults:
  claimable: false  # boolean
```

**Behavioral semantics**:
- `claimable: true` + `response_mode: any`: First response claims AND resolves
- `claimable: true` + `response_mode: all`: First response claims ownership; all still respond
- `claimable: false`: No ownership transfer; responses are independent

**v1 simplification**: Claiming = first response. No separate "claim" action needed. This covers PagerDuty (acknowledge = first response), support tickets (pick up = first response), and triage (assign to self = first response).

---

## GE4: defaults section

**Score: 18/20**

| Dimension | Score | Evidence |
|---|---|---|
| Problem Evidence | 5 | GitHub branch protection (repo-level), Jira project workflows (project-level), Apache project bylaws (project-level), Slack channel settings (channel-level) |
| Agent Utility | 5 | The `defaults` section tells agents: "When you encounter this pact type, here are the rules." No need to parse each individual request for group behavior. |
| Format Simplicity | 4 | YAML map with 4 fields. Clean, but adds a section to frontmatter. |
| Incrementality | 4 | Existing pacts simply have no `defaults` section. Adding it is purely additive. Pacts without `defaults` behave as today (1-to-1 implicit). |

**What to add to the format spec**:

```yaml
defaults:
  response_mode: any
  visibility: shared
  deadline_required: false
  claimable: false
```

**Override semantics**: Senders may override defaults per-request. The defaults section documents the pact type's intended behavior. If a sender omits group fields, defaults apply.

---

## GE5: Group Addressing (recipients list, group ref)

**Score: 17/20**

| Dimension | Score | Evidence |
|---|---|---|
| Problem Evidence | 5 | Email distribution lists, GitHub CODEOWNERS team assignment, Jira group assignment, Slack @channel, PagerDuty escalation policies |
| Agent Utility | 5 | Agents must know HOW to address a group request: list of user IDs? team reference? Both? |
| Format Simplicity | 3 | Multiple addressing modes add complexity: `recipients: [alice, bob]` vs `group: @backend-team`. Need clear rules. |
| Incrementality | 4 | Existing `recipient` field (singular) extends naturally to `recipients` (plural) or `group`. |

**What to add to the format spec**:

This belongs in the request envelope (protocol), not the pact definition (format). The pact definition declares defaults and whether group addressing is supported. The request specifies the actual recipients.

In the pact format spec, the relevant addition is:

```yaml
# In the pact definition, document group addressing capability
when_to_use:
  - "Send to a team when you need group review"

defaults:
  response_mode: all  # implies group addressing is expected
```

In the request envelope (protocol layer), the addressing would be:

```yaml
# Request envelope (not pact format -- protocol concern)
recipient: "@backend-team"    # group ref (resolved by config)
# OR
recipients:                    # explicit list
  - alice
  - bob
  - carol
```

**Recommendation**: The pact format spec should document that `response_mode`, `visibility`, and `claimable` exist as defaults. The actual recipient addressing is a protocol concern (request envelope schema), not a format concern.

---

## GE6: Compressed Catalog Entry (with group fields)

**Score: 15/20**

| Dimension | Score | Evidence |
|---|---|---|
| Problem Evidence | 4 | Vercel AGENTS.md research proved 80% compression with zero accuracy loss. Token cost at 100 pacts validated in format spec. |
| Agent Utility | 4 | Agents selecting pacts need to know if a pact supports group addressing. But response_mode/visibility are detail-level fields -- not needed for initial pact selection. |
| Format Simplicity | 3 | Adding group fields to the pipe-delimited format increases entry size. Trade-off: more info per entry vs more tokens per entry. |
| Incrementality | 4 | Additive change to catalog format. Existing entries still valid. |

**Current format**:
```
name|description|scope|context_required->response_required
```

**Proposed extension**:
```
name|description|scope|context_required->response_required|defaults
```

Where `defaults` is a compact representation like `any/shared` or `all/private/claimable`.

**Token cost analysis** (see Lean Canvas for detailed numbers):
- Current entry: ~15-25 tokens
- With defaults suffix: ~20-30 tokens
- 100 entries overhead: ~500 additional tokens (negligible at 0.25% of 200k context)

**Recommendation**: Include `defaults` in catalog entry. The cost is negligible and it helps agents select the right pact for group vs individual requests.

---

## GE7: Litmus Test Tightening

**Score: 14/20**

| Dimension | Score | Evidence |
|---|---|---|
| Problem Evidence | 3 | No formal evidence that the current litmus test is insufficient. But group addressing makes the boundary fuzzier -- is a broadcast FYI really a "pact"? |
| Agent Utility | 4 | A tightened litmus test helps agents decide when to use a pact vs a simple message. Critical for agent autonomy. |
| Format Simplicity | 5 | Not a format change -- it is documentation in the spec body. |
| Incrementality | 5 | Non-breaking. Purely advisory. |

**Current litmus test** (implicit from existing pact design):
- Request has structured context (typed fields)
- Response has structured content (typed fields)
- Multi-round is optional

**Proposed tightened litmus test**:
1. **Agent does meaningful work on both sides.** The sender's agent assembles structured context; the recipient's agent produces a substantive response. A "yes/no" acknowledgment is not a pact -- it is a notification.
2. **Context is too rich for a text message.** If the request can be fully expressed in 1-2 sentences with no structured fields, it is a message, not a pact.
3. **Both sides do creative/intellectual work.** The sender is not just forwarding data; they are framing a question or request. The recipient is not just acknowledging; they are analyzing, reviewing, or producing output.

**Group addressing implications**: `response_mode: none_required` (broadcast) weakens criterion #1 because the recipient does NOT do meaningful work -- they just receive. This suggests that `none_required` broadcasts are a boundary case. They are valid pacts (structured format, audit trail) but they do not represent the core pact value proposition. The litmus test should note this explicitly.

---

## Priority Matrix

```
                    Evidence Quality
                 LOW                HIGH
            +----------+----------+
            |          |          |
  HIGH      | GE7      | GE1     |  <-- Do now
  Agent     | (litmus) | GE2     |
  Value     |          | GE4     |
            |          | GE5     |
            +----------+----------+
            |          |          |
  LOW       |          | GE6     |  <-- Do when convenient
  Agent     |          | GE3     |
  Value     |          |         |
            |          |          |
            +----------+----------+
```

Note: All opportunities score high on evidence because they are well-validated by cross-system analysis. The differentiation is in agent utility -- how much does each primitive help agents make better decisions?

---

## Recommended Sequencing

### Include in pact-fmt v1 (this task)

1. **GE4: defaults section** -- The container for all group primitives. Must come first.
2. **GE1: response_mode** -- The most impactful primitive. 4 clear modes, high agent utility.
3. **GE2: visibility** -- 2 modes (shared, private). Clean, well-validated.
4. **GE3: claimable** -- Boolean flag. Simple. Works with response_mode.
5. **GE5: Group addressing documentation** -- Clarify that addressing is protocol-layer, defaults are format-layer.
6. **GE6: Catalog entry extension** -- Add defaults to compressed format.
7. **GE7: Litmus test** -- Advisory guidance in spec body (not enforced; see note below).

**Note on GE7 (Litmus Test)**: The tightened litmus test is **advisory documentation only**, not a runtime enforcement mechanism. It guides pact authors on when a structured pact is the right tool vs. a simple message. The three criteria ("agent does meaningful work on both sides," "context too rich for a text," "both sides doing creative/intellectual work") are design heuristics, not measurable thresholds. They belong in the spec body's Notes section, not in frontmatter or validation logic. If measurable criteria emerge in practice (e.g., "pacts with <3 context fields tend to be messages"), they can be formalized in v2.

### Defer to v2

- `visibility: sequential` -- Model with `multi_round: true` instead
- `visibility: private_then_shared` -- Two-phase workflow, not a primitive
- Multi-group addressing with per-group response_mode
- Watchers / CC recipients (informed observers, protocol concern not format concern)
- Veto semantics (-1 blocks)
- Response invalidation (dismiss stale)
- Separate "claim" action (v1: first response = claim)

### Deferred Mode Implementation Paths (v1 Workarounds)

For agents who need sequential or private-then-shared behavior in v1:

**Sequential visibility** (responses build on each other):
- Use `multi_round: true` with explicit round progression
- The requester controls sequencing: share round N's response before soliciting round N+1
- Limitation: not enforced by the protocol; agents must coordinate manually
- **Revisit trigger**: >20% of group pacts express need for round-based ordering

**Private-then-shared visibility** (respond independently, then discuss):
- Phase 1: Create pact with `visibility: private` + `response_mode: all`
- Phase 2: After all responses arrive, requester creates a follow-up pact with `visibility: shared` that references the collected responses
- Limitation: two pacts instead of one; not atomic
- **Revisit trigger**: >10% of `visibility: private` pacts are followed by a "share all responses" step

**Multi-group addressing** (different response_mode per group):
- Create separate pacts for each group (one `code-review` to `@frontend`, one to `@security`)
- Requester orchestrates aggregation manually
- Limitation: not atomic; requester bears coordination cost
- **Revisit trigger**: >25% of group pacts are multi-group; token cost of multi-group schema extension is sized at ~15 tokens per additional group in catalog

---

## Key Insight

The 4 response modes, 2 visibility modes, 1 claim flag, and a defaults section give PACT **16 meaningful combinations** (4 x 2 x 2). Of these, approximately 6-8 are commonly used in real-world systems:

| Combination | Real-World Pattern | Example |
|---|---|---|
| any + shared + not claimable | Team question | "Does anyone know X?" |
| any + shared + claimable | Support ticket / on-call | PagerDuty incident |
| all + shared + not claimable | Code review sign-off | GitHub required reviews |
| all + private + not claimable | Independent assessment | 360 feedback, security audit |
| quorum + shared + not claimable | Architecture decision | ADR approval, RFC vote |
| none_required + shared + not claimable | Broadcast / FYI | Status update, announcement |

This small set of combinations covers the vast majority of group coordination patterns observed across 6 real-world systems. The format is expressive without being complex.
