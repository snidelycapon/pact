# Phase 2 Mutation Testing Report

**Date:** 2026-02-21
**Tool:** Stryker Mutator v8 with Vitest runner
**Scope:** 7 production files, 104 tests (acceptance + unit)

## Overall Results

| Metric | Value |
|--------|-------|
| **Total mutants** | 288 |
| **Killed** | 211 |
| **Survived** | 37 |
| **No coverage** | 40 |
| **Mutation score (total)** | **73.26%** |
| **Mutation score (covered)** | **85.08%** |
| **Verdict** | **WARN** (70-80% range) |

## Per-File Breakdown

| File | Total % | Covered % | Killed | Survived | No Cov | Verdict |
|------|---------|-----------|--------|----------|--------|---------|
| schemas.ts | 100.00 | 100.00 | 7 | 0 | 0 | PASS |
| garp-respond.ts | 78.57 | 89.80 | 44 | 5 | 7 | WARN |
| garp-amend.ts | 76.92 | 83.33 | 20 | 4 | 2 | WARN |
| garp-inbox.ts | 75.00 | 80.60 | 54 | 13 | 5 | WARN |
| find-pending-request.ts | 74.07 | 90.91 | 20 | 2 | 5 | WARN |
| garp-cancel.ts | 70.00 | 73.68 | 14 | 5 | 1 | WARN |
| garp-status.ts | 65.00 | 86.67 | 52 | 8 | 20 | FAIL |

## Surviving Mutants Analysis

### Category 1: Input Validation Guards (6 survivors)

These mutants disable `if (!params.request_id)` or `if (!params.fields)` guards by replacing with `if (false)`. Tests survive because acceptance tests always provide valid input -- the validation path is unreachable from the test harness.

| File | Line | Mutation |
|------|------|----------|
| garp-amend.ts | 31 | `if (!params.request_id)` -> `if (false)` |
| garp-amend.ts | 32 | `if (!params.fields)` -> `if (false)` |
| garp-cancel.ts | 30 | `if (!params.request_id)` -> `if (false)` |
| garp-respond.ts | 31 | `if (!params.request_id)` -> `if (false)` |
| garp-status.ts | 76 | `if (!params.request_id)` -> `if (false)` |
| garp-respond.ts | 60 | `if (!parsed.success)` -> `if (false)` (schema validation guard) |

**Risk:** LOW. MCP SDK validates required fields before handlers are called. These guards are defense-in-depth.

**Recommendation:** Consider adding parametrized unit tests for missing-field validation if budget allows, or accept as defense-in-depth that is validated at the MCP layer.

### Category 2: Error Message Strings (7 survivors)

Mutations replace error message strings or return message strings with empty strings. Tests check error types but not exact message text.

| File | Line | Mutation |
|------|------|----------|
| garp-amend.ts | 39 | `"amended"` -> `""` (action string in findPendingRequest) |
| garp-amend.ts | 74 | `message: "Request amended"` -> `message: ""` |
| garp-cancel.ts | 37 | `"cancelled"` -> `""` (action string in findPendingRequest) |
| garp-cancel.ts | 57 | `message: "Request cancelled"` -> `message: ""` |
| garp-respond.ts | 97 | `message: "Response submitted"` -> `message: ""` |
| garp-cancel.ts | 49 | filename template literal -> `""` |
| garp-status.ts | 97 | `"requests/active"` directory string -> `""` |

**Risk:** LOW-MEDIUM. The action strings ("amended", "cancelled") affect error messages for already-completed/cancelled requests, which are tested but only match on prefix. The return `message` fields are informational only.

**Recommendation:** Tests for already-completed/cancelled states should assert the full error message text. Return messages are cosmetic and acceptable as survivors.

### Category 3: Schema Validation Bypass (5 survivors)

Mutations disable `if (!parsed.success)` checks, allowing malformed envelopes to pass through.

| File | Line | Mutation |
|------|------|----------|
| find-pending-request.ts | 52 | `if (!parsed.success)` -> `if (false)` |
| garp-respond.ts | 60 | `if (!parsed.success)` -> `if (false)` |
| garp-status.ts | 37 | `if (!parsed.success)` -> `if (false)` (parseRequestEnvelope) |
| garp-status.ts | 46 | `if (!parsed.success)` -> `if (false)` (parseResponseEnvelope) |
| garp-status.ts | 56 | `if (parsed.success)` -> `if (true)` (tryParseEnvelope) |

**Risk:** LOW. All tests use well-formed envelopes, so the malformed-envelope path is never exercised. In production, Zod schema validation provides protection. The `parseRequestEnvelope` and `parseResponseEnvelope` functions in garp-status.ts are graceful degradation (return raw data), so bypassing them does not change behavior for valid data.

**Recommendation:** Accept for status/find-pending -- these are resilience paths. Consider a malformed-envelope acceptance test for respond if the feature is safety-critical.

### Category 4: Sort/Order Logic (7 survivors)

Mutations disable or reverse sort comparators. The sort-order test passes because test data happens to already be in the expected order.

| File | Line | Mutation |
|------|------|----------|
| garp-inbox.ts | 130-131 | Thread group internal sort disabled/reversed |
| garp-inbox.ts | 131 | Sort comparator `a - b` -> `a + b` |
| garp-inbox.ts | 153-157 | Final sort disabled entirely / `aTime - bTime` -> `aTime + bTime` |

**Risk:** MEDIUM. Sorting mutations survive because test data is seeded in chronological order. If filesystem enumeration order changes, the test could mask a real sort bug.

**Recommendation:** Seed inbox test data in reverse-chronological order so the sort is actually exercised. This is the highest-priority fix.

### Category 5: Thread Group Aggregation (6 survivors)

Mutations break reduce callbacks for `attachment_count` and `amendment_count` in thread groups.

| File | Line | Mutation |
|------|------|----------|
| garp-inbox.ts | 146 | `attachment_count: group.reduce(...)` -> `() => undefined` |
| garp-inbox.ts | 146 | `sum + e.attachment_count` -> `sum - e.attachment_count` |
| garp-inbox.ts | 147 | `amendment_count: group.reduce(...)` -> `() => undefined` |
| garp-inbox.ts | 147 | `sum + e.amendment_count` -> `sum - e.amendment_count` |
| garp-inbox.ts | 101 | `envelope.attachments.length > 0` -> `true` / `>= 0` |

**Risk:** MEDIUM. Thread group tests do not assert aggregated counts. The `> 0` vs `>= 0` / `true` mutations survive because tests never create a thread group where one request has attachments and another does not.

**Recommendation:** Add assertions for aggregated `attachment_count` and `amendment_count` in the thread-group test. Ensure at least one request in the group has attachments to differentiate `> 0` from `>= 0`.

### Category 6: Active Directory Lookup (4 survivors)

Mutations disable the active-directory search path in respond and status.

| File | Line | Mutation |
|------|------|----------|
| garp-respond.ts | 45 | `"requests/active"` -> `""` |
| garp-respond.ts | 46 | `if (activeFiles.includes(filename))` -> `if (false)` |
| garp-status.ts | 97 | `"requests/active"` -> `""` |
| garp-status.ts | 98 | `if (activeFiles.includes(...))` -> `if (false)` |

**Risk:** LOW. The active/ directory is a Tier 2 feature (brain service acknowledgment) that is not yet exercised by any test. All current tests use pending/ or completed/.

**Recommendation:** Defer until Tier 2 active-state feature is implemented. These paths will need dedicated tests at that point.

### Category 7: Cancelled Directory in find-pending-request (2 survivors)

| File | Line | Mutation |
|------|------|----------|
| find-pending-request.ts | 43 | `if (cancelledFiles.includes(filename))` -> `if (true)` |

**Risk:** LOW. The mutation changes the cancelled-check to always-true, but the test still sees the correct error message because the cancelled path returns the right error type. The test matches on error occurrence, not on the exact condition that triggered it.

**Recommendation:** Acceptable. The error path is tested; the condition specificity is defense-in-depth.

## No-Coverage Mutants (40 total)

These mutants are in code paths that no test reaches at all:

- **garp-status.ts (20):** Primarily in the active/ directory code path and in graceful-degradation branches (malformed envelope fallback, warning propagation). Most relate to Tier 2 active-state or resilience edge cases.
- **garp-respond.ts (7):** Active directory fallback path, schema validation error formatting.
- **find-pending-request.ts (5):** "Not found" error message text, malformed envelope error formatting.
- **garp-inbox.ts (5):** Malformed envelope skip logic, "No summary" fallback text.
- **garp-amend.ts (2):** Missing-field error message text.
- **garp-cancel.ts (1):** Missing-field error message text.

Most no-coverage mutants are in error-formatting code (string interpolation, log calls) or the Tier 2 active/ directory path.

## Priority Recommendations

### P1 - Fix Now (improves kill rate to ~80%+)

1. **Seed inbox sort tests with reverse-chronological data** so sort mutations are killed.
2. **Assert aggregated counts in thread-group test** (attachment_count, amendment_count should sum correctly).
3. **Assert error message content** for already-completed/cancelled rejection in amend and cancel tests.

### P2 - Fix Soon

4. **Add a malformed-envelope test** for find-pending-request to exercise the schema validation guard.
5. **Add thread-group test with mixed attachment presence** to kill the `> 0` vs `>= 0` mutation.

### P3 - Defer

6. **Active directory path tests** -- wait for Tier 2 implementation.
7. **Input validation guards** -- defense-in-depth behind MCP SDK validation.
8. **Error message string literals** -- cosmetic, not behavioral.

## Conclusion

The overall mutation score of **73.26%** (85.08% on covered code) falls in the WARN range. The codebase has strong behavioral coverage for happy paths and primary error cases. The surviving mutants cluster in three categories: (1) sort-order tests that do not actually exercise sorting, (2) thread-group aggregation without assertions, and (3) code paths for not-yet-implemented features (active directory). Implementing P1 recommendations would likely push the score above 80%.
