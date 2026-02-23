# Lean Canvas: Group Envelope Primitives Cost-Benefit

**Date**: 2026-02-23
**Researcher**: Scout (Product Discovery Facilitator)
**Scope**: Cost-benefit analysis for each group primitive proposed for pact-fmt

---

## Current State

PACT's format spec supports 1-to-1 requests only. The format specification (pact-format-spec.md) defines:
- YAML frontmatter as machine contract
- context_bundle / response_bundle for typed fields
- scope + registered_for for visibility
- Compressed catalog entries for token efficiency

**What's missing**: Any mechanism for addressing groups, collecting multiple responses, or controlling response visibility across multiple respondents.

---

## Change 1: defaults Section in Frontmatter

**Who benefits**: Pact authors (define group behavior once), agents (know the rules without parsing each request).

| Dimension | Assessment |
|---|---|---|
| Format cost | 4 lines of YAML. ~20 tokens. |
| Complexity cost | LOW. A new top-level section with 4 fields. No nested structures. |
| Token cost (catalog) | ~5-8 additional tokens per catalog entry if defaults are included in compressed format. |
| Risk if we ADD it | Low. Pacts without `defaults` behave as today. Purely additive. |
| Risk if we OMIT it | Medium. Without pact-level defaults, every group request must specify response_mode, visibility, etc. This creates per-request overhead and inconsistency. |

**Validated by**: GitHub branch protection (repo-level defaults), Jira project workflows, Apache project bylaws, Slack channel settings.

**Token budget**:

```yaml
# Cost: ~20 tokens
defaults:
  response_mode: any
  visibility: shared
  deadline_required: false
  claimable: false
```

At 100 pacts, adding defaults to frontmatter costs ~2,000 additional tokens (100 x 20). But defaults are only loaded when a specific pact is retrieved (not in the catalog), so the actual cost is ~20 tokens per interaction -- negligible.

**Verdict**: ADD. Low cost, high agent utility, universally validated.

---

## Change 2: response_mode Field

**Who benefits**: Agents deciding how to handle group requests. The protocol engine deciding when a request is "complete."

| Dimension | Assessment |
|---|---|---|
| Format cost | 1 enum field + 1 optional integer (quorum_threshold). ~5 tokens in frontmatter. |
| Complexity cost | LOW for format. MEDIUM for protocol -- the lifecycle engine must support 4 completion modes. |
| Token cost (catalog) | ~3-5 tokens to add mode abbreviation to catalog entry. |
| Risk if we ADD it | Low. Single enum with clear semantics. 4 values, all validated. |
| Risk if we OMIT it | HIGH. Without response_mode, all group pacts are implicitly "wait for everyone," which is wrong for ~70% of use cases (questions, support, triage). |

**Validated by**: Jira (all/any/N approvers), GitHub (required reviews count), PagerDuty (first-acknowledge), Apache (3 +1 votes), IETF (rough consensus).

**Verdict**: ADD. The most critical group primitive. Without it, group pacts cannot be correctly processed.

---

## Change 3: visibility Field

**Who benefits**: Respondents (know if others can see their response), agents (know if they should reference other responses).

| Dimension | Assessment |
|---|---|---|
| Format cost | 1 enum field. ~3 tokens in frontmatter. |
| Complexity cost | LOW for format. MEDIUM for protocol -- private visibility requires separate response storage per respondent. |
| Token cost (catalog) | ~2-3 tokens to add visibility to catalog entry. |
| Risk if we ADD it | Low. 2 values (shared, private). Clean semantics. |
| Risk if we OMIT it | Medium. Most group pacts work with shared visibility. Private visibility matters for ~15% of use cases (independent assessment, 360 feedback). Could be added later without breaking change. |

**Validated by**: Email CC/BCC (40+ years), 360 feedback (HR industry standard), academic blind review.

**Verdict**: ADD with 2 modes only. Defer sequential and private_then_shared.

---

## Change 4: claimable Field

**Who benefits**: Teams using PACT for support/triage workflows where one person should own a request from a pool.

| Dimension | Assessment |
|---|---|---|
| Format cost | 1 boolean field. ~3 tokens in frontmatter. |
| Complexity cost | LOW for format. LOW for protocol if claiming = first response. MEDIUM if claiming requires a separate protocol action. |
| Token cost (catalog) | ~1-2 tokens to add claimable flag to catalog entry. |
| Risk if we ADD it | Low. Boolean flag, clear semantics, no new protocol actions needed (v1: first response = claim). |
| Risk if we OMIT it | Medium. Support/triage is a common pattern. Without claimable, two agents might both start working on the same request, wasting effort. |

**Validated by**: PagerDuty acknowledge, Zendesk ticket claiming, Linear triage, Freshdesk round-robin assignment.

**Verdict**: ADD. Low cost, prevents duplicate work in group scenarios.

---

## Change 5: Compressed Catalog Entry Extension

**Who benefits**: Agents scanning the catalog to select the right pact for a group request.

| Dimension | Assessment |
|---|---|---|
| Format cost | ~5-10 tokens per entry. |
| Complexity cost | LOW. Appending a field to the pipe-delimited format. |
| Token cost (100 pacts) | Current: ~2,000 tokens. Extended: ~2,500-3,000 tokens. Delta: ~500-1,000 tokens (0.25-0.5% of 200k context). |
| Risk if we ADD it | Low. Backward-compatible extension. Older parsers ignore extra fields. |
| Risk if we OMIT it | Low-Medium. Agents can still retrieve full pact to check defaults. But this adds one extra retrieval step for group pact selection. |

**Token cost comparison**:

```
# Current format (~20 tokens per entry)
code-review|structured PR review with blocking/advisory feedback|org|repository,branch,language,description->status,summary,blocking_feedback

# Extended format (~25 tokens per entry)
code-review|structured PR review with blocking/advisory feedback|org|repository,branch,language,description->status,summary,blocking_feedback|all/shared

# Extended with claimable (~27 tokens per entry)
support-request|team support request for any available agent|team|question,context->answer,resolution|any/shared/claimable
```

Delta per entry: ~5-7 tokens. At 100 entries: ~500-700 additional tokens. This is well within the budget (0.35% of 200k context).

**Verdict**: ADD. Negligible token cost, meaningful agent utility for pact selection.

---

## Change 6: Litmus Test Tightening

**Who benefits**: Pact authors (clearer guidance on when to create a pact), agents (clearer decision boundary for pact vs message).

| Dimension | Assessment |
|---|---|---|
| Format cost | Zero. Documentation only, not schema change. |
| Complexity cost | Zero. Advisory guidance. |
| Token cost | Zero in catalog. Minor increase in spec body (~50-100 tokens). |
| Risk if we ADD it | Low. Tighter criteria may discourage some legitimate pact use cases. But the criteria are advisory, not enforced. |
| Risk if we OMIT it | Low-Medium. Without clear criteria, teams may create pacts for trivial interactions (yes/no confirmations, simple acks). |

**Verdict**: ADD. Zero cost, improves spec quality.

---

## Aggregate Cost Summary

| Change | Frontmatter Tokens | Catalog Tokens (x100) | Protocol Complexity | Recommendation |
|---|---|---|---|---|
| defaults section | +20 | +0 (not in catalog) | None (format only) | ADD |
| response_mode | +5 | +300-500 | Medium (4 completion modes) | ADD |
| visibility | +3 | +200-300 | Medium (response isolation) | ADD (2 modes) |
| claimable | +3 | +100-200 | Low (first response = claim) | ADD |
| Catalog extension | +0 | +500-700 | None (format only) | ADD |
| Litmus test | +0 | +0 | None (docs only) | ADD |
| **Total** | **+31** | **+1,100-1,700** | **Medium** | |

**Total token overhead**:
- Per-pact frontmatter: +31 tokens (~9% increase on a typical 350-token frontmatter)
- Catalog for 100 pacts: +1,100-1,700 tokens (from ~2,000 to ~3,700 tokens; still 1.85% of 200k context)
- Format spec body: +100-200 tokens (documentation)

**Agent reasoning overhead** (per-request, not in token budget above):
- When composing a group request, an agent reasons about response_mode (~5 tokens), visibility (~3 tokens), claimable (~2 tokens), and defaults interaction (~5 tokens)
- Total per group request: ~15 tokens of decision-making overhead
- At 10 group pacts per session: ~150 tokens
- This is manageable but real — agents will spend meaningful tokens reasoning about these primitives

**Conclusion**: The aggregate token cost is well within budget. Even at 100 pacts, the catalog costs less than 2% of context. Including agent reasoning overhead (~150 tokens/session), the total cost remains under 2.1%. The protocol complexity is concentrated in response_mode (4 completion modes) and visibility (response isolation for private mode) -- both of which are standard patterns in the systems analyzed.

---

## What-If Scenarios

### What if we add all 4 visibility modes instead of 2?

| Mode | Additional Cost | Additional Complexity | Frequency of Use |
|---|---|---|---|
| sequential | +0 (already modeled by multi_round) | Medium (ordering enforcement) | Rare (~5% of group requests) |
| private_then_shared | +0 (2-phase workflow) | High (phase transition logic) | Rare (~3% of group requests) |

Adding sequential and private_then_shared doubles the visibility enum from 2 to 4 values but adds significant protocol complexity for patterns used less than 10% of the time. The cost-benefit is unfavorable.

### What if we add watchers / CC recipients?

| Addition | Cost | Benefit |
|---|---|---|
| `watchers` field in request envelope | ~5 tokens per request | Stakeholder visibility without response obligation |

This is valuable but is a protocol concern (request envelope), not a format concern (pact definition). The format spec does not need to change. The protocol can add `watchers` independently.

### What if we defer ALL group primitives?

| Risk | Impact | Timeframe |
|---|---|---|
| Team deployment without group addressing | HIGH -- teams of 10-12 cannot use PACT for team-level requests | Immediate (deployment target) |
| Agents cannot compose group requests | HIGH -- agents have no frontmatter guidance for group behavior | Immediate |
| Duplicate work from uncoordinated responses | MEDIUM -- two agents work on same request without claiming | First week of team usage |

**Deployment impact by primitive**:

| Change | Deployment Blocking? | Justification |
|---|---|---|
| defaults + response_mode | **YES** | Cannot deploy without; teams don't know when a group pact is done |
| visibility (shared/private) | NO (but HIGH value) | Deployable without; 360/audit workflows can't run, but most group pacts work with shared |
| claimable | NO (but MEDIUM value) | Deployable without; support teams use workarounds (manual coordination) |

**Doing nothing is not viable** for `defaults` and `response_mode` — these are deployment prerequisites. `visibility` and `claimable` are high-value additions that should ship with v1 but are not strictly blocking.

---

## Risk Map

```
              Probability of Needing It (within deployment)
                 LOW                        HIGH
            +-------------------+-------------------+
            |                   |                   |
  HIGH      | private_then_     | (nothing high-    |
  Cost      | shared visibility | cost is needed)   |
            | sequential viz    |                   |
            |                   |                   |
            +-------------------+-------------------+
            |                   |                   |
  LOW       | watchers/CC       | response_mode     |
  Cost      | multi-group addr  | visibility (2)    |
            | veto semantics    | claimable          |
            |                   | defaults section   |
            |                   | catalog extension  |
            +-------------------+-------------------+
```

Everything PACT needs for v1 sits in the bottom-right quadrant: low cost, high probability of need. Everything in the top-left or bottom-left can wait.

---

## Sources

- Token cost estimates based on Vercel AGENTS.md research cited in pact-format-spec.md
- System evidence from solution-testing.md cross-reference
- Deployment target from product owner interview (2026-02-22): ~100 users, teams of 10-12, 20-30 repos
