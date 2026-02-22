# Handoff: Phase A Complete → Phase B Ready

**Date**: 2026-02-22
**Feature**: PACT Code Mode — progressive pact discovery and typed contracts
**Status**: Phase A delivered. Phase B designed but not built.

---

## What Was Built (Phase A)

Phase A applied code mode patterns to PACT's pact system. Everything shipped, tested, and pushed.

### New Production Code

| File | Lines | What It Does |
|------|-------|-------------|
| `src/pact-parser.ts` | 291 | Shared module: extracts metadata from PACT.md and schema.json. Pure functions + FilePort dependency. |
| `src/tools/pact-pacts.ts` | 82 | MCP tool #8: lists/searches available pacts with metadata. Optional keyword query. |

### Modified Production Code

| File | Change |
|------|--------|
| `src/ports.ts` | Added `readText(path)` and `fileExists(path)` to FilePort interface |
| `src/adapters/file-adapter.ts` | Implemented `readText` and `fileExists` |
| `src/tools/pact-request.ts` | Schema validation: warns on missing required fields via `validation_warnings` (WARN not REJECT) |
| `src/tools/pact-inbox.ts` | Pact enrichment: adds `pact_description` and `response_fields` to inbox entries, per-invocation cache |
| `src/mcp-server.ts` | Registered `pact_pacts` as 8th tool |
| `src/server.ts` | Added `pact_pacts` to callTool dispatcher |

### New Pact Schemas

4 `schema.json` files alongside existing PACT.md files:
- `examples/pacts/ask/schema.json`
- `examples/pacts/code-review/schema.json`
- `examples/pacts/design-pact/schema.json`
- `examples/pacts/sanity-check/schema.json`

Convention: `additionalProperties: true` — required fields enforced, creative extension allowed.

### Test Suite

**179 tests passing** across 23 test files. 46 new tests added for Phase A:

| Test File | Tests | Coverage |
|-----------|-------|----------|
| `tests/unit/pact-parser.test.ts` | 14 | PACT.md parsing, schema.json preference, error tolerance |
| `tests/acceptance/pact-pacts.test.ts` | 10 | Listing, search, schema preference, fallback, git pull |
| `tests/acceptance/pact-schema.test.ts` | 9 | Validation warnings, backward compat, additionalProperties |
| `tests/acceptance/inbox-enrichment.test.ts` | 9 | Enrichment, caching, graceful degradation |
| `tests/integration/adapters/file-adapter-extended.test.ts` | 6 | readText, fileExists |

### Architecture Decision Records

| ADR | Decision |
|-----|----------|
| ADR-010 | Pact metadata lives in `src/pact-parser.ts` at application core, not a new port |
| ADR-011 | Schema validation uses key-presence-only checks, plain TypeScript, no ajv |
| ADR-012 | FilePort extended with `readText` + `fileExists` (fixes prior `existsSync` port violation) |

---

## Mutation Testing Results

Stryker ran against all 5 Phase A production files. 404 mutants generated.

**Overall: 74.75%** (below 80% threshold)

| File | Score | Killed | Survived | No Coverage |
|------|-------|--------|----------|-------------|
| `pact-request.ts` | 91.43% | 64 | 4 | 2 |
| `file-adapter.ts` | 89.29% | 25 | 3 | 0 |
| `pact-inbox.ts` | 83.15% | 74 | 9 | 6 |
| `pact-pacts.ts` | 67.57% | 25 | 7 | 5 |
| `pact-parser.ts` | **63.33%** | 114 | 57 | 9 |

### Assessment

- `pact-request.ts` and `file-adapter.ts` are solid (>89%).
- `pact-inbox.ts` passes the threshold (83%).
- `pact-pacts.ts` (67.57%) has gaps in query filtering and fallback edge cases.
- `pact-parser.ts` (63.33%) is the weak spot — 57 surviving mutants, mostly in the PACT.md markdown parsing logic (string matching, section detection, table parsing heuristics).

### Open Question

The 57 survivors in `pact-parser.ts` are concentrated in markdown parsing heuristics. Options before Phase B:
1. **Strengthen tests** — add edge case tests for parsing to get above 80%
2. **Simplify the parser** — if 57 mutants survive, the logic may be overbuilt; refactoring could reduce surface
3. **Accept and move on** — the high-value code paths are well-tested; survivors are in markdown parsing edge cases that may not matter in practice

---

## What Phase A Enables

Phase A is not throwaway — every artifact feeds forward into Phase B:

| Phase A Artifact | Phase B Consumer |
|-----------------|-----------------|
| `pact-parser.ts` | Becomes the backend for `pact_discover` meta-tool |
| `schema.json` convention | Input for typed SDK generation |
| `pact_pacts` tool | Evolves into or backs `pact_discover` |
| `validation_warnings` pattern | Extends to `pact_execute` code validation |
| FilePort `readText`/`fileExists` | Used by all future file-based operations |

---

## What Phase B Is (Designed, Not Built)

Phase B addresses the trajectory problem: at 30 tools + 100 pacts, PACT consumes ~40,000 tokens (20% of context) at startup. Phase B collapses this to O(1).

### Proposed Architecture

Replace N MCP tools with 2-3 meta-capabilities:

- **`pact_discover`** — unified search across pacts, requests, threads, team members
- **`pact_execute`** — LLM writes code against a typed PACT SDK
- **Typed SDK generation** — TypeScript interfaces generated from tool definitions + pact schemas

### Open Design Questions

1. **Git safety**: Each current tool performs atomic git cycles. How does code-as-plan execution maintain atomicity? Options: (a) each SDK function independently atomic, (b) transactional rollback wrapper, (c) dry-run validation before commit.
2. **HITL balance**: Code execution reduces inspectability. Mitigation: show generated code as "the plan" before execution.
3. **Incremental migration**: Meta-tools must coexist with individual tools during transition. Agents that don't support code mode keep using individual tools.
4. **Trigger point**: When does Phase B become necessary? Proposed: tool count > 15 or pact count > 20.

### Phase B Artifacts Needed

- DESIGN wave for meta-tool architecture (git safety, SDK shape, migration strategy)
- DISTILL wave for acceptance tests
- DELIVER wave for implementation

---

## Key Design Decisions (Durable)

These decisions carry forward and should not be revisited without new evidence:

1. **WARN not REJECT** — validation warnings are advisory. The dumb router stays dumb.
2. **`additionalProperties: true`** — schemas enforce minimum contracts, not maximum. Creative extension is a feature.
3. **Pacts without schema.json work identically** — schema.json is optional and additive.
4. **Ports-and-adapters preserved** — Phase A changes are at the application core and tool layer, not the port/adapter boundary (except the FilePort extension which fixes a prior violation).
5. **Zero new runtime dependencies** — all Phase A work uses existing deps only.

---

## Artifacts Index

### Discovery
- `docs/discovery/code-mode/problem-validation.md`
- `docs/discovery/code-mode/opportunity-tree.md`
- `docs/discovery/code-mode/solution-testing.md`
- `docs/discovery/code-mode/lean-canvas.md`
- `docs/discovery/code-mode/interview-log.md`
- `docs/discovery/code-mode/dor-validation.md`

### Requirements
- `docs/requirements/us-019-pact-pacts-tool.md`
- `docs/requirements/us-020-inbox-pact-enrichment.md`
- `docs/requirements/us-021-pact-schema-json.md`
- `docs/requirements/backlog-code-mode.md`

### Architecture
- `docs/architecture/phase-a-pact-discovery.md`
- `docs/adrs/adr-010-pact-metadata-module.md`
- `docs/adrs/adr-011-schema-json-validation-strategy.md`
- `docs/adrs/adr-012-fileport-readtext-extension.md`

### UX
- `docs/ux/code-mode/journey-pact-discovery.feature` (16 Gherkin scenarios)
- `docs/ux/code-mode/journey-pact-discovery.yaml`
- `docs/ux/code-mode/journey-pact-discovery-visual.md`
- `docs/ux/code-mode/shared-artifacts-registry.md`

### Mutation Testing
- `reports/mutation/mutation.html` (Stryker HTML report)
- Stryker config: `stryker.config.json` (updated with `ignorePatterns` for `.beads`, `.nwave`, `repos`)

---

## Commits

- `58ebfe9` — `feat(code-mode): add progressive pact discovery and typed contracts (Phase A)`
- `7501a01` — `chore: track untracked docs, config, and build artifacts`
