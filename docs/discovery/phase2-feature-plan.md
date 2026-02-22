# Phase 2 Feature Plan — PACT Post-MVP

## Source: Re-Discovery Pass (2026-02-21)

This document translates the re-discovery findings into a prioritized feature backlog for the next planning wave. It is derived from updated opportunity scores, implementation experience, and assumption validation.

---

## Strategic Context

The MVP validated the protocol layer. Phase 2 is about **workflows, usability, and value proof**. The highest-risk assumption remaining is whether the system is actually better than Slack for the original validated use case (tech support handoffs with rich context). All Phase 2 work should be evaluated against that question.

### What Phase 2 Is NOT

- Not Tier 2 (brain service / push notifications / LLM enrichment)
- Not Tier 3 (institutional memory / pattern detection)
- Not infrastructure rework (the protocol and architecture are solid)

### What Phase 2 IS

- Complete the tooling around primitives that already exist (thread_id, attachments)
- Add basic lifecycle operations (cancel, amend)
- Exercise the system with real workloads to validate the value proposition
- Create 2-3 new pacts that test the protocol's flexibility

---

## Prioritized Feature Backlog

### Priority 1: Thread Management Tools

**Source opportunity**: O7 (Score: 13/15)
**Why highest priority**: thread_id exists as a schema primitive but has zero tooling. The design-pact contract documents a multi-round workflow that depends on thread tracking, but users must manually remember thread IDs. This is the gap between "protocol supports it" and "users can actually use it."

**Features**:

| Feature | Description | Scope |
|---------|------------|-------|
| F1.1: pact_thread tool | New MCP tool. Given a thread_id, return all requests in the thread ordered chronologically with their responses. Include thread summary (participant list, round count, latest status). | NEW TOOL |
| F1.2: Thread-aware inbox | Update pact_inbox to group entries by thread_id. Threaded entries show as a single inbox item with round count, rather than N separate items. | MODIFY pact_inbox |
| F1.3: Auto thread_id on round 1 | When a request is the first in a thread (no thread_id provided), set thread_id = request_id automatically. The design-pact contract documents this convention manually; it should be automatic. | MODIFY pact_request |

**Acceptance criteria**:
- pact_thread returns chronological request+response pairs for a given thread
- Inbox groups threaded requests, showing "Thread: design-pact (3 rounds)" instead of 3 separate entries
- First request in a conversation automatically becomes its own thread anchor

**Risk**: LOW -- these are tooling features on an existing primitive.

---

### Priority 2: Real Workload Validation (Not a Feature -- a Test)

**Source opportunity**: O1 (Score: 12/15, UNTESTED)
**Why this priority**: The core value proposition -- rich context bundles eliminate manual context assembly for tech support handoffs -- has not been tested with real workloads. This is the riskiest assumption remaining. If context bundles are not actually better than Slack, the product thesis fails.

**Actions**:

| Action | Description | Success Criteria |
|--------|------------|-----------------|
| A2.1: Create tech support pact | Write a "sanity-check" or "bug-handoff" PACT.md based on the original discovery workflow description. Include fields for customer, product, repos, files, investigation, question, zendesk_ticket. | Pact file committed to pacts/ |
| A2.2: Exercise with real bug | Use the system for an actual tech support investigation handoff at the user's workplace. Not a synthetic test. | 1+ real handoff completed |
| A2.3: Compare to Slack | After the real handoff, assess: was the context bundle richer than what you would have sent via Slack? Did the receiver start faster? Was anything lost? | Qualitative comparison documented |
| A2.4: Iterate the pact | Based on the real handoff, refine the pact. What fields were missing? What was unnecessary? | Revised pact committed |

**Risk**: HIGH -- this is the make-or-break validation. If the answer is "Slack was fine," the product needs to reconsider its value proposition.

---

### Priority 3: Attachment Consumer Tooling

**Source opportunity**: O8 (Score: 10/15)
**Why this priority**: Attachments are stored on disk but not surfaced to the receiving agent. The write side is complete; the read side is missing. This feature is half-shipped.

**Features**:

| Feature | Description | Scope |
|---------|------------|-------|
| F3.1: Attachment paths in inbox | Update pact_inbox entries to include the absolute paths to attachment files, not just the count. | MODIFY pact_inbox |
| F3.2: Attachment content in status | Update pact_status to include attachment metadata and file paths when displaying a request. | MODIFY pact_status |
| F3.3: Pact attachment expectations | Extend PACT.md convention to include an "Expected Attachments" section where pact authors can specify what files should be attached. | CONVENTION |

**Acceptance criteria**:
- Receiver's inbox entry includes `attachment_paths: ["/path/to/attachments/req-id/filename"]`
- pact_status shows attachment list with descriptions and paths
- At least 1 pact has attachment expectations documented

**Risk**: LOW -- straightforward extension of existing infrastructure.

---

### Priority 4: Request Lifecycle Operations

**Source opportunity**: O9 (Score: 9/15)
**Why this priority**: Basic operational hygiene. Sending a request to the wrong person or forgetting context should be recoverable without manual git operations.

**Features**:

| Feature | Description | Scope |
|---------|------------|-------|
| F4.1: pact_cancel tool | New MCP tool. Sender can cancel a pending request. Moves request to cancelled/ directory. Only the sender can cancel. | NEW TOOL + NEW DIRECTORY |
| F4.2: pact_amend tool | New MCP tool. Sender can append additional context to a pending request. Writes an amendment entry to the context bundle (e.g., `amendments: [{added_at, fields}]`). Does not overwrite original context. | NEW TOOL |
| F4.3: Status field consistency | When pact_respond moves a request to completed/, update the status field in the JSON to "completed". Same for cancel -> "cancelled". | MODIFY pact_respond, NEW pact_cancel |

**Acceptance criteria**:
- pact_cancel moves pending request to cancelled/, commits with `[pact] cancelled:` prefix
- pact_amend appends to existing request without overwriting, commits with `[pact] amended:` prefix
- Only the original sender can cancel or amend
- Status field in JSON matches directory location after any lifecycle transition

**Risk**: LOW -- mechanical features. Design question: should the recipient be notified of cancellations/amendments? (Defer notification to Tier 2.)

---

### Priority 5: Inbox Auto-Poll at Session Start

**Source opportunity**: O10a (Score: 8/15 partial)
**Why this priority**: Lowest-cost notification improvement. Instead of requiring the user to ask their agent to check inbox, the agent should check automatically at session start.

**Features**:

| Feature | Description | Scope |
|---------|------------|-------|
| F5.1: Session-start inbox check | Document the pattern for MCP hosts to auto-invoke pact_inbox when a session starts. For Claude Code, this is a system prompt instruction. For Craft Agents, this could be a hook. | DOCUMENTATION / CONVENTION |

**Acceptance criteria**:
- Documentation describes how to configure auto-inbox-check for at least 2 MCP hosts
- The pattern is non-invasive (does not require code changes to PACT itself)

**Risk**: VERY LOW -- this is a usage convention, not a code change.

---

### Priority 6: New Pacts

**Source opportunity**: Cross-cutting (O1, O4, O7)
**Why this priority**: The protocol's flexibility is only validated by the diversity of pacts that use it. Two pacts (ask, design-pact) is a start; the protocol should handle meaningfully different workflow patterns.

**Candidates**:

| Pact | Pattern | Why Interesting |
|-------|---------|----------------|
| code-review | Ping-pong | The design-pact PACT.md already sketches this. Rich context (diff URL, language, areas of concern). Tests attachment feature with diff files. |
| sanity-check | Ping-pong | The original discovery workflow. Customer context, repos, files, investigation history. Tests rich context bundles. |
| standup | Broadcast (manual) | Sender asks multiple recipients the same question. Tests one-to-many pattern. Reveals whether pact_request needs a multi-recipient option or if N separate requests is acceptable. |
| incident-handoff | Chain | A request that, once responded to, naturally leads to a follow-up request to a different person. Tests thread_id for chain orchestration. |

**Acceptance criteria**:
- 2+ new pacts committed to examples/pacts/
- At least 1 pact exercises attachments
- At least 1 pact exercises thread_id for multi-round

**Risk**: LOW -- pact authoring is markdown. The interesting risk is whether agents follow complex pacts reliably.

---

## Riskiest Assumptions for Phase 2

Ranked by potential to invalidate the product thesis:

| Rank | Assumption | Risk Level | Why Risky | How to Test |
|------|-----------|------------|-----------|-------------|
| 1 | Rich context bundles are better than Slack for real handoffs | HIGH | The original validation is from past pain. The solution has never been compared against Slack on a real task. If context bundles are not meaningfully better, the product is a toy. | A2.1-A2.4: Real tech support handoff, qualitative comparison. |
| 2 | Complex pacts produce consistent agent behavior | MED | "ask" is trivially simple. "design-pact" has not been tested with two real humans. More complex pacts (code-review, sanity-check) may exceed PACT.md's ability to guide agent behavior. | Create 2 complex pacts, run 5+ round-trips each, measure response schema compliance. |
| 3 | thread_id is sufficient for multi-round orchestration | MED | thread_id is a flat string. It does not enforce ordering, track round numbers, or provide thread state. The design-pact contract manually tracks round numbers in the context bundle. Will this scale? | Build thread tools (F1.1-F1.3), exercise with 3+ multi-round threads. |
| 4 | Two users are enough to prove the protocol | LOW-MED | Cory and Dan are both technical, both friendly to the tool. A third user (especially one who did not build it) would strengthen the evidence. | Onboard 1 additional user. |
| 5 | Append-only design continues to avoid conflicts at higher volume | LOW | Zero conflicts at 4 requests. What about 100? 1,000? Likely fine (each request is a unique file), but untested at scale. | Monitor over 2 months of real usage. |

---

## Phase 2 Scope Summary

**New MCP tools**: 3 (pact_thread, pact_cancel, pact_amend)
**Modified tools**: 2 (pact_inbox, pact_request)
**New pacts**: 2-4 (sanity-check, code-review, and optionally standup, incident-handoff)
**New directories**: 1 (requests/cancelled/)
**Documentation**: Session-start auto-poll convention

**What is explicitly out of scope**:
- Tier 2 brain service
- Push notifications
- Institutional memory
- Multi-recipient broadcast (as a protocol feature; manual N requests is acceptable for now)
- Search/indexing
- Any UI or client-side changes

---

## Relationship to Tiered Architecture

Phase 2 remains entirely within **Tier 1 (git protocol)**. No server-side intelligence is added. All new features are extensions to the local MCP server and the repo conventions.

The tiered architecture commitment holds: Tier 2 (brain service) is additive and can be built independently once Phase 2 validates the workflow layer.

```
Tier 1 (Phase 2 scope):
  Git repo + local MCP server
  + Thread management tools
  + Lifecycle operations (cancel, amend)
  + Attachment consumer tooling
  + New pacts
  + Auto-poll convention

Tier 2 (Future):
  Brain service watches repo
  + Push notifications
  + Request enrichment
  + Validation beyond schema

Tier 3 (Future):
  Institutional memory
  + Pattern detection
  + Historical context injection
```

---

## Decision Gate: Phase 2 GO/NO-GO

### GO -- Proceed to Phase 2 Implementation

**Rationale**:

1. MVP infrastructure is proven (2 users, 4 requests, zero failures, zero conflicts)
2. Architecture is clean and extensible (ports-and-adapters, 65+ tests)
3. Three protocol primitives (thread_id, attachments, short_id) need tooling to reach full value
4. The highest-risk assumption (context bundles vs Slack) can only be tested by using the system for real work
5. Phase 2 scope is contained: 3 new tools, 2 modified tools, 2-4 pacts, no infrastructure changes
6. No blocking dependencies on external systems or users

**Conditions for GO**:

1. Complete A2.1 (tech support pact) before building thread/lifecycle tools -- validate the value proposition first
2. Exercise A2.2 (real handoff) within the first week of Phase 2 -- do not defer the riskiest test
3. If A2.3 (Slack comparison) shows no meaningful improvement, STOP and reassess before building F4/F5/F6

### Handoff to product-owner

This feature plan is ready for nwave planning when:
- [ ] Re-discovery artifacts reviewed by product owner
- [ ] Priority order confirmed or adjusted
- [ ] A2.1 (tech support pact) completed as validation prerequisite
- [ ] Phase 2 estimation completed
