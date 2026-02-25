# Mutation Testing Report: pact-request.ts

**Date:** 2026-02-25
**Tool:** Stryker v9.5.1 + @stryker-mutator/vitest-runner
**Target:** `src/tools/pact-request.ts`
**Test suite:** 259 tests (full suite), coverage-guided per-test analysis
**Duration:** 6 minutes 59 seconds

---

## Summary

| Metric | Value |
|--------|-------|
| Total mutants | 112 |
| Killed | 94 |
| Timeout (implicit kill) | 1 |
| Survived | 12 |
| No coverage | 5 |
| **Kill rate (total)** | **84.82%** |
| **Kill rate (covered only)** | **88.79%** |

**Verdict: PASS** (>= 80% threshold)

---

## Per-Mutator-Type Breakdown

| Mutator | Killed | Survived | No Coverage | Timeout | Total | Kill % |
|---------|--------|----------|-------------|---------|-------|--------|
| ConditionalExpression | 25 | 6 | 0 | 1 | 32 | 81.3% |
| StringLiteral | 16 | 3 | 1 | 0 | 20 | 80.0% |
| BlockStatement | 14 | 1 | 1 | 0 | 16 | 87.5% |
| ObjectLiteral | 10 | 0 | 3 | 0 | 13 | 76.9% |
| BooleanLiteral | 7 | 0 | 0 | 0 | 7 | 100% |
| EqualityOperator | 5 | 2 | 0 | 0 | 7 | 71.4% |
| LogicalOperator | 5 | 0 | 0 | 0 | 5 | 100% |
| ArrowFunction | 4 | 0 | 0 | 0 | 4 | 100% |
| OptionalChaining | 4 | 0 | 0 | 0 | 4 | 100% |
| ArrayDeclaration | 3 | 0 | 0 | 0 | 3 | 100% |
| MethodExpression | 1 | 0 | 0 | 0 | 1 | 100% |

---

## Surviving Mutants (12)

### Send-path survivors (lines 91-155)

**1. Empty recipients guard is unreachable (lines 91-92) -- 3 mutants**

```
[ConditionalExpression] Line 91: if (recipientIds.length === 0) -> if (false)
[BlockStatement]        Line 91: { throw ... } -> {}          (NoCoverage)
[StringLiteral]         Line 92: "Recipients list must not be empty" -> ""  (NoCoverage)
```

Analysis: The guard `recipientIds.length === 0` is dead code -- the preceding
logic already throws `"Missing required field: recipient or recipients"` before
an empty array can reach this line. The ConditionalExpression mutant survived;
the BlockStatement and StringLiteral mutants had no coverage at all.

**2. Error message text not asserted (line 96) -- 1 mutant**

```
[StringLiteral] Line 96: "Sender cannot be a recipient" -> ""
```

Analysis: The test `rejects send when sender is in recipients array` asserts
the error is thrown but does not assert the exact message string.

**3. Validation warning boundary off-by-one (line 112) -- 2 mutants**

```
[ConditionalExpression] Line 112: if (missing.length > 0) -> if (true)
[EqualityOperator]      Line 112: missing.length > 0 -> missing.length >= 0
```

Analysis: When `missing.length` is 0, changing `> 0` to `>= 0` or `true`
produces an empty `validationWarnings` array instead of `undefined`. The tests
assert `validation_warnings: []` for the no-warnings case, which matches both
behaviors. A test asserting that `validation_warnings` is exactly `[]` (not a
zero-length array of strings) would kill these.

**4. Commit message formatting (lines 153-155) -- 3 mutants**

```
[ConditionalExpression] Line 153: recipientIds.length === 1 -> true
[StringLiteral]         Line 155: `[${recipientIds.join(",")}]` -> ``
[StringLiteral]         Line 155: "," -> ""
```

Analysis: The `recipientLabel` variable is only used in the git commit message
string. No test asserts commit message content for multi-recipient requests.

### Compose-path survivors (lines 190-208)

**5. Legacy fallback path in compose mode (line 190) -- 2 mutants**

```
[ConditionalExpression] Line 190: if (!pact) -> if (false)
[BlockStatement]        Line 190: { pact = await loadPactMetadata(...) } -> {}
```

Analysis: The compose-mode tests only exercise the flat-file loader path.
No test triggers compose mode with a legacy `pacts/{name}/PACT.md` format,
so the fallback branch is never tested.

**6. multi_round conditional in compose response (line 208) -- 3 mutants**

```
[ConditionalExpression] Line 208: pact.multi_round !== undefined -> true
[ConditionalExpression] Line 208: pact.multi_round !== undefined -> false
[EqualityOperator]      Line 208: pact.multi_round !== undefined -> pact.multi_round === undefined
```

Analysis: The compose-mode test pact does not set `multi_round`, and no test
asserts the presence/absence of `multi_round` in the compose response.

---

## No-Coverage Mutants (5)

| # | Mutator | Line | Description |
|---|---------|------|-------------|
| 1 | BlockStatement | 91 | Empty recipients guard block (dead code) |
| 2 | StringLiteral | 92 | Empty recipients error message (dead code) |
| 3 | ObjectLiteral | 207 | `{ defaults: pact.defaults }` -> `{}` in compose |
| 4 | ObjectLiteral | 208 | `{ multi_round: pact.multi_round }` -> `{}` in compose |
| 5 | ObjectLiteral | 209 | `{ attachments: pact.attachments }` -> `{}` in compose |

Items 3-5 are in `loadComposeResponse` -- the compose-mode tests do not
exercise pacts that have `defaults`, `multi_round`, or `attachments` set,
so these spread expressions have zero test coverage.

---

## Recommendations for Future Hardening

If aiming for 90%+ kill rate, the following test additions would close the gaps:

1. **Assert error message text** for "Sender cannot be a recipient" (kills 1 mutant)
2. **Assert commit message format** for multi-recipient sends (kills 3 mutants)
3. **Add compose-mode test with legacy pact directory** (kills 2 mutants)
4. **Add compose-mode test with a pact that sets multi_round, defaults, attachments** (kills 6 mutants -- 3 survived + 3 no-coverage)
5. **Remove dead code** at lines 91-92 (eliminates 3 mutants from scoring)

Items 4 and 5 together would bring the kill rate above 95%.

---

## Raw Data

Full JSON report: `reports/mutation/mutation.json`
