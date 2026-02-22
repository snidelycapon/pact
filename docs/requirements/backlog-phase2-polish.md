# Backlog -- PACT Phase 2 Polish

## Epic: phase2-polish
## Status: Requirements complete -- ready for DESIGN wave handoff
## Date: 2026-02-21

---

## Story Map

```
THREADS           ATTACHMENTS      LIFECYCLE         CONVENTION       PACTS
========          ===========      =========         ==========       ======

US-010            US-012           US-013            US-016           US-017
Auto thread_id    Attachment       pact_cancel       Inbox            Sanity-check
(modify request)  inbox+status     (new tool)        auto-poll        pact
                  (modify tools)                     (docs only)
US-009                             US-014                             US-018
pact_thread                        pact_amend                         Code-review
(new tool)                         (new tool)                         pact

US-011                             US-015
Thread-aware                       Status field
inbox (modify)                     consistency
```

## Dependency Graph

```
                    US-010 (Auto thread_id)
                      |
           +----------+----------+
           |                     |
           v                     v
      US-009 (pact_thread)  US-011 (Thread-aware inbox)
           |
           v
      US-013 (pact_cancel) -----> US-015 (Status consistency)
           |                         ^
           |                         |
      US-014 (pact_amend) ----------+

      US-012 (Attachment inbox+status) -----> US-018 (Code-review pact)

      US-016 (Inbox auto-poll) — no dependencies

      US-017 (Sanity-check pact) — no dependencies
```

**Critical path**: US-010 -> US-009 + US-011 (parallel) + US-013 -> US-015

**Independent tracks**:
- Thread management: US-010 -> US-009 -> US-011
- Lifecycle: US-013 + US-014 -> US-015
- Attachments: US-012 -> US-018
- Convention: US-016 (standalone)
- Pacts: US-017 (standalone), US-018 (after US-012)

---

## Story Summary

| ID | Title | Size | Scenarios | Dependencies | Priority |
|----|-------|------|-----------|-------------|----------|
| US-009 | pact_thread (View Thread) | 1-2 days | 5 | US-010 (beneficial) | P1 |
| US-010 | Auto thread_id | 1 day | 4 | None | P1 |
| US-011 | Thread-aware inbox | 1-2 days | 5 | US-010 | P1 |
| US-012 | Attachment inbox + status | 1 day | 4 | None | P3 |
| US-013 | pact_cancel | 1-2 days | 5 | None | P4 |
| US-014 | pact_amend | 1-2 days | 5 | None | P4 |
| US-015 | Status field consistency | 0.5 days | 3 | US-013 | P4 |
| US-016 | Inbox auto-poll convention | 0.5 days | 3 | None | P5 |
| US-017 | Sanity-check pact | 0.5 days | 5 | None | P6 |
| US-018 | Code-review pact | 0.5 days | 5 | US-012 (beneficial) | P6 |

**Total estimated effort**: 7-11 days

---

## Implementation Order (Recommended)

### Wave 1: Thread Foundation (2-3 days)
1. **US-010** (Auto thread_id) -- 1 day. Small change to pact_request, unlocks everything else.
2. **US-009** (pact_thread) -- 1-2 days. New tool, scan pattern similar to pact_status.
3. **US-011** (Thread-aware inbox) -- can start in parallel with US-009 after US-010 is done.

### Wave 2: Lifecycle + Attachments (3-4 days, parallelizable)
4. **US-013** (pact_cancel) -- 1-2 days. New tool.
5. **US-014** (pact_amend) -- 1-2 days. New tool. Parallelizable with US-013.
6. **US-015** (Status consistency) -- 0.5 days. Quick fix to pact_respond + apply to US-013.
7. **US-012** (Attachment inbox + status) -- 1 day. Modify existing tools.

### Wave 3: Pacts + Convention (1-2 days)
8. **US-017** (Sanity-check pact) -- 0.5 days. Markdown only.
9. **US-018** (Code-review pact) -- 0.5 days. Markdown only.
10. **US-016** (Inbox auto-poll) -- 0.5 days. Documentation only.

---

## DoR Checklist Summary

| Item | US-009 | US-010 | US-011 | US-012 | US-013 | US-014 | US-015 | US-016 | US-017 | US-018 |
|------|--------|--------|--------|--------|--------|--------|--------|--------|--------|--------|
| 1. Problem statement | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| 2. User/persona | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| 3. 3+ domain examples | PASS (3) | PASS (3) | PASS (3) | PASS (3) | PASS (3) | PASS (3) | PASS (3) | PASS (3) | PASS (3) | PASS (3) |
| 4. UAT scenarios (3-7) | PASS (5) | PASS (4) | PASS (5) | PASS (4) | PASS (5) | PASS (5) | PASS (3) | PASS (3) | PASS (5) | PASS (5) |
| 5. AC from UAT | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| 6. Right-sized | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| 7. Technical notes | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| 8. Dependencies | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |

**All 10 stories pass all 8 DoR items.**

### DoR Validation Notes

**US-009 (pact_thread)**: Problem clearly states the pain of manually tracking thread_ids across sessions. 3 domain examples cover multi-round, single-round, and not-found. 5 scenarios including cancelled-request edge case. Technical notes specify scan strategy and tool registration. Size: 1-2 days for new tool following existing pattern.

**US-010 (Auto thread_id)**: Problem identifies the manual convention gap. 3 examples cover auto-assign, explicit, and single-round. 4 scenarios. Technical notes include the exact code line to change. Size: 1 day, smallest code change in the batch.

**US-011 (Thread-aware inbox)**: Problem describes the visual clutter of ungrouped threads. 3 examples cover grouping, mixed inbox, and partial-thread. 5 scenarios including backward compatibility. Technical notes detail the grouping algorithm. Size: 1-2 days for inbox modification.

**US-012 (Attachment inbox + status)**: Problem is concrete -- "attachment_count: 2 but no paths." 3 examples cover metadata, paths, and no-attachments. 4 scenarios. Technical notes specify exact fields to add. Size: 1 day, two small modifications.

**US-013 (pact_cancel)**: Problem uses a specific scenario (sent to wrong person). 3 examples cover wrong-person, stale, and cannot-cancel-completed. 5 scenarios. Technical notes reference pact-respond.ts as pattern. Size: 1-2 days for new tool.

**US-014 (pact_amend)**: Problem uses specific missing-context scenario. 3 examples cover single amendment, multiple, and cannot-amend-completed. 5 scenarios. Technical notes detail append-only strategy. Size: 1-2 days.

**US-015 (Status consistency)**: Problem is a concrete data inconsistency. 3 examples cover completed, cancelled, new. 3 scenarios (minimum, but the story is small). Size: 0.5 days.

**US-016 (Inbox auto-poll)**: Problem describes missed requests due to no reminder. 3 examples cover Claude Code, empty inbox, Craft Agents. 3 scenarios (minimum, docs-only story). Size: 0.5 days.

**US-017 (Sanity-check pact)**: Problem describes the Slack context-dump workflow it replaces. 3 examples with real customer data. 5 scenarios. Size: 0.5 days (markdown file).

**US-018 (Code-review pact)**: Problem describes unstructured PR review requests. 3 examples cover review request, approval, and changes-requested. 5 scenarios including multi-round and attachments. Size: 0.5 days (markdown file).

---

## Risk Register

| Risk | Severity | Mitigation | Validated By |
|------|----------|------------|-------------|
| Thread scan performance at scale | LOW | Sequential scan is fine for MVP scale (dozens of requests). Index in Tier 2. | Monitor after 50+ requests. |
| Inbox grouping confuses users | LOW | Thread groups clearly labeled. Standalone requests display normally. | Real usage feedback. |
| Amendment audit trail gets complex | LOW | Append-only design. Amendments are separate from context_bundle. | US-014 implementation. |
| Backward compatibility with pre-Phase-2 requests | MEDIUM | Schema keeps thread_id optional. Inbox handles missing thread_id. Status consistency only applies to new transitions. | US-010, US-011 tests. |
| Pacts too complex for agents to follow | MEDIUM | Start with sanity-check (simple) and code-review (moderate). Measure response schema compliance. | US-017, US-018 in real usage. |

---

## Handoff Notes for DESIGN Wave

### What Is Decided (Do Not Re-Open)
- 3 new MCP tools: pact_thread, pact_cancel, pact_amend
- 2 modified tools: pact_request (auto thread_id), pact_inbox (thread grouping + attachments), pact_status (attachment paths + cancelled directory scan)
- 1 modified tool (bugfix): pact_respond (status field consistency)
- 2 new pacts: sanity-check, code-review
- 1 new directory: requests/cancelled/
- 1 convention document: inbox auto-poll at session start
- Append-only amendment design (amendments array, not context_bundle overwrite)
- Sender-only gate for cancel and amend operations
- Pending-only gate for cancel and amend operations

### What Needs Design Decisions
- Thread grouping algorithm: how to handle threads where some rounds are from different senders (e.g., design-pact where both parties send requests)
- Amendment visibility: should pact_inbox show an "amended" indicator for amended requests?
- pact_thread output format: full envelope vs summary fields for each entry
- Cancelled directory initialization: .gitkeep convention or created on first cancel
- pact_cancel and pact_amend parameter schemas (exact Zod definitions)
- Whether to add `cancelled` to the PactStatusResult type union

### Journey Artifacts Produced
| File | Contents |
|------|----------|
| docs/ux/phase2-polish/journey-thread-management-visual.md | Thread management ASCII flow |
| docs/ux/phase2-polish/journey-thread-management.yaml | Thread management structured schema |
| docs/ux/phase2-polish/journey-thread-management.feature | Thread management Gherkin scenarios (8) |
| docs/ux/phase2-polish/journey-attachment-consumer-visual.md | Attachment consumer ASCII flow |
| docs/ux/phase2-polish/journey-attachment-consumer.feature | Attachment consumer Gherkin scenarios (5) |
| docs/ux/phase2-polish/journey-request-lifecycle-visual.md | Cancel + amend ASCII flow |
| docs/ux/phase2-polish/journey-request-lifecycle.feature | Lifecycle Gherkin scenarios (10) |
| docs/ux/phase2-polish/journey-inbox-autopoll-visual.md | Auto-poll convention flow |
| docs/ux/phase2-polish/journey-pact-contracts-visual.md | New pacts overview |

### Requirements Produced
| File | Contents |
|------|----------|
| docs/requirements/us-009-pact-thread-tool.md | pact_thread tool |
| docs/requirements/us-010-auto-thread-id.md | Auto thread_id on pact_request |
| docs/requirements/us-011-thread-aware-inbox.md | Thread-aware pact_inbox |
| docs/requirements/us-012-attachment-inbox-paths.md | Attachment details in inbox + status |
| docs/requirements/us-013-pact-cancel-tool.md | pact_cancel tool |
| docs/requirements/us-014-pact-amend-tool.md | pact_amend tool |
| docs/requirements/us-015-status-field-consistency.md | Status field fix |
| docs/requirements/us-016-inbox-autopoll-convention.md | Auto-poll convention |
| docs/requirements/us-017-sanity-check-pact.md | Sanity-check PACT.md |
| docs/requirements/us-018-code-review-pact.md | Code-review PACT.md |
| docs/requirements/backlog-phase2-polish.md | This file |
