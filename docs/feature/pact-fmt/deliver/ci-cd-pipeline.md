# CI/CD Pipeline: pact-y30 (Post-Apathy Revision)

**Feature**: pact-y30 — Flat-file format, catalog metadata, default pacts, group addressing
**Architect**: Apex (nw-platform-architect)
**Date**: 2026-02-24
**Supersedes**: pact-q6y ci-cd-pipeline (pre-apathy, 2026-02-23)

---

## Current Pipeline (ci.yml)

```
push/PR to main
  -> checkout
  -> setup node (matrix: 20, 22) + bun
  -> bun install
  -> typecheck
  -> test:unit
  -> test:integration
  -> test:acceptance
  -> build
  -> verify dist/index.js exists
```

Single job (`check`), ~2-3 minutes. Adequate for current scope.

---

## Extended Pipeline Design

### Principles

1. **Extend, don't replace** -- the existing pipeline works. Add stages, don't restructure.
2. **Full suite always** -- modular monolith means every change can affect everything. No selective test skipping.
3. **Fast feedback first** -- typecheck and unit tests before slower stages.
4. **Security without ceremony** -- `npm audit` and basic secret scanning, not enterprise SAST.

### Pipeline Stages

```
                  +------------------+
                  |    Triggered     |
                  | push/PR to main  |
                  +--------+---------+
                           |
              +------------+------------+
              |                         |
    +---------v----------+   +----------v----------+
    |   check (matrix)   |   |   security          |
    |   typecheck        |   |   npm audit          |
    |   test:unit        |   |   license check      |
    |   test:integration |   |   secret scan        |
    |   test:acceptance  |   +---------------------+
    |   build            |
    |   verify dist      |
    +---------+----------+
              |
              | (main only, after check passes)
              v
    +---------+----------+
    |   mutation         |
    |   stryker          |
    |   ~5-10 min        |
    +--------------------+
```

### Stage 1: check (Existing, Unchanged)

Matrix job: Node 20 + 22. Runs on every push and PR.

No changes needed. This is the core quality gate.

**Quality gates**:
- TypeScript compiles with zero errors (`--noEmit`)
- All unit tests pass
- All integration tests pass
- All acceptance tests pass
- `dist/index.js` is produced

### Stage 2: security (New)

Runs in parallel with `check` on every push and PR. Lightweight -- single Node version, no matrix.

```yaml
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22

      - uses: oven-sh/setup-bun@v2

      - name: Install dependencies
        run: bun install

      - name: Audit production dependencies
        run: npm audit --omit=dev

      - name: Check licenses
        run: |
          # Verify all runtime deps use permissive licenses
          npx license-checker --production --onlyAllow \
            'MIT;ISC;BSD-2-Clause;BSD-3-Clause;Apache-2.0;0BSD'

      - name: Scan for hardcoded secrets
        run: |
          if git ls-files -- '*.ts' '*.js' '*.json' ':!package-lock.json' ':!bun.lockb' | \
            xargs grep -lE \
              'AKIA[A-Z0-9]{16}|-----BEGIN (RSA |EC )?PRIVATE KEY|sk-[a-zA-Z0-9]{48}|ghp_[a-zA-Z0-9]{36}' \
            2>/dev/null; then
            echo "::error::Potential secrets detected in tracked files"
            exit 1
          fi
```

**Rationale**:
- `npm audit --omit=dev`: Only audits the 4 runtime dependencies. DevDependencies are not shipped.
- License check: All 4 runtime deps are MIT/ISC today. Gate ensures no GPL/AGPL sneaks in via transitive deps.
- Secret scan: Simple grep for high-confidence patterns. No third-party scanning tool needed for a 4-dep project.

### Stage 3: mutation (New, Main-Only)

Runs on push to main only, after `check` passes. Too slow for PR feedback (~5-10 minutes).

```yaml
  mutation:
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    needs: check
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22

      - uses: oven-sh/setup-bun@v2

      - name: Install dependencies
        run: bun install

      - name: Run mutation tests
        run: npx stryker run

      - name: Upload mutation report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: mutation-report
          path: reports/mutation/
          retention-days: 14
```

**Rationale**:
- Main-only: Stryker runs ~5-10 min with concurrency 4 and 60s timeout per mutant. Too slow for PR iteration.
- `needs: check`: No wasted CI minutes on broken builds.
- Report uploaded as artifact. HTML reporter already configured in `stryker.config.json`.
- `if: always()` on upload ensures report is saved even if mutation score is low.

### Stryker Configuration (Existing, No Change Needed)

The current `stryker.config.json` already targets the 11 files that pact-y30 modifies:

```json
{
  "mutate": [
    "src/pact-loader.ts",
    "src/action-dispatcher.ts",
    "src/tools/pact-discover.ts",
    "src/tools/pact-do.ts",
    "src/tools/pact-cancel.ts",
    "src/tools/pact-amend.ts",
    "src/tools/pact-respond.ts",
    "src/tools/pact-status.ts",
    "src/tools/pact-inbox.ts",
    "src/tools/find-pending-request.ts",
    "src/schemas.ts"
  ],
  "testRunner": "vitest",
  "reporters": ["clear-text", "html"],
  "concurrency": 4
}
```

No new files to add (no `pact-claim.ts`, no `defaults-merge.ts`). The existing targets cover all modified components.

---

## Complete ci.yml (Extended)

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  check:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [20, 22]
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}

      - uses: oven-sh/setup-bun@v2

      - name: Install dependencies
        run: bun install

      - name: Type check
        run: bun run typecheck

      - name: Unit tests
        run: bun run test:unit

      - name: Integration tests
        run: bun run test:integration

      - name: Acceptance tests
        run: bun run test:acceptance

      - name: Build
        run: bun run build

      - name: Verify dist exists
        run: test -f dist/index.js

  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22

      - uses: oven-sh/setup-bun@v2

      - name: Install dependencies
        run: bun install

      - name: Audit production dependencies
        run: npm audit --omit=dev

      - name: Check licenses
        run: |
          npx license-checker --production --onlyAllow \
            'MIT;ISC;BSD-2-Clause;BSD-3-Clause;Apache-2.0;0BSD'

      - name: Scan for hardcoded secrets
        run: |
          if git ls-files -- '*.ts' '*.js' '*.json' ':!package-lock.json' ':!bun.lockb' | \
            xargs grep -lE \
              'AKIA[A-Z0-9]{16}|-----BEGIN (RSA |EC )?PRIVATE KEY|sk-[a-zA-Z0-9]{48}|ghp_[a-zA-Z0-9]{36}' \
            2>/dev/null; then
            echo "::error::Potential secrets detected in tracked files"
            exit 1
          fi

  mutation:
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    needs: check
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22

      - uses: oven-sh/setup-bun@v2

      - name: Install dependencies
        run: bun install

      - name: Run mutation tests
        run: npx stryker run

      - name: Upload mutation report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: mutation-report
          path: reports/mutation/
          retention-days: 14
```

---

## PR vs Push-to-Main Behavior

| Stage | On PR | On Push to Main |
|-------|-------|-----------------|
| **check** (matrix) | Yes -- full test suite, both Node versions | Yes |
| **security** | Yes -- catch issues before merge | Yes |
| **mutation** | No -- too slow for PR iteration | Yes -- quality signal on main |

### PR Requirements (Enforced by Branch Protection)

- `check` must pass (both matrix entries: Node 20 and 22)
- `security` must pass
- At least 1 review approval
- Branch must be up to date with main

### Why Full Suite on Every Change

PACT is a modular monolith. Schema changes in `schemas.ts` affect every handler. The pact-loader feeds `pact-discover`. The action dispatcher touches all handlers. There is no safe subset of tests to skip.

**Cost**: ~3 minutes for `check` (parallel matrix). Acceptable for a project this size.

---

## npm Publish Workflow

Tag-based release workflow, separate from CI. Triggered manually or by pushing a version tag.

```yaml
# .github/workflows/publish.yml
name: Publish

on:
  push:
    tags: ['v*']

jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      id-token: write    # npm provenance
      contents: read
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          registry-url: https://registry.npmjs.org

      - uses: oven-sh/setup-bun@v2

      - name: Install dependencies
        run: bun install

      - name: Type check
        run: bun run typecheck

      - name: Test
        run: bun run test

      - name: Build
        run: bun run build

      - name: Verify dist
        run: test -f dist/index.js

      - name: Publish
        run: npm publish --provenance
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

**Release process**:
1. Update `version` in `package.json`
2. Commit: `chore: release v0.2.0`
3. Tag: `git tag v0.2.0`
4. Push: `git push origin main --tags`
5. GitHub Actions runs publish workflow
6. npm provenance ensures supply chain integrity

---

## Future: Mutation Score Threshold

Once baseline mutation score is established on main, add a threshold:

```yaml
      - name: Check mutation score
        run: |
          npx stryker run 2>&1 | tee stryker-output.txt
          # Stryker exits non-zero if score is below thresholds.break
```

Configure in `stryker.config.json`:
```json
{
  "thresholds": {
    "high": 80,
    "low": 70,
    "break": 60
  }
}
```

Defer until baseline is known. Premature thresholds cause false failures.
