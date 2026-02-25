# Monitoring & Alerting: pact-y30 (Post-Apathy Revision)

**Feature**: pact-y30 — Flat-file format, catalog metadata, default pacts, group addressing
**Architect**: Apex (nw-platform-architect)
**Date**: 2026-02-24
**Supersedes**: pact-q6y monitoring-alerting (pre-apathy, 2026-02-23)

---

## Context

PACT is a local dev tool. There is no production server to monitor, no uptime SLA, no alerting infrastructure. "Monitoring" for this project means:

1. **Code quality metrics** -- test coverage, mutation score, build health
2. **Dependency health** -- audit results, outdated packages
3. **Project velocity** -- DORA metrics adapted for a local tool
4. **Git audit trail** -- the primary debugging mechanism for group operations

---

## Code Quality Metrics

### Test Coverage

Tracked via vitest's built-in coverage reporter. Not currently in CI (add when coverage tooling is configured).

| Metric | Current | Target (post pact-y30) |
|--------|---------|------------------------|
| Unit test count | 96 | ~130 (new loader, schema, group scenarios) |
| Integration test count | (in 96 total) | +10-15 (inheritance, per-respondent) |
| Acceptance test count | (in 96 total) | +5-8 (group send/respond/inbox end-to-end) |

**Quality gate**: All tests must pass on both Node 20 and 22. No test skip annotations without a linked issue.

### Mutation Score (Stryker)

Tracked via Stryker mutation testing, run on push to main. Report uploaded as CI artifact.

| Metric | Meaning |
|--------|---------|
| **Mutation score** | % of mutants killed by tests |
| **Survived mutants** | Mutants that tests did not detect -- test gaps |
| **No coverage mutants** | Mutants in code not covered by any test |

**Current targets** (11 mutation files):

| File | Expected Mutation Score |
|------|----------------------|
| `schemas.ts` | High (Zod validation catches most mutations) |
| `pact-loader.ts` | Medium-high (new glob + inheritance logic needs thorough tests) |
| `pact-request.ts` | High (recipients validation) |
| `pact-respond.ts` | High (per-respondent write path) |
| `pact-inbox.ts` | High (filter logic) |
| `pact-status.ts` | Medium (directory read + backward compat) |
| `pact-thread.ts` | Medium (directory read + backward compat) |
| `pact-discover.ts` | Medium (catalog format generation) |
| `action-dispatcher.ts` | High (routing is simple) |

**Threshold strategy**: Establish baseline after pact-y30 implementation. Set `thresholds.break` at 10 points below baseline. Avoid premature thresholds.

### Build Health

| Metric | Source | Target |
|--------|--------|--------|
| Build pass rate (main) | GitHub Actions | >95% (occasional infra flakiness OK) |
| Build pass rate (PRs) | GitHub Actions | >90% (iteration is expected) |
| Build duration | GitHub Actions | <5 min for `check` job |
| TypeScript errors | `bun run typecheck` | 0 errors at all times |

---

## Dependency Health

### npm Audit

Run on every push and PR (see ci-cd-pipeline.md `security` job).

| Metric | Gate |
|--------|------|
| Critical vulnerabilities (production) | 0 -- blocks merge |
| High vulnerabilities (production) | 0 -- blocks merge |
| Moderate vulnerabilities (production) | Assessed per-case |
| Dev dependency vulnerabilities | Not gated (not shipped) |

**Current runtime dependencies** (4 total):
- `@modelcontextprotocol/sdk` ^1.24.3
- `simple-git` ^3.32.1
- `yaml` ^2.8.2
- `zod` ^4.0.0

### Outdated Dependencies

Not automated in CI. Manual check periodically:

```bash
npm outdated
```

**Update strategy**:
- Patch versions: Update freely, run full test suite
- Minor versions: Update, review changelog, run full test suite
- Major versions: Evaluate breaking changes, create dedicated PR

### License Compliance

Run on every push and PR (see ci-cd-pipeline.md `security` job).

**Allowed licenses**: MIT, ISC, BSD-2-Clause, BSD-3-Clause, Apache-2.0, 0BSD

---

## CI Health Dashboard

GitHub Actions provides built-in visibility. No external dashboard needed.

### Key Views

| View | URL Pattern | What It Shows |
|------|-------------|---------------|
| Workflow runs | `/{repo}/actions` | Pass/fail history for all branches |
| Branch protection | `/{repo}/settings/branches` | Required checks status |
| PR checks | PR page "Checks" tab | Per-PR quality gate results |
| Mutation report | Workflow run "Artifacts" | Stryker HTML report (14-day retention) |

### Flakiness Detection

If `check` job fails on main without code changes:

1. Check if failure is in tests (test flakiness) or infrastructure (npm registry, GitHub Actions outage)
2. For test flakiness: file issue, fix the test. PACT tests use deterministic IDs and no real git remotes in unit tests -- flakiness should be rare.
3. For infrastructure: re-run the workflow. No automatic retry.

---

## DORA Metrics (Adapted)

DORA metrics for a local dev tool without production deployment:

| DORA Metric | Adaptation for PACT | How to Measure |
|-------------|--------------------|----|
| **Deployment frequency** | npm publish frequency | Count `v*` tags per month |
| **Lead time for changes** | PR open to merge time | GitHub PR analytics |
| **Change failure rate** | Reverts on main / total merges | `git log --oneline --grep="revert"` |
| **Time to restore** | Time from bug report to fix merge | Issue close time in GitHub |

### Current Targets (Pre-1.0)

| Metric | Target | Rationale |
|--------|--------|-----------|
| Publish frequency | Monthly or on-demand | Pre-1.0, no SLA |
| PR lead time | < 1 day | Small team, short-lived branches |
| Change failure rate | < 10% | Adequate test coverage should prevent regressions |
| Time to restore | < 1 day | Small codebase, single maintainer can hotfix quickly |

---

## Git Commit Audit Trail

Every PACT state change produces a git commit. This is the primary audit mechanism -- immutable, distributed, and free.

### Group Operation Commits

| Operation | Commit Message Pattern | Files Touched |
|-----------|----------------------|---------------|
| Group send | `pact: send {request_type} to {group_ref} ({n} recipients)` | `requests/pending/{id}.json` |
| Group respond | `pact: {user_id} responds to {request_id}` | `responses/{id}/{user_id}.json` |
| Completion | `pact: complete {request_id}` | `requests/completed/{id}.json` (git mv) |

### Audit Queries

```bash
# All group sends in the last week
git log --oneline --since="1 week ago" --grep="recipients)"

# Who responded to a group request
git log --oneline -- "responses/req-20260224-100000-cory-a1b2/"

# Timeline of a complete group request lifecycle
git log --oneline -- \
  "requests/*/req-20260224-100000-cory-a1b2.json" \
  "responses/req-20260224-100000-cory-a1b2/"
```

---

## Debugging Workflows (Post-Apathy)

### "Group request not showing in inbox"

1. Verify user is in `recipients[]`:
   ```bash
   jq '.recipients[].user_id' requests/pending/req-*.json | grep "username"
   ```
2. Check inbox scan debug log (see observability-design.md).

### "Response directory is empty"

1. Check if response used legacy single-file format:
   ```bash
   ls responses/req-20260224-*.json  # old format
   ls responses/req-20260224-*/      # new format
   ```
2. Check respond log for `storage` field.

### "Catalog shows unexpected values for inherited pact"

1. Check inheritance resolution in debug logs.
2. Inspect parent and child pact files directly:
   ```bash
   head -30 pact-store/parent.md pact-store/child.md
   ```

### Git Push Failure

1. Check git status: `cd $PACT_REPO && git status`
2. Check for rebase in progress: `ls .git/rebase-merge/ 2>/dev/null`
3. Check stderr for retry logs: `jq 'select(.msg | contains("push conflict"))' /tmp/pact-stderr.log`
4. Resolution: `git rebase --abort` and retry. The git-adapter retries once automatically.

---

## What We Do Not Add

| Omitted | Rationale |
|---------|-----------|
| External alerting (PagerDuty, etc.) | Local dev tool. No one is on-call for PACT |
| Uptime monitoring | No server. Process starts/stops with MCP host |
| Error rate dashboards | Volume is too low to trend. Individual debugging suffices |
| SLI/SLO definitions | No service to measure |
| Automated remediation | Nothing to remediate. Retry logic is built into git-adapter |
| Log forwarding | Each developer's logs stay on their machine. Git is the shared record |
| Claim metrics | No claim action (apathy audit) |
| Completion metrics | No completion logic (apathy audit) |
| Visibility metrics | No visibility filtering (apathy audit) |
| Runtime APM | No long-running server to profile |
