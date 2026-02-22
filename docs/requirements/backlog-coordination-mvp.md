# Backlog — PACT MVP (Walking Skeleton + Feature 0)

## Epic: coordination-mvp
## Status: DISCUSS wave complete -- ready for DESIGN wave handoff
## Date: 2026-02-21

---

## Story Map

```
SETUP          REQUEST          INBOX           RESPOND          STATUS          VALIDATE
=====          =======          =====           =======          ======          ========

US-001         US-002           US-003          US-004           US-005          US-008
Repo           pact_request    pact_inbox     pact_respond    pact_status    Round-trip
Structure      (submit)         (check)         (reply)          (check)         validation

      US-006: Sanity-Check Pact Contract (cross-cutting)
      US-007: Craft Agents Source Integration (cross-cutting)
```

## Dependency Graph

```
US-001 (Repo Structure)
  |
  +---> US-006 (Pact Contract) ----+
  |                                  |
  +---> US-007 (Source Integration)  |
  |       |                          |
  |       v                          v
  +---> US-002 (pact_request) ---> US-008 (Round-trip Validation)
  +---> US-003 (pact_inbox)   --->   |
  +---> US-004 (pact_respond) --->   |
  +---> US-005 (pact_status)  --->   |
```

**Critical path**: US-001 -> US-002/003/004/005 (parallel) + US-006 + US-007 -> US-008

---

## Story Summary

| ID | Title | Size | Scenarios | Dependencies | Priority |
|----|-------|------|-----------|-------------|----------|
| US-001 | PACT Repo Structure | 1 day | 4 | None | P0 |
| US-002 | pact_request (Submit) | 1-2 days | 5 | US-001 | P0 |
| US-003 | pact_inbox (Check) | 1 day | 5 | US-001 | P0 |
| US-004 | pact_respond (Reply) | 1-2 days | 5 | US-001 | P0 |
| US-005 | pact_status (Status) | 1 day | 5 | US-001 | P0 |
| US-006 | Sanity-Check Pact Contract | 1 day | 5 | US-001 | P0 |
| US-007 | Craft Agents Source Integration | 1 day | 4 | US-001 | P0 |
| US-008 | Walking Skeleton Round-Trip | 1 day (testing) | 5 | US-001-007 | P0 |

**Total estimated effort**: 5-7 days (US-002/003/004/005 are parallelizable)

---

## DoR Checklist Summary

| Item | US-001 | US-002 | US-003 | US-004 | US-005 | US-006 | US-007 | US-008 |
|------|--------|--------|--------|--------|--------|--------|--------|--------|
| 1. Problem statement | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| 2. User/persona | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| 3. 3+ domain examples | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| 4. UAT scenarios (3-7) | PASS (4) | PASS (5) | PASS (5) | PASS (5) | PASS (5) | PASS (5) | PASS (4) | PASS (5) |
| 5. AC from UAT | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| 6. Right-sized | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| 7. Technical notes | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| 8. Dependencies | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |

**All 8 stories pass all 8 DoR items.**

---

## Key Corrections from Discovery

During journey design, the user clarified several points that differ from the discovery documents:

| Topic | Discovery Said | User Clarified | Impact |
|-------|---------------|----------------|--------|
| Pact files | Paired sender.md + receiver.md | ONE PACT.md per request type, both sides | Simplifies US-006, reduces files, single contract |
| UX pattern | Not specified | Plan submission pattern for compose AND review | Aligns with existing Craft Agents UX |
| Session coupling | Implied within-session | Fully decoupled from any session/conversation | Strengthens async model |
| Pact loading | Manual | Auto-load based on request_type field | Reduces friction in receiver journey |
| Inspiration | Not mentioned | Beads (steveyegge/beads) for inbox/workflow patterns | Informs DESIGN wave decisions |

---

## Risk Register (From Discovery, Tracked Through Requirements)

| Risk | Severity | Mitigation in Requirements | Validated By |
|------|----------|---------------------------|-------------|
| B10: Pacts produce inconsistent agent behavior | HIGH | US-006 defines single contract file. US-008 validates with 5+ round-trips after skeleton. | US-008 |
| B13: Type-agnostic protocol produces garbage payloads | MEDIUM | US-002 validates envelope only. Pacts define payload expectations. Receiver pact must handle malformed input gracefully. | US-008 |
| B15: Git conflicts during concurrent operations | LOW | Append-only file design (US-002). Rebase retry (US-002, US-004). Single-commit atomicity (US-004). | US-008 |
| B16: Git pull/push latency | LOW | Timeout on git pull (US-003 technical notes). Async model tolerates seconds of latency. | US-008 |

---

## Handoff Notes for DESIGN Wave

### What Is Decided (Do Not Re-Open)
- Git repo as Tier 1 transport
- 4 MCP tools (pact_request, pact_inbox, pact_respond, pact_status)
- Single PACT.md per request type (both sides)
- Plan submission pattern for compose and review
- Rigid envelope / flexible payload (Code Mode pattern)
- Type-agnostic server — pacts define request types, not the MCP server
- Fully async, session-decoupled lifecycle

### What Needs Design Decisions
- Request ID generation scheme (unique across concurrent clients)
- Pact auto-load mechanism (MCP server returns pact content vs. agent reads from repo)
- Display name resolution (MCP server vs. agent)
- Context bundle size limits
- Request type validation (check pact exists before accepting request?)
- Git authentication handling in MCP server (SSH key? token? inherit from environment?)
- Error message formatting (structured JSON vs. human-readable text)
- Tool parameter schemas (exact input/output JSON schemas for each tool)

### What to Investigate (Beads Reference)
The user referenced [github.com/steveyegge/beads](https://github.com/steveyegge/beads) as inspiration for inbox/workflow/handoff patterns. The DESIGN wave should review Beads for applicable patterns, particularly:
- Inbox presentation and triage UX
- Multi-agent handoff context chaining
- Request lifecycle management

### Journey Artifacts Produced
| File | Contents |
|------|----------|
| docs/ux/coordination-mvp/journey-setup-visual.md | Setup/onboarding ASCII flow + TUI mockup |
| docs/ux/coordination-mvp/journey-setup.yaml | Setup journey structured schema |
| docs/ux/coordination-mvp/journey-setup.feature | Setup Gherkin scenarios (7) |
| docs/ux/coordination-mvp/journey-sender-visual.md | Sender ASCII flow + TUI mockups |
| docs/ux/coordination-mvp/journey-sender.yaml | Sender journey structured schema |
| docs/ux/coordination-mvp/journey-sender.feature | Sender Gherkin scenarios (9) |
| docs/ux/coordination-mvp/journey-receiver-visual.md | Receiver ASCII flow + TUI mockups |
| docs/ux/coordination-mvp/journey-receiver.yaml | Receiver journey structured schema |
| docs/ux/coordination-mvp/journey-receiver.feature | Receiver Gherkin scenarios (10) |
| docs/ux/coordination-mvp/shared-artifacts-registry.md | All shared data artifacts with schemas |

### Requirements Produced
| File | Contents |
|------|----------|
| docs/requirements/us-001-walking-skeleton-repo-structure.md | Repo directory conventions |
| docs/requirements/us-002-mcp-server-pact-request.md | pact_request tool |
| docs/requirements/us-003-mcp-server-pact-inbox.md | pact_inbox tool |
| docs/requirements/us-004-mcp-server-pact-respond.md | pact_respond tool |
| docs/requirements/us-005-mcp-server-pact-status.md | pact_status tool |
| docs/requirements/us-006-sanity-check-pact-contract.md | PACT.md for sanity-check |
| docs/requirements/us-007-craft-agents-source-integration.md | MCP source config |
| docs/requirements/us-008-walking-skeleton-round-trip.md | End-to-end validation |
| docs/requirements/backlog-coordination-mvp.md | This file — backlog + handoff |
