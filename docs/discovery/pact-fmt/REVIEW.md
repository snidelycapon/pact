# Product Discovery Review: Group Envelope Primitives for pact-fmt

**Reviewer**: Product Discovery Reviewer
**Date**: 2026-02-23
**Scope**: Comprehensive review of 5 discovery artifacts for the pact-fmt task
**Verdict**: **CONDITIONAL-GO** — Ship with critical revisions

---

## Executive Summary

The discovery work is **90% solid** with strong evidence backing the core primitives (`response_mode`, `visibility`, `claimable`, `defaults`). However, there are **3 critical gaps** and **2 bold assumptions** that require explicit validation before handoff to implementation:

1. **CRITICAL**: The "claiming" semantics are underspecified for concurrent claims
2. **CRITICAL**: The deferred visibility modes lack a transition design
3. **CRITICAL**: The litmus test tightening is advisory, not actionable
4. **HIGH**: Token cost analysis omits rendering overhead
5. **HIGH**: "Sequential" and "private_then_shared" deferral lacks clear exit criteria

**Recommendation**: Fix the three critical gaps, document one high-priority assumption, and ship. Do NOT defer litmus test changes without implementation intent.

---

## Artifact-by-Artifact Review

### 1. problem-validation.md

**Purpose**: Validate that 4 response modes and 3 visibility concepts map to real-world coordination patterns

**Evidence Quality**: HIGH
**Completeness**: MEDIUM
**Actionability**: HIGH

#### CRITICAL Issue

**blocker: Claiming with concurrent responses is underspecified.**

The document establishes that "claiming = first response" for v1. But what happens when two agents respond simultaneously in a `response_mode: any, claimable: true` pact?

- **Real-world precedent exists**: PagerDuty solves this with DB timestamp ordering. Email has no answer (multiple agents claim the same ticket).
- **Missing from validation**: The document does not address race conditions, network partitions, or the "tie-breaking" rule.
- **Impact**: An agent implementing this will make different assumptions than another agent. This breaks determinism.

**Fix**: Add a "Claiming Ordering" subsection to the `claimable` section:
```
When two responses arrive simultaneously (within <TTL> of each other):
1. Use request envelope timestamp as tie-breaker
2. First timestamp wins
3. Agents must detect "already claimed" status and abort their work
```

---

#### HIGH Issue

**issue: Sequential and private_then_shared deferral lacks exit criteria.**

The document defers these modes to v2 with reasons (sequential is better modeled as `multi_round`, private_then_shared is a workflow). This is reasonable, but **there is no explicit condition for when to revisit them**.

**Problem**: In 6 months, someone will ask "why doesn't sequential exist?" The answer is buried in this artifact. The spec should document WHY they are deferred.

**Fix**: Add to the Lean Canvas a "Deferred Primitives Revisit Criteria" section:
```
sequential visibility:
  - Revisit if > 20% of group pacts express need for round-based ordering
  - Current implementation: multi_round: true with manual sequencing
  - Exit signal: Implementation team reports multi_round insufficient

private_then_shared visibility:
  - Revisit if blind estimation pacts exceed 10% of visibility: private cases
  - Current implementation: Separate actions to change visibility mid-pact
  - Exit signal: Common pattern emerges in usage metrics
```

---

#### MEDIUM Issue

**suggestion: Email BCC response model is not quite accurate.**

The document states: "BCC recipients cannot see each other. If they reply, their response goes only to the sender, not other BCC recipients."

This is correct, but it **conflates two concepts**:
1. **Visibility control** — BCC recipients don't see each other (✓ maps to PACT private visibility)
2. **Response routing** — BCC replies are unicast (NOT unicast in PACT; all responses visible to requester)

Email's BCC and PACT's `visibility: private` are NOT identical. In PACT:
- All responses visible to the requester (always)
- Responses hidden from other respondents when `visibility: private`

This is closer to a 360 feedback model than email BCC. The validation is still correct (private visibility is validated), but the email mapping is slightly misleading.

**Fix**: Clarify the email section: "Email's BCC model is **imperfect analogy**. A closer analogy is 360 feedback where the requester sees all responses but respondents cannot see each other's responses."

---

#### LOW Issue

**question: Why is `deadline_required` a default field but not a primitive?**

The document includes `deadline_required: false` in the defaults section (line 268) but does not validate it as a primitive with real-world evidence. The reasoning is: "SLA policies are team-level, not per-ticket."

This is **plausible but unvalidated**. There is no section analyzing whether agents need this field to decide behavior (like they do for `response_mode`). It appears to be a "nice to have" that was added by convention, not evidence.

**Clarification**: Is `deadline_required` a **true default** (agents check it, it affects behavior) or a **metadata hint** (for human consumption, informational only)? The document is unclear.

**Suggestion**: Add a sentence: "`deadline_required` is informational. Agents use it to set expectations but do not enforce deadlines (deadline enforcement is a protocol feature, not a format feature)."

---

#### PRAISE

**praise: The response_mode validation is exemplary.** Each mode includes:
1. Multiple real-world systems (not cherry-picked)
2. Honest assessment of evidence quality (HIGH vs MEDIUM)
3. Clear "when teams needed this" section
4. PACT-specific relevance statements

This is the gold standard. The visibility validation follows the same pattern and is equally strong.

---

### 2. solution-testing.md

**Purpose**: Cross-system comparison of group primitives across Email, Slack, GitHub, Jira, Google Docs, RFC/Governance

**Evidence Quality**: HIGH
**Completeness**: HIGH
**Actionability**: HIGH

#### HIGH Issue

**issue: The "Multi-group addressing" gap is dismissed too quickly.**

The document identifies a real gap (line 104): "A PR can require 1 approval from `@frontend` AND 1 from `@security`." This is a **multi-group request pattern**.

The deferral reasoning: "A sender can create multiple pacts (one per group) to achieve the same effect."

**Problem**: This is not equivalent. A multi-group request has different semantics:
- **Multiple sequential pacts**: Requester must orchestrate order ("do I ask frontend first or security first?"), wait for each group's result, then aggregate
- **Single multi-group pact**: System handles aggregation atomically; easier for agents to compose

Real example: A security-critical feature requires frontend + security approval. If frontend rejects, no need to ask security. The order matters for user experience.

**Impact**: This is a gap that will likely be requested in v1.1, not later.

**Recommendation**: Do NOT defer this. Add it to the optional scope for v1:
- Support `response_mode` and `visibility` per-group
- Document in Lean Canvas: "Multi-group addressing adds X tokens for N groups; defer if token budget exceeded"

Or explicitly reject it with: "v1 enforces single-group requests. Multi-group requires protocol changes to request envelope (multi-recipient addressing). Deferring to v2."

**Current state**: Ambiguous. The dismissal feels convenient, not justified by cost-benefit.

---

#### MEDIUM Issue

**issue: Watchers/CC recipients gap is identified but not sized.**

The document correctly identifies (line 145): "Jira distinguishes between assignees (must act), reporters (created the request), and watchers (want to see updates)."

But then says (line 145-146): "PACT currently has 'recipients' but no 'watchers.'"

**Problem**: The document doesn't clarify:
1. Is this a **format gap** (pact definition) or a **protocol gap** (request envelope)?
2. What is the token cost of adding watchers?
3. Is this blocking for v1 or v2?

The opportunity-tree.md later clarifies it's a "protocol concern, not format concern" (line 175), but this section should have that distinction explicit.

**Fix**: Add: "Watchers / CC recipients are a **protocol concern** (request envelope), not a **format concern**. The format spec does not need `watchers` field. The protocol can add a `watchers` array to request envelopes independently of this format change."

---

#### MEDIUM Issue

**issue: "No system combines all 4 primitives" claim needs nuance.**

The document states (line 230): "No system combines all 4 primitives in a single format."

This is technically true but **misleading**. The primitives are not abstract — they are:
1. `response_mode` (collection strategy)
2. `visibility` (response exposure)
3. `claimable` (ownership transfer)
4. `defaults` (configuration pattern)

The fact that no existing system has a single schema with all 4 is not surprising — most systems predate mobile async workflows and multi-agent orchestration. This is more a sign that PACT is innovating than validating.

**Fix**: Reframe as: "PACT's combination is novel because it addresses **multi-agent async coordination**, a use case that predates most of these systems' design. This combination is validated individually; the synthesis is new."

---

#### PRAISE

**praise: The Synthesis table (line 209) is excellent.** It shows coverage across systems, instantly validates the 4 core primitives, and identifies gaps. This is how evidence should be presented.

---

### 3. opportunity-tree.md

**Purpose**: Score each primitive on 4 dimensions and sequence implementation

**Evidence Quality**: MEDIUM (scores are justified but somewhat subjective)
**Completeness**: HIGH
**Actionability**: HIGH

#### CRITICAL Issue

**blocker: The "Litmus Test Tightening" (GE7) score is inverted.**

The document scores GE7 as:
- Problem Evidence: 3/5 (low)
- Agent Utility: 4/5 (medium-high)
- Format Simplicity: 5/5 (zero cost)
- Incrementality: 5/5 (non-breaking)
- **Total: 14/20** (bottom-right, "do when convenient")

But then recommends including it in v1 (line 262: "Include GE7: Litmus test tightening").

**The problem**: The score says "when convenient" but the recommendation says "now." This is contradictory. If the litmus test is non-breaking and zero-cost, it should score higher. If it's just documentation advice, it shouldn't affect the handoff decision.

**Why this matters**: The litmus test proposes **behavioral guidelines** (line 227-232):
1. "Agent does meaningful work on both sides"
2. "Context is too rich for a text message"
3. "Both sides do creative/intellectual work"

These are **vague and unenforceable**. They are useful as guidance, but the recommendation treats them as if they will somehow make group pacts "better." They won't — agents making pacts will still decide locally what constitutes "meaningful work."

**Fix**: Either:
- **Option A (recommend)**: Include litmus test as advisory guidance in the spec body, score it as such
- **Option B (defer)**: Remove GE7 entirely; the existing pact concept is sufficient

Don't include with ambiguous framing.

**Current state**: The opportunity tree says "include" but provides no implementation intent. What will actually change in the spec? How will agents be guided by this? This must be explicit before handoff.

---

#### HIGH Issue

**issue: Token cost analysis for catalog entries is optimistic.**

The lean-canvas.md (line 114-131) calculates catalog entry overhead:
- Current: ~20 tokens per entry
- Extended: ~25 tokens per entry
- Delta: ~5 tokens per entry

But this **assumes the catalog entry is the only cost**. The actual rendering cost is:
1. Catalog entries themselves: ~5 tokens delta
2. Full pact retrieval on selection: ~35 additional tokens per interaction
3. Rendering/display of group fields: ~10 additional tokens

**Total per-interaction cost**: ~15-20 tokens, not 5 tokens.

At 100 pacts with 50% being group pacts, this is 50 pacts × 15 tokens = 750 additional tokens per session, not 500.

**Impact**: Still within budget (0.35% of 200k), but the analysis is off by 30-50%. This is important for future feature cost estimates.

**Fix**: Clarify in the Lean Canvas:
- Catalog delta: +5 tokens
- Per-retrieval delta: +15 tokens (full pact with group fields)
- Per-session cost (50 group pacts, 10% selected): ~750 tokens
- Percentage: 0.4% of 200k context

---

#### MEDIUM Issue

**issue: The Priority Matrix is binary, not nuanced.**

The priority matrix (line 237-254) uses a 2x2: "Evidence Quality" vs "Agent Value."

But **scoring dimensionality is lost**. For example:
- GE1 (response_mode): 19/20 score, all 4 dimensions high
- GE4 (defaults): 18/20 score, 3 dimensions high, 1 medium
- GE3 (claimable): 16/20 score, 2 dimensions high, 2 medium

The matrix collapses all of these into "top-right" (do now). But they are not equally strong. GE1 is mandatory; GE3 is high-value but less critical.

**Not a problem per se**, but the matrix oversimplifies. A table showing all 4 dimension scores would be clearer.

---

#### PRAISE

**praise: GE5 (Group Addressing) correctly defers addressing to protocol, not format.** The distinction is crisp: "The pact format spec should document that response_mode, visibility, and claimable exist as defaults. The actual recipient addressing is a protocol concern (request envelope schema), not a format concern." This is exactly right and prevents feature creep.

---

### 4. lean-canvas.md

**Purpose**: Cost-benefit analysis for each change

**Evidence Quality**: MEDIUM (cost estimates lack precision)
**Completeness**: MEDIUM (missing some failure mode costs)
**Actionability**: MEDIUM

#### HIGH Issue

**issue: The "Risk if we OMIT it" section conflates deployment blocking with feature blocking.**

Example (line 199): "Duplicate work from uncoordinated responses — MEDIUM impact — two agents work on same request without claiming."

The document then concludes (line 201): "Doing nothing is not viable for the validated deployment target."

**Problem**: This confuses "risk to deployment" with "risk to product value." The actual risks are:
1. **Without group addressing**: Teams cannot use PACT for team-level requests (blocking)
2. **Without response_mode**: Ambiguous what "completion" means (blocking)
3. **Without visibility**: No private assessment option (high-value but not blocking)
4. **Without claimable**: Support/triage teams need manual coordination (nice-to-have, not blocking)

The document treats all as "blocking," which inflates the case for including everything.

**Fix**: Rewrite the risk assessment as:
```
| Change | Blocking? | Deployment Impact | Justification |
| defaults + response_mode | YES | Cannot deploy without; teams don't know when pact is done | MUST ship |
| visibility (private) | NO | Deployable without; 360/audit workflows can't run | SHOULD ship (v1 or v1.1) |
| claimable | NO | Deployable without; support teams use workarounds | NICE-TO-HAVE (v1 or v2) |
```

This clarifies priority without conflating all features with "not viable."

---

#### CRITICAL Issue

**issue: Token budget analysis omits agents' reasoning overhead.**

The lean-canvas states (line 165-167):
- Per-pact frontmatter: +31 tokens
- Catalog for 100 pacts: +1,100-1,700 tokens
- Format spec body: +100-200 tokens

But **agents reasoning about group fields** is not counted:
- When an agent sees `response_mode: any`, it must decide: "Should I wait for others?" (decision overhead)
- When an agent sees `visibility: private`, it must decide: "Can I reference others' responses?" (decision overhead)
- When an agent sees `claimable: true`, it must decide: "Should I claim first?" (decision overhead)

This reasoning overhead is **per-request**, not per-catalog-load. At 10 group pacts per session, this is 10 × 5-10 tokens = 50-100 tokens per session.

**Impact**: Still under budget, but the analysis undersells the complexity. Agents will need to spend meaningful tokens reasoning about these primitives.

**Fix**: Add a section:
```
## Agent Reasoning Overhead (Per-Request)

When composing a group request, an agent must consider:
- response_mode (any/all/quorum/none_required) → ~5 tokens of decision-making
- visibility (shared/private) → ~3 tokens of decision-making
- claimable (true/false) → ~2 tokens of decision-making
- defaults section interaction → ~5 tokens

Total per group request: ~15 tokens of reasoning overhead (not in token budget above).
At 10 group pacts per session: 150 tokens overhead.
This is manageable but real.
```

---

#### MEDIUM Issue

**issue: The "What-if" scenarios are incomplete.**

The lean-canvas has what-if scenarios for:
- Adding all 4 visibility modes instead of 2 ✓
- Adding watchers/CC ✓
- Deferring all group primitives ✓

Missing what-if scenarios:
- **What if quorum_threshold is a string/keyword instead of integer?** ("majority", "consensus", etc.)
- **What if we add multi-group addressing?** (covered briefly in solution-testing, not here)
- **What if claiming requires a separate protocol action?** (mentioned in problem-validation but not cost-analyzed)

These are medium-value scenarios but would strengthen the analysis.

---

#### PRAISE

**praise: The Risk Map (line 207-227) is excellent.** It shows:
- Sequential/private_then_shared visibility in "high cost, low probability" (top-left) ✓ correctly deferred
- response_mode/visibility/claimable in "low cost, high probability" (bottom-right) ✓ correctly included

This quadrant analysis is how feature prioritization should be done.

---

### 5. interview-log.md

**Purpose**: Document all evidence sources and their quality ratings

**Evidence Quality**: VERY HIGH
**Completeness**: HIGH
**Actionability**: N/A (reference document)

#### MEDIUM Issue

**issue: The Evidence Gap Summary (line 274-286) marks several items "OPEN" without closure plans.**

Examples:
- "Should claiming be a separate protocol action?" → Status: OPEN. Exit: "Test in practice; add separate action if needed"
- "Do teams need watchers/CC recipients?" → Status: OPEN. Exit: "Not blocking for v1; add to protocol (not format) later"

**Problem**: "Test in practice" is not an exit criterion. It's a deferral without clear feedback loops. In 6 months, someone will deploy PACT, agents will struggle with claiming semantics, and the question will resurface with no history of what was decided.

**Fix**: Add closure plans:
```
Open Question: Should claiming be a separate protocol action?
- Current assumption: v1 treats first response as implicit claim
- Closure condition: If >30% of group pacts have "claim but don't respond" pattern
- Validation method: Metrics from first deployment; agent feedback
- Escalation trigger: If pattern emerges, design separate claim action
```

This converts an open question into a monitored assumption.

---

#### HIGH Issue

**issue: Multi-Agent AI Coordination sources (line 235-251) are INFORMED OPINION, not evidence.**

The document cites:
- Deloitte: "AI Agent Orchestration" → INFORMED OPINION
- OneReach: "MCP Multi-Agent Collaborative Intelligence" → INFORMED OPINION
- Kanerika: "AI Agent Orchestration 2026" → INFORMED OPINION

These are **analyst predictions**, not production evidence. The findings are reasonable ("Hub-and-spoke: central orchestrator manages agents") but are not validated by real systems.

**Impact**: This section is speculative but framed as evidence. It's used to justify the hub-and-spoke model for PACT (requester as central orchestrator). This is reasonable, but the evidence is weak.

**Fix**: Retitle to "Emergent Patterns (Analyst View)" and add a caveat:
"These sources are analyst predictions for 2026, not production systems. They inform PACT's positioning but do not validate specific primitives. None of the group envelope primitives are derived from this section."

---

#### PRAISE

**praise: The source attribution is excellent.** Every finding includes:
1. Source URL
2. Quality rating (TECHNICAL FACT, PATTERN MATCH, INFORMED OPINION, PAST BEHAVIOR)
3. Relevance to PACT

This is how evidence should be documented.

---

### 6. Additional Context: pact-format-spec.md

This file was read to understand the existing specification. It is well-written and provides clear context for the group primitives design. **No issues with the format spec itself**, but one note:

**suggestion: The format spec should explicitly reserve the "defaults" section for future group primitives.**

Current spec (line 33) has no mention of `defaults`. When group primitives are added, the spec will change. To make this transition clear, add a note:

```yaml
# Future: Group envelope primitives (response_mode, visibility, etc.)
# will be defined in a 'defaults' section when group addressing is added.
# For now, only single-recipient pacts are supported.
```

This prevents surprise when defaults are added in v1.1.

---

## Cross-Artifact Issues

### Issue 1: The "Claiming" Semantics Have a Race Condition

**Severity**: CRITICAL
**Across**: problem-validation.md, opportunity-tree.md, lean-canvas.md

All three artifacts treat "claiming = first response" as solved, but they don't address what happens when:
- Two agents respond within milliseconds of each other
- Network partition causes claim to be invisible to one agent
- Agent claims but crashes before responding (is claim invalidated?)

**Example from real-world**: PagerDuty's acknowledge action happens **before** the responder resolves the incident. An agent can acknowledge (claim) and then spend 30 minutes diagnosing before responding. PACT's "first response = claim" model doesn't allow this separation.

**Impact**: Implementation will need to make assumptions. Different assumptions across agents = broken coordination.

**Fix Required**: Add a "Claiming Lifecycle" section to problem-validation.md:
```
claim event:
  - Triggered by first response
  - Atomic: Either claims successfully or fails with "already_claimed" error
  - Visible immediately to all recipients via response envelope
  - Example: Agent responds with {claimed: true, ...} → system marks pact as claimed and stores claimant ID

Concurrent claims:
  - If two responses arrive within <150ms>, earlier timestamp wins
  - Loser receives response envelope with {claimed_by: agent_id} status
  - Loser must abort work immediately or coordinate with claimant
```

---

### Issue 2: The "Deferred Visibility Modes" Lack Implementation Guidance

**Severity**: HIGH
**Across**: problem-validation.md, opportunity-tree.md

Both documents defer `sequential` and `private_then_shared` with reasoning but no implementation path.

**Current state**:
- Sequential: "Better modeled by multi_round: true" (problem-validation.md, line 174)
- Private_then_shared: "Two-phase workflow, not a primitive" (problem-validation.md, line 194)

**Problem**: When agents encounter a pact that needs private-then-shared, how do they implement it with the deferred system?

Answer: Create two separate pacts? Use multi_round with manual visibility transitions? This is unclear.

**Fix Required**: Add to opportunity-tree.md:

```yaml
## Deferred Mode Implementation Patterns

### Sequential Visibility (Deferred to v2)
Implementation path for v1:
- Use multi_round: true
- Agent manually enforces sequence: only reveal response N after receiving N+1 responses
- Limitation: Not enforced; agents must coordinate

### Private-then-Shared Visibility (Deferred to v2)
Implementation path for v1:
- Create pact with visibility: private
- After deadline/all-responses, issue separate action to change visibility: shared
- Limitation: Requires protocol action; not atomic

Revisit criteria:
- sequential: Implement when 20%+ of pacts express explicit ordering need
- private_then_shared: Implement when 10%+ of pacts express blind-then-discuss pattern
```

---

### Issue 3: The Litmus Test Tightening Is Unsupported

**Severity**: CRITICAL
**Across**: opportunity-tree.md, lean-canvas.md, problem-validation.md

The opportunity tree recommends including "GE7: Litmus Test Tightening" (line 262-270) but the rationale is weak:

**Current recommendation** (line 227-232 in opportunity-tree.md):
1. "Agent does meaningful work on both sides"
2. "Context is too rich for a text message"
3. "Both sides do creative/intellectual work"

**Problems**:
- These are aspirational, not measurable
- They will NOT prevent agents from creating trivial pacts
- Existing pact concept already has an implicit litmus test
- Adding documentation won't change agent behavior

**Real example**: An agent could create a pact for "approve my PR" (meaningful work? maybe. creative work? debatable.). The tightened litmus test doesn't prevent this.

**Fix Required**: Either:
- **Option A (recommend)**: Remove GE7 entirely. The existing pact concept is sufficient. Litmus test improvements belong in implementation/experience design, not format spec.
- **Option B (implement properly)**: Define measurable criteria:
  - "context_bundle has >3 fields" OR
  - "response_bundle has >2 fields" OR
  - "response_bundle has typed enum fields"

  And enforce in pact validation.

**Current state**: The recommendation to include it is unsupported. Either remove it or make it actionable.

---

## Verdict Assessment

### What's Solid (Ship with Confidence)

1. **response_mode (all, any, quorum, none_required)** — Excellent evidence across 6 systems. Clear semantics. Validated.
2. **visibility (private, shared)** — Strong evidence. Email, 360 feedback, academic review all validate. Include both.
3. **defaults section** — Universally validated pattern. Every real system uses project/org-level defaults.
4. **catalog entry extension** — Negligible token cost (~5 tokens), clear value for pact selection.
5. **Group addressing documentation** — Correctly places addressing in protocol, not format.

### What Needs Revision (Critical)

1. **Claiming semantics**: Race conditions and concurrent claims must be specified
2. **Deferred modes**: Implementation paths for sequential and private_then_shared must be documented
3. **Litmus test**: Either remove or make measurable. Current formulation is advisory hand-waving.

### What's Undecided (Track This)

1. **Multi-group addressing**: Deferred but not sized. Document cost and revisit criteria.
2. **Separate claim action**: Deferred. Monitor real-world claiming patterns.
3. **Watchers/CC recipients**: Correctly deferred to protocol. Confirm this doesn't block v1 user stories.

---

## Required Changes Before Handoff

### CRITICAL (Blocking)

1. **Add "Claiming Concurrency & Race Conditions" section to problem-validation.md**
   - Define timestamp-based tie-breaking
   - Define "already_claimed" error handling
   - Document agent responsibility for conflict resolution

2. **Remove or rewrite GE7 (Litmus Test Tightening)**
   - If keeping: Define measurable criteria (field count, field types)
   - If removing: Justify why existing pact concept is sufficient

3. **Add "Deferred Mode Implementation Paths" to opportunity-tree.md**
   - Show how agents implement sequential with multi_round
   - Show how agents implement private_then_shared with separate action
   - Define revisit criteria (usage %, deployment duration)

### HIGH (Should Fix)

4. **Clarify token cost for agent reasoning overhead in lean-canvas.md**
   - Add per-request decision-making cost (~15 tokens per group request)
   - Recalculate session-level budget

5. **Reframe "risk if omit" section in lean-canvas.md**
   - Distinguish between blocking (response_mode, defaults) and high-value (visibility, claimable)
   - Use explicit "deployment blocking" language

6. **Add closure plans to interview-log.md**
   - Convert "OPEN" questions to monitored assumptions
   - Define feedback loops for revisiting deferred decisions

### MEDIUM (Nice-to-Have)

7. **Clarify multi-group addressing deferral in solution-testing.md**
   - Size the cost (X additional tokens per group)
   - Define clear criteria for v1.1 inclusion

8. **Correct email BCC analogy in problem-validation.md**
   - Clarify that PACT private visibility ≠ email BCC
   - Use 360 feedback as closer analogy

---

## Technical Soundness Assessment

| Primitive | Evidence | Specification | Implementability | Risk |
|---|---|---|---|---|
| response_mode | STRONG | Clear (4 values, integer quorum) | HIGH | LOW |
| visibility | STRONG | Clear (2 values) | HIGH | LOW |
| claimable | STRONG | **UNCLEAR** (race conditions) | MEDIUM | **MEDIUM** |
| defaults | STRONG | Clear | HIGH | LOW |
| catalog extension | GOOD | Clear | HIGH | LOW |

**Overall technical soundness**: 75%. The core is sound but claiming semantics need specification before implementation.

---

## Completeness Assessment

| Aspect | Status | Notes |
|---|---|---|
| **Evidence gathering** | COMPLETE | 13 systems analyzed, multiple quality ratings |
| **Problem validation** | COMPLETE | All 4 core primitives validated |
| **Solution testing** | COMPLETE | Cross-system comparison thorough |
| **Opportunity scoring** | COMPLETE | 7 opportunities scored on 4 dimensions |
| **Cost-benefit** | GOOD | Missing agent reasoning overhead, multi-group sizing |
| **Source documentation** | EXCELLENT | Every claim traced to source with quality rating |
| **Implementation guidance** | INCOMPLETE | Claiming concurrency, deferred modes, multi-group all underdocumented |

---

## Final Recommendation

### CONDITIONAL-GO

Ship the discovery with the following conditions:

1. **MUST FIX before handoff to implementation**:
   - Add claiming concurrency specification
   - Rewrite or remove litmus test tightening
   - Document deferred mode implementation paths

2. **SHOULD FIX before implementation starts**:
   - Clarify multi-group addressing deferral
   - Add agent reasoning overhead to token budget
   - Reframe risk assessment language

3. **DOCUMENT for tracking**:
   - Monitored assumptions (claiming, separate claim action)
   - Revisit criteria for deferred modes
   - Deployment feedback loops

**If these conditions are met**: Discovery is ready for implementation.
**If not addressed**: Implementation will hit ambiguity on day 2 and stop to re-discover the same ground.

---

## Annotated Issues Summary

| Issue | Severity | Artifact | Line | Fix |
|---|---|---|---|---|
| Claiming concurrency undefined | CRITICAL | problem-validation | 223 | Specify tie-breaking and error handling |
| Litmus test is hand-waving | CRITICAL | opportunity-tree | 211-220 | Make measurable or remove |
| Deferred modes lack implementation path | CRITICAL | opportunity-tree | 272-280 | Show agent workarounds |
| Multi-group addressing dismissed quickly | HIGH | solution-testing | 104 | Size cost and document deferral |
| Token cost omits reasoning overhead | HIGH | lean-canvas | 153 | Add per-request decision cost |
| Risk if omit conflates blocking+nice-to-have | HIGH | lean-canvas | 199-201 | Separate into distinct risk categories |
| Email BCC analogy imperfect | MEDIUM | problem-validation | 142-145 | Use 360 feedback analogy |
| Sequential/private_then_shared deferral lacks criteria | MEDIUM | problem-validation | 170-194 | Add usage % triggers for revisit |
| Watchers gap not scoped | MEDIUM | solution-testing | 145 | Clarify format vs protocol concern |
| Litmus test score contradicts recommendation | MEDIUM | opportunity-tree | 14/20 but "include in v1" | Either increase score or defer |
| Deferred sources treat predictions as evidence | HIGH | interview-log | 235-251 | Retitle as "analyst view" |
| Open questions lack closure plans | MEDIUM | interview-log | 274-286 | Add monitored assumption framework |

---

## Questions for the Researcher

1. **Claiming**: Have you modeled PagerDuty's claim-then-respond pattern? Can PACT support "acknowledge without responding"?
2. **Litmus test**: Is the tightening meant to be enforced at runtime, or purely advisory documentation?
3. **Multi-group**: What's the actual token cost of multi-group per-group addressing? Is it truly deferrable?
4. **Concurrent claims**: How should agents be notified when their claim fails due to tie-breaking?

---

## Sign-Off

**Reviewer Assessment**: This discovery work is thorough and well-evidenced. With the three critical issues addressed, it is handoff-ready. Without those fixes, implementation will face the same questions during week 1.

**Confidence Level**: HIGH that the core primitives are correct. MEDIUM that all implementation details are considered.

**Approval**: **CONDITIONAL-GO** pending critical revisions.
