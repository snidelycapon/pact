# Evolution Document: Phase 2 Polish (Wave 2 + Wave 3)

**Date**: 2026-02-22
**Project ID**: phase2-polish
**Scope**: Wave 2 (Lifecycle + Attachments) and Wave 3 (Pacts + Convention)
**Baseline**: Phase 2 Wave 1 (thread foundation) at commit cde3be5

---

## Feature Summary

Phase 2 Polish completes the PACT protocol's lifecycle and metadata capabilities. Wave 2 adds request cancellation, amendment, status consistency, and attachment/amendment surfacing to read-side tools. Wave 3 delivers two pact examples and a convention document for inbox auto-polling. Together they close out Phase 2's user stories US-012 through US-018.

**Before**: Requests had a one-way lifecycle (pending -> completed). No cancellation, no amendment, no attachment visibility in inbox/status. No pact examples beyond the initial ask pact.

**After**: Full lifecycle (pending -> completed | cancelled), amendments that preserve history, attachment metadata surfaced in inbox and status, two pacts demonstrating advanced patterns, and a convention for auto-poll adoption.

---

## What Was Delivered

### Wave 2: Lifecycle + Attachments (7 stories)

| Step | Story | What It Does |
|------|-------|-------------|
| 01-01 | Schema foundation | AmendmentEntrySchema, envelope extensions (amendments, cancel_reason), cancelled/ directory |
| 01-02 | US-013: pact_cancel | Cancel pending requests with authorization check, moves to cancelled/ with status consistency |
| 01-03 | US-014: pact_amend | Append amendments to pending requests, preserving original context and full history |
| 01-04 | US-015: Status consistency | pact_respond sets status="completed" in JSON before git mv |
| 02-01 | US-013/US-015: Cancelled scan | pact_status scans cancelled/ directory, returns "cancelled" status with cancel_reason |
| 02-02 | US-012: Attachment + amendment surfacing | Inbox shows attachment metadata and amendment_count for entries and thread groups |
| 02-03 | US-012: Attachment paths in status | pact_status returns absolute file paths for attachments |

### Wave 3: Pacts + Convention (3 stories)

| Step | Story | What It Does |
|------|-------|-------------|
| 03-01 | US-017: Sanity-check PACT.md | Pact for bug investigation validation with structured context bundle |
| 03-02 | US-018: Code-review PACT.md | Pact with Expected Attachments section (diff file pattern) |
| 03-03 | US-016: Auto-poll convention | Convention document for Claude Code (system prompt) and Craft Agents (hook pattern) |

---

## Architecture Changes

### New Production Files

| File | Lines | Purpose |
|------|-------|---------|
| `src/tools/pact-cancel.ts` | 58 | Cancel handler: authorization, status mutation, git mv to cancelled/ |
| `src/tools/pact-amend.ts` | 76 | Amend handler: authorization, amendment append, envelope write-back |
| `src/tools/find-pending-request.ts` | 59 | Shared helper: locate request in pending/, check completed/cancelled |

### Modified Production Files

| File | Change |
|------|--------|
| `src/schemas.ts` | +AmendmentEntrySchema, +amendments/cancel_reason to RequestEnvelopeSchema |
| `src/server.ts` | +pact_cancel and pact_amend tool dispatch |
| `src/mcp-server.ts` | +pact_cancel and pact_amend MCP tool registration |
| `src/tools/pact-respond.ts` | Sets status="completed" before git mv |
| `src/tools/pact-inbox.ts` | Surfaces attachment metadata and amendment_count |
| `src/tools/pact-status.ts` | Scans cancelled/ directory, returns attachment_paths |

### Refactoring (RPP L1-L4)

- **Extracted `find-pending-request.ts`**: pact_cancel, pact_amend, and pact_respond all shared identical logic to locate a pending request, check authorization, and detect already-completed/cancelled states. Extracted to a shared helper (L2 duplication elimination).
- **Extracted `seedPendingRequest`**: Test helper factored out of pact-cancel and pact-amend test files into `setup-test-repos.ts` (test DRY).
- **Net result**: -86 lines across the refactoring pass despite adding functionality.

### Structural Pattern

The new tools follow the same ports-and-adapters pattern established in Phase 1. Each tool handler receives port instances, performs validation, delegates to ports for git/file operations, and returns a typed result. No new ports or adapters were needed -- the existing GitPort, FilePort, and ConfigPort interfaces were sufficient.

---

## Quality Metrics

### Test Coverage

| Metric | Before (Phase 2 Wave 1) | After (Phase 2 Polish) | Delta |
|--------|------------------------|----------------------|-------|
| Total tests | 96 | 119 | +23 |
| Test files | 15 | 18 | +3 |
| Production files | 12 | 16 | +4 |
| All passing | Yes | Yes | -- |

### New Test Breakdown

| File | New Tests | What They Cover |
|------|-----------|-----------------|
| `pact-cancel.test.ts` | 5 | Happy path, auth check, already-completed, already-cancelled, cancel reason |
| `pact-amend.test.ts` | 5 | Happy path, multiple amendments, auth check, already-completed, already-cancelled |
| `pact-respond.test.ts` | 1 | Status field set to "completed" after respond |
| `pact-status.test.ts` | 4 | Cancelled scan, cancelled with reason, attachment paths present, attachment paths absent |
| `pact-inbox.test.ts` | 2 | Amendment count in entries, attachment metadata in entries |
| `schemas.test.ts` | 3 | AmendmentEntrySchema valid, missing fields, backward compatibility |
| Mutation-driven | 3 | Reverse-chronological sort, aggregated counts, error message content |

### Mutation Testing

| Metric | Value |
|--------|-------|
| Tool | Stryker Mutator v8 + Vitest |
| Total mutants | 288 |
| Killed | 211 |
| Survived | 37 |
| No coverage | 40 |
| Mutation score (total) | 73.26% |
| Mutation score (covered only) | 85.08% |

Post-mutation test hardening (commit 816ddf7) addressed the P1 recommendations: reverse-chronological sort seeding, aggregated count assertions, and error message content assertions.

### Execution Discipline

- 10/10 steps completed via 5-phase TDD cycle (PREPARE, RED_ACCEPTANCE, RED_UNIT, GREEN, COMMIT)
- 6 RED_UNIT phases skipped with justification (acceptance tests provided sufficient behavioral coverage through driving port)
- 4 RED phases skipped for documentation-only artifacts (03-01, 03-02, 03-03)
- L1-L4 RPP refactoring pass completed (commit 8f6e818)
- Adversarial review completed -- all blockers were false positives
- DES integrity verification: all 10 steps verified

---

## Timeline

All 10 steps completed on 2026-02-22, spanning approximately 35 minutes of execution time.

| Phase | Steps | Time Range (UTC) | Duration |
|-------|-------|------------------|----------|
| 01: Schema + Cancel + Amend | 01-01 through 01-04 | 02:34 - 02:50 | ~16 min |
| 02: Read-Side Enhancements | 02-01 through 02-03 | 02:52 - 03:03 | ~11 min |
| 03: Pacts + Convention | 03-01 through 03-03 | 02:52 - 03:05 | ~13 min |

Phases 02 and 03 ran with significant parallelism -- steps from both phases were interleaved in the execution log.

---

## Key Technical Decisions

### Shared Helper Extraction Over Inheritance

pact_cancel, pact_amend, and pact_respond all need to: pull, find a pending request, verify authorization, and detect already-terminal states. Rather than introducing a base class or middleware pattern, a pure function (`findPendingRequest`) was extracted. This keeps tool handlers as standalone functions consistent with the existing architecture.

### Amendment as Append-Only Array

Amendments are appended to an array on the envelope rather than mutating fields in place. This preserves the full amendment history and avoids merge conflicts when concurrent amendments occur. The trade-off is slightly larger envelope files, which is negligible for the expected scale.

### Status Field Consistency as Explicit Step

Rather than inferring status from directory location, the respond handler now explicitly sets `status: "completed"` in the JSON before moving the file. This makes the envelope self-describing -- a reader can determine status from the file alone without knowing its directory context.

### Cancelled as a Peer Directory

`cancelled/` sits alongside `pending/` and `completed/` rather than being a status-only flag. This follows the directory-as-lifecycle pattern from ADR-005 and keeps the filesystem browsable.

---

## Lessons Learned

### What Went Well

**Parallel step execution paid off.** Phases 02 and 03 had minimal dependencies, allowing interleaved execution. Steps 03-01, 03-02, and 03-03 (documentation artifacts) completed between the RED and GREEN phases of 02-01 and 02-02, keeping total wall time low.

**Refactoring after GREEN was clean.** The RPP sweep (L1-L4) happened after all 10 steps were green. Having full test coverage meant the extraction of `find-pending-request.ts` and `seedPendingRequest` could be verified instantly. Net -86 lines.

**Mutation testing found real gaps.** The P1 findings (sort order, aggregated counts, error messages) were legitimate test weaknesses. The sort-order tests were passing by coincidence -- data happened to be in the expected order. Mutation testing caught what code review and acceptance criteria did not.

**Schema-first approach prevented drift.** Step 01-01 establishing AmendmentEntrySchema and envelope extensions before any tool implementation meant all subsequent steps had a shared, validated contract.

### What Was Tricky

**Cancelled scan ordering.** pact_status scans pending/, completed/, and cancelled/ directories. The scan order matters because a request ID should never exist in multiple directories, but if it does (data corruption), the first match wins. The chosen order (pending -> completed -> cancelled) prioritizes the most actionable state.

**Thread group aggregation complexity.** Summing amendment_count and attachment_count across thread group entries added complexity to pact_inbox. The mutation testing confirmed this -- several surviving mutants were in the reduce callbacks. The thread group aggregation is the most complex single function in the codebase.

**No-coverage mutants for active/ directory.** 20 of the 40 no-coverage mutants are in the active/ directory code path in pact_status, which is infrastructure for the Tier 2 brain service feature. These paths exist but are untested because the feature is not yet implemented. This is accepted debt.

---

## File Manifest

### Production (22 files changed, +1673 / -104 lines)

New files:
- `src/tools/pact-cancel.ts` (58 lines)
- `src/tools/pact-amend.ts` (76 lines)
- `src/tools/find-pending-request.ts` (59 lines)
- `examples/pacts/sanity-check/PACT.md`
- `examples/pacts/code-review/PACT.md`
- `docs/conventions/inbox-autopoll.md`

Modified files:
- `src/schemas.ts`, `src/server.ts`, `src/mcp-server.ts`
- `src/tools/pact-respond.ts`, `src/tools/pact-inbox.ts`, `src/tools/pact-status.ts`
- `scripts/pact-init.sh`

### Tests

New files:
- `tests/acceptance/pact-cancel.test.ts`
- `tests/acceptance/pact-amend.test.ts`

Modified files:
- `tests/acceptance/pact-respond.test.ts`, `tests/acceptance/pact-inbox.test.ts`
- `tests/acceptance/pact-status.test.ts`, `tests/acceptance/helpers/setup-test-repos.ts`
- `tests/unit/schemas.test.ts`, `tests/unit/mcp-server.test.ts`

### Feature Documentation

- `docs/feature/phase2-polish/roadmap.yaml`
- `docs/feature/phase2-polish/execution-log.yaml`
- `docs/feature/phase2-polish/mutation/mutation-report.md`

---

## Commit History

```
816ddf7  test(phase2-polish): strengthen tests to improve mutation kill rate
8f6e818  refactor(phase2-polish): L1-L4 RPP sweep on Wave 2 implementation
026ee0f  fix(phase2-polish): correct invalid RED_UNIT log entries for 01-02 and 02-01
348a56b  feat(pact-inbox): add amendment_count and attachment metadata to inbox - step 02-02
185a3c1  feat(phase2-polish): pact_status cancelled scan and type update - step 02-01
0409c79  feat(phase2-polish): attachment paths in status (US-012 partial) - step 02-03
1f958bf  docs(phase2-polish): inbox auto-poll convention (US-016) - step 03-03
385b1dc  feat(phase2-polish): code-review PACT.md (US-018) - step 03-02
dbe3c87  feat(phase2-polish): sanity-check PACT.md (US-017) - step 03-01
e54c230  feat(phase2-polish): pact_respond status consistency (US-015) - step 01-04
57a8e46  feat(phase2-polish): pact_amend tool (US-014) - step 01-03
f5cad78  feat(phase2-polish): pact_cancel tool (US-013) - step 01-02
4e18c5f  feat(phase2-polish): add AmendmentEntrySchema and cancelled directory - step 01-01
```

13 commits total (10 implementation steps + 1 execution log fix + 1 refactoring + 1 mutation hardening).
