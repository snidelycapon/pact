# Review: Collapsed Tools + Declarative Brain Roadmap

**Reviewer**: nw-solution-architect-reviewer
**Date**: 2026-02-22
**Status**: APPROVED with minor observations

---

## Executive Summary

The roadmap is **well-structured, appropriately decomposed, and strategically sound**. The implementation strategy follows a proven three-phase approach (Build → Validate → Remove) that minimizes risk while maximizing observability. Step ordering respects dependencies, acceptance criteria are behavioral and measurable, and file modifications are accurate.

---

## Detailed Evaluation

### 1. Step Decomposition & Atomicity ✓

**Criterion**: Are steps self-contained and atomic?

**Findings**:
- **Excellent**. Each of the 9 steps is independently deliverable and testable:
  - Steps 01-01 through 01-03 (Phase 1) create core infrastructure with clear module boundaries (pact-loader, action-dispatcher, discovery-handler).
  - Steps 02-01 through 02-04 (Phase 2) integrate and validate the surface, with explicit gate conditions (existing tests pass, new tests pass).
  - Steps 03-01 and 03-02 (Phase 3) migrate and clean up with precise file lists.

- **Praise**: The pact-loader step (01-01) is particularly well-isolated—it has zero MCP surface dependencies and can be unit-tested with in-memory FilePort. This enables parallel development.

- **Praise**: Step 02-02 (MCP Registration - Additive) is correctly sequenced *after* individual handler completion but *before* acceptance test enablement. This respects the build-integration ordering.

---

### 2. Acceptance Criteria — Behavioral & Measurable ✓

**Criterion**: Are acceptance criteria behavioral and measurable?

**Findings**:
- **Strong across all steps**. Criteria are concrete and verifiable:

  - **01-01 (Pact Loader)**: "Returns typed metadata... Returns undefined for missing or malformed..." + explicit mutation score target (>90%) — this is measurable.
  - **01-02 (Action Dispatcher)**: "Unknown actions produce a descriptive error that lists all valid actions" — testable behavior, not vague intent.
  - **02-01 (pact_do Handler)**: "Walking skeleton acceptance test passes: Alice sends... Bob sees it..." — clear scenario.
  - **02-03 & 02-04**: Acceptance criteria directly reference existing test file structure (14 scenarios for discover, 13 for do) with milestone breakdown.

- **Observation**: The walking skeleton tests already exist and are 1-enabled / 14-15-skipped respectively (pact-discover.test.ts and pact-do.test.ts). This is correctly modeled—the roadmap will unskip these tests as implementation completes.

- **Minor Note**: Step 03-01 references "behavioral contract is unchanged" — this is correct but could be strengthened by adding "verified by running existing test suite without modifications" for absolute clarity.

---

### 3. Dependency Order ✓

**Criterion**: Does step ordering respect dependencies?

**Findings**:
- **Excellent ordering**. The three-phase structure respects hard and soft dependencies:

  **Phase 1 Build** (01-01 → 01-02 → 01-03):
  - Pact-loader (01-01) has no dependents; built first.
  - Action-dispatcher (01-02) depends on existing handler modules (unchanged).
  - Discovery-handler (01-03) depends on pact-loader and ConfigPort—correctly sequenced after 01-01.

  **Phase 2 Integration** (02-01 → 02-02 → 02-03 → 02-04):
  - pact_do (02-01) depends on action-dispatcher (01-02); correctly sequenced.
  - MCP registration (02-02) is additive and depends on both 02-01 (pact_do) and 01-03 (pact_discover).
  - Test enablement (02-03, 02-04) happens *after* MCP registration, which is correct.

  **Phase 3 Migration** (03-01 → 03-02):
  - Import migration (03-01) is done *before* removal (03-02); correct ordering.
  - Removal only happens after equivalence is proven (Phase 2).

- **Praise**: The roadmap correctly gates Phase 3 entry: "all existing acceptance and unit tests continue to pass unchanged" (02-02) precedes "remove 8 old tool registrations" (03-02).

---

### 4. Decomposition Granularity ✓

**Criterion**: Is granularity appropriate (not too fine, not too coarse)?

**Findings**:
- **Well-calibrated**. The 9-step breakdown hits the right grain size:
  - Not too coarse: Each step has a clear deliverable and testable gate.
  - Not too fine: Combined, steps cluster into natural phases that align with implementation risk profile.

- **Praise**: The three-phase structure (Build/Validate/Remove) is idiomatic for refactoring. Each phase has clear entry/exit criteria and rollback story.

- **Observation**: Step 02-02 (MCP Registration - Additive) is particularly well-scoped—it's additive-only with no deletions, making it a safe, easy-to-review change.

---

### 5. Files to Modify — Accuracy ✓

**Criterion**: Are files_to_modify accurate?

**Findings**:
- **Verified against current state**. The roadmap correctly identifies:

  **Phase 1 Creates** (New files):
  - `src/pact-loader.ts` — not yet created ✓
  - `src/action-dispatcher.ts` — not yet created ✓
  - `src/tools/pact-discover.ts` — not yet created ✓
  - `src/tools/pact-do.ts` — not yet created ✓

  **Phase 2 Modifies**:
  - `src/mcp-server.ts` — exists; will add registrations ✓
  - `src/server.ts` — exists; will add callTool cases ✓
  - `tests/acceptance/pact-discover.test.ts` — exists (1 enabled, 14 skipped); will unskip ✓
  - `tests/acceptance/pact-do.test.ts` — exists (1 enabled, 13 skipped); will unskip ✓

  **Phase 3 Migrates Import**:
  - `src/tools/pact-request.ts` — currently imports from pact-parser ✓
  - `src/tools/pact-inbox.ts` — currently imports from pact-parser ✓
  - Verified via grep: both are currently importing from pact-parser

  **Phase 3 Deletes**:
  - `src/pact-parser.ts` (291 lines) — currently exists ✓
  - `src/tools/pact-pacts.ts` (82 lines) — currently exists ✓
  - `tests/unit/pact-parser.test.ts` — exists ✓
  - `examples/pacts/*/schema.json` — exist ✓

- **Praise**: The file list in 03-02 is comprehensive and includes test files often overlooked in migration planning.

---

## Conventional Comment Observations

### Praise

**praise: Strategic risk mitigation**
The three-phase approach (Build additive → Validate both surfaces → Remove old) is a proven pattern that eliminates big-bang risk. By running all 10 tools simultaneously during Phase 2, you can detect behavioral divergence before committing to the change. This is first-class engineering.

**praise: Excellent test artifact reuse**
The acceptance test files (pact-discover.test.ts, pact-do.test.ts) already exist with 28 scenarios pre-written and 14-15 currently skipped. This DISTILL wave artifact is perfectly aligned with the roadmap phases. Step 02-03 and 02-04 simply unskip existing tests—there's no rework.

**praise: Clear walking skeleton strategy**
Each phase begins with a single "golden path" scenario (01-03, 02-01, 02-04) before expanding to edge cases. This is pedagogically sound and reduces cognitive load during implementation.

**praise: Files to modify are comprehensive and accurate**
The roadmap correctly identifies all touch points, including test files in Phase 3. The import migration step (03-01) is particularly good—it isolates the migration concern separately from the removal concern.

---

### Issues

**issue: None identified**

The roadmap is internally consistent, the strategy is sound, and the acceptance criteria are measurable. No corrections required.

---

### Suggestions

**suggestion: Document the pact-loader contract in roadmap step 01-01**
The acceptance criteria currently reference ">90% mutation score" but don't explicitly state the return type signature. Consider adding to step 01-01:
```
Returns: PactMetadata | undefined where PactMetadata = { name, version, description, when_to_use, context_bundle, response_bundle, has_hooks?, hooks? }
```
This makes it crystal clear what consumers (pact-discover, pact-request, pact-inbox) will depend on.

**suggestion: Add explicit "no breaking changes to handler modules" statement**
Step 02-02 states "All existing acceptance and unit tests continue to pass unchanged." Consider strengthening this to explicitly state: "Handler modules (pact-request, pact-inbox, etc.) retain existing function signatures and behavior. They are used as-is by action-dispatcher without modification."

This removes any ambiguity about whether handlers will be refactored during Phase 2.

---

### Nitpicks

**nitpick: Step 02-02 references "existing 8 tools" but the roadmap will have 10 at that point**
The acceptance criterion states: "All 10 tools are registered simultaneously." This is correct, but the phrasing in the criteria says "existing acceptance and unit tests continue to pass unchanged." Technically, there are 8 existing tools + 2 new ones = 10 total. This is already accurate, just noting the wording could clarify: "All 179 existing unit/acceptance tests for the original 8 tools continue to pass without modification."

**nitpick: Step 03-01 could explicitly call out the test impact**
The step says "pact-request.ts imports... Behavioral contract is unchanged: all existing acceptance tests... pass without any test modifications." This is true but could be clearer: "No test modifications are required during this step; import statements inside handlers are internal. Tests continue to call the old 8 tool names."

---

## Assessment

| Criterion | Status | Notes |
|-----------|--------|-------|
| Steps self-contained & atomic | ✓ PASS | Clear module boundaries; each step independently testable |
| Acceptance criteria behavioral & measurable | ✓ PASS | Concrete scenarios; testable gate conditions |
| Dependency ordering | ✓ PASS | Phase 1 → Phase 2 → Phase 3 respects all hard dependencies |
| Decomposition granularity | ✓ PASS | 9 steps; not too fine, not too coarse |
| Files to modify accurate | ✓ PASS | Verified against current codebase state |

---

## Recommendation

**STATUS: APPROVED** ✓

The roadmap is ready for implementation. It demonstrates strong architectural thinking, appropriate risk stratification, and measurable acceptance criteria. The three-phase approach ensures observability and reversibility throughout the build cycle.

**Next Steps**:
1. Begin Phase 1 with Step 01-01 (pact-loader implementation).
2. Use the pre-written acceptance tests (existing .test.ts files) as acceptance gates.
3. After Phase 2 validation, proceed to Phase 3 removal with confidence.

---

## Approval

- **Reviewer**: nw-solution-architect-reviewer
- **Decision**: APPROVED
- **Timestamp**: 2026-02-22T15:30:00Z
- **Comments**: Solid engineering; minimal rework; clear path forward.
