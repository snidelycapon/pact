# Test Scenarios: Collapsed Tools + Declarative Brain

**Feature**: collapsed-tools-brain
**Wave**: DISTILL
**Agent**: Quinn (nw-acceptance-designer)
**Date**: 2026-02-22

---

## Overview

29 acceptance test scenarios across 2 test files, targeting the collapsed MCP tool surface (`pact_discover` + `pact_do`). Tests exercise driving ports via `createPactServer().callTool()` against real local git repos.

**Error/edge coverage**: 12 of 29 scenarios (41%) — exceeds 40% threshold.

---

## Test File 1: `tests/acceptance/pact-discover.test.ts`

**Driving port**: `server.callTool("pact_discover", params)`
**Scenarios**: 15 total (9 happy, 6 error/edge = 40%)

### Walking Skeleton (enabled)

| # | Scenario | Observable Outcome |
|---|----------|--------------------|
| 1 | Agent discovers available request types and team members from YAML pacts | Catalog contains pacts with YAML-parsed metadata (name, description, when_to_use, context_bundle, response_bundle) and team members |

### Milestone 1: Pact Catalog Details (skip)

| # | Scenario | Observable Outcome |
|---|----------|--------------------|
| 2 | Returns response_bundle schema with required fields and field definitions | response_bundle.required and response_bundle.fields populated from YAML |
| 3 | Reports has_hooks as true when pact has hooks section | has_hooks flag is true for pacts with brain rules |
| 4 | Reports has_hooks as false when pact has no hooks section | has_hooks flag is false for standard pacts |
| 5 | Returns context_bundle with all defined field metadata | All 7 sanity-check fields present with type and description |
| 6 | Pulls latest pacts from remote before returning catalog | New pact added by Bob appears in Alice's catalog |

### Milestone 2: Discovery Filtering (skip)

| # | Scenario | Observable Outcome |
|---|----------|--------------------|
| 7 | Filters pacts by keyword matching against name, description, and when_to_use | Query "review code" returns code-review, excludes ask |
| 8 | Returns empty pacts when query matches no available types | Empty array, not an error; team still returned |
| 9 | Matches query against when_to_use content for discovery | Query "validate findings" returns sanity-check |

### Milestone 3: Error Resilience (skip)

| # | Scenario | Observable Outcome |
|---|----------|--------------------|
| 10 | Falls back to local catalog with warning when remote is unreachable | Pacts returned from local; warning matches /stale\|local/ |
| 11 | Skips pact directories that have no PACT.md | Directory without PACT.md excluded, valid pacts returned |
| 12 | Skips pact with malformed YAML frontmatter without crashing | Broken YAML excluded, valid pacts returned |
| 13 | Excludes hidden directories from pact listing | .hidden-pact excluded from results |
| 14 | Returns empty catalog when no pacts are installed | Empty pacts array; team still returned |
| 15 | Handles PACT.md with valid frontmatter delimiters but empty YAML | Empty frontmatter pact excluded |

---

## Test File 2: `tests/acceptance/pact-do.test.ts`

**Driving port**: `server.callTool("pact_do", { action, ...params })`
**Scenarios**: 14 total (8 happy, 6 error/edge = 43%)

### Walking Skeleton (enabled)

| # | Scenario | Observable Outcome |
|---|----------|--------------------|
| 1 | Agent sends a request to a teammate and the recipient sees it in their inbox | Request created via `action: "send"`, visible via `action: "inbox"` |

### Milestone 4: Action Dispatch (skip)

| # | Scenario | Observable Outcome |
|---|----------|--------------------|
| 2 | Dispatches send action and creates a pending request with correct ID format | Request ID matches `req-YYYYMMDD-HHmmss-userid-hex4` pattern |
| 3 | Dispatches inbox action and returns pending requests for the user | Inbox contains seeded request |
| 4 | Dispatches respond action and completes a request | Status "completed", request moved to completed/ |
| 5 | Dispatches check_status action and returns request status | Status "pending", request object returned |
| 6 | Dispatches cancel action and moves request to cancelled | Status "cancelled", request in cancelled/ |
| 7 | Dispatches amend action and adds amendment to request | Amendment count incremented, fields in envelope |
| 8 | Dispatches view_thread action and returns thread history | Thread entries returned for the thread_id |

### Milestone 5: Error Handling (skip)

| # | Scenario | Observable Outcome |
|---|----------|--------------------|
| 9 | Rejects unknown action with error listing valid actions | Error mentions "deploy" and lists send, respond, cancel, inbox |
| 10 | Rejects request with missing action field | Error references "action" |
| 11 | Rejects request with empty action string | Error references "action" |
| 12 | Passes through recipient validation error from send handler unchanged | Error matches /charlie.*not found in team config/ |
| 13 | Passes through missing required field error from handler unchanged | Error matches /missing required field.*recipient/ |
| 14 | Passes through pact validation error when request type has no matching pact | Error matches /no pact found.*nonexistent-pact/ |

---

## Implementation Sequence

1. **Walking skeletons first** — 2 scenarios enabled (1 per file)
2. **Milestone 1** — Pact catalog details (enable one at a time)
3. **Milestone 2** — Discovery filtering
4. **Milestone 3** — Error resilience
5. **Milestone 4** — Action dispatch for all 7 actions
6. **Milestone 5** — Error handling passthrough

---

## Traceability

| Design Decision | Test Coverage |
|----------------|--------------|
| DD-1: Two meta-tools | Both test files exercise pact_discover and pact_do |
| DD-2: Action discriminator | Milestone 4 tests all 7 actions |
| DD-3: pact_discover response shape | Walking skeleton + Milestone 1 verify pacts, team, field definitions |
| DD-4: YAML frontmatter | All pact-discover tests use YAML frontmatter fixtures |
| DD-5: Brain processing optional | Milestone 1 tests has_hooks flag |
| DD-7: Condition evaluation | Contract format only — brain implementation is future wave |
| DD-8: Migration strategy | Tests target Phase 1 (additive) new surface |
