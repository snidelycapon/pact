# Acceptance Review: Collapsed Tools + Declarative Brain

**Feature**: collapsed-tools-brain
**Wave**: DISTILL
**Reviewer**: Sentinel (nw-acceptance-designer-reviewer)
**Date**: 2026-02-22
**Status**: Conditionally Approved

---

## Approval Decision

**CONDITIONALLY APPROVED** — All dimensions >= 5, all mandates pass, no blockers.

### Conditions

1. Brain processing tests (DD-6, DD-7) must be added before Phase 2 behavioral equivalence validation
2. Milestone 2 (query filtering) and Milestone 5 (error handling) should be unskipped during DELIVER

### Rationale

Brain processing is explicitly designated as "future wave" in the architecture (section 7: "This section defines the contract format only; implementation is a later wave"). The DISTILL tests correctly cover the `has_hooks` flag (contract surface) without testing brain pipeline execution (future implementation). This is a design-aligned gap, not an oversight.

---

## Scores

| Dimension | Score | Notes |
|-----------|-------|-------|
| Happy Path Bias | 8/10 | 41% error coverage (12/29 scenarios) |
| GWT Format | 9/10 | All scenarios follow Given-When-Then, single When clause |
| Business Language | 8/10 | Domain terms throughout, no HTTP/SQL/API leakage |
| Coverage | 5/10 | DD-1 through DD-4 covered; DD-5 partial; DD-6/DD-7 deferred |
| Priority | 8/10 | Core feature areas (collapsed surface, YAML, dispatch) validated |

---

## Mandate Compliance

### CM-A: Hexagonal Boundary — PASS

**Evidence**: All test files import only the driving port:
```
import { createPactServer } from "../../src/server.ts";
```

No imports of internal components (handlers, adapters, pact-parser, ports, schemas). All operations route through `server.callTool(name, params)`.

### CM-B: Business Language — PASS

**Evidence**: Scenario descriptions use domain language exclusively:
- "discovers available request types and team members"
- "agent sends a request to a teammate"
- "the recipient sees it in their inbox"
- "filters pacts by keyword matching"
- "rejects unknown action with error listing valid actions"

No HTTP verbs, status codes, or implementation terms in Given/When/Then descriptions.

### CM-C: User Journey — PASS

**Evidence**: Walking skeletons deliver observable user value:
- WS-1: Agent discovers pacts + team in one call → can compose requests
- WS-2: Alice sends request via pact_do → Bob sees it in inbox via pact_do → round-trip verified

Both pass the stakeholder-demonstrable litmus test.

---

## Strengths

- Hexagonal boundary correctly enforced (single driving port import)
- GWT format excellent with clear single-When clauses
- Walking skeletons test complete user journeys, not technical plumbing
- YAML frontmatter fixtures are comprehensive living specifications
- Error scenarios test real failure modes (broken remote, malformed YAML, unknown actions)

---

## Issues Identified

| Severity | Issue | Status |
|----------|-------|--------|
| High | DD-6 (Brain Pipeline) not tested | Deferred — future wave |
| High | DD-7 (Condition Operators) not tested | Deferred — future wave |
| Medium | 27/29 scenarios skipped | By design — one-at-a-time TDD |
| Low | File paths in assertions hint at internals | Acceptable — descriptions are clean |
