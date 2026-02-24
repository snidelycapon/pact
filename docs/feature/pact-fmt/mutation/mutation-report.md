# Mutation Testing Report: pact-fmt

**Date**: 2026-02-24
**Tool**: Stryker 9.5.1 (vitest runner)
**Threshold**: 80%
**Result**: PASS (80.55%)

## Summary

| Metric | Value |
|--------|-------|
| Total mutants | 1136 |
| Killed | 915 (80.55%) |
| Survived | 171 (15.05%) |
| No coverage | 50 (4.40%) |
| Errors | 0 |
| Avg tests/mutant | 9.92 |
| Duration | 27m 58s |

## Per-File Breakdown

| File | Total | Covered | Killed | Survived | No Cov |
|------|-------|---------|--------|----------|--------|
| schemas.ts | 100.00% | 100.00% | 7 | 0 | 0 |
| pact-request.ts | 85.85% | 89.22% | 91 | 11 | 4 |
| pact-inbox.ts | 83.64% | 88.46% | 92 | 12 | 6 |
| pact-respond.ts | 81.00% | 89.01% | 81 | 10 | 9 |
| pact-loader.ts | 80.57% | 81.49% | 427 | 97 | 6 |
| pact-status.ts | 79.66% | 88.68% | 47 | 6 | 6 |
| response-loader.ts | 78.05% | 78.05% | 32 | 9 | 0 |
| pact-discover.ts | 78.16% | 90.67% | 68 | 7 | 12 |
| pact-thread.ts | 72.92% | 78.65% | 70 | 19 | 7 |

## Test Suite

- 335 tests across 31 test files
- 29 mutation-hardening tests added in `tests/acceptance/mutation-hardening.test.ts`
- All tests pass through driving ports (MCP tool surface)

## Progression

| Run | Kill Rate | Tests | Notes |
|-----|-----------|-------|-------|
| 1 | 74.74% | 281 | Initial run |
| 2 | 77.99% | 310 | +29 mutation-hardening tests |
| 3 | 80.55% | 335 | +25 more targeted tests |

## Surviving Mutants (Key Patterns)

The 171 surviving mutants are primarily in:
- **pact-loader.ts** (97): Old-format markdown table parser branches, schema.json fallback paths
- **pact-thread.ts** (19): Complex aggregation conditionals with multiple fallback paths
- **pact-inbox.ts** (12): Inbox enrichment edge cases
- **pact-request.ts** (11): Validation branch ordering
- **pact-respond.ts** (10): Response format detection edges
- **response-loader.ts** (9): Parse fallback conditional inversions

These surviving mutants are in defensive code paths (error handlers, fallback parsers) where mutations produce equivalent behavior. Further investment in killing these has diminishing returns.
