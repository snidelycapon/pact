# CI/CD Pipeline: pact-fmt

**Feature**: pact-fmt (Group Envelope Primitives)
**Architect**: Apex (nw-platform-architect)
**Date**: 2026-02-23

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
                  +--------v---------+
                  |   check (matrix) |  Node 20 + 22
                  |   typecheck      |
                  |   test:unit      |
                  |   test:integration|
                  |   test:acceptance |
                  |   build          |
                  |   verify dist    |
                  +--------+---------+
                           |
              +------------+------------+
              |                         |
    +---------v----------+   +----------v----------+
    |   security (main)  |   | mutation (main only) |
    |   npm audit        |   | stryker             |
    |   secret scan      |   | ~5-10 min           |
    +--------------------+   +---------------------+
```

### Stage 1: check (Existing, Unchanged)

Matrix job: Node 20 + 22. Runs on every push and PR.

No changes. This is the core quality gate.

### Stage 2: security (New)

Runs on: push to main AND pull requests. Lightweight -- does not need matrix testing.

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

      - name: Audit dependencies
        run: npm audit --omit=dev
        continue-on-error: false

      - name: Check for secrets in codebase
        run: |
          # Scan tracked source files for high-confidence secret patterns
          if git ls-files -- '*.ts' '*.js' '*.json' | \
            xargs grep -lE 'AKIA[A-Z0-9]{16}|-----BEGIN (RSA |EC )?PRIVATE KEY|sk-[a-zA-Z0-9]{48}|ghp_[a-zA-Z0-9]{36}'; then
            echo "::error::Potential secrets detected in codebase"
            exit 1
          fi
```

**Rationale**:
- `npm audit --omit=dev`: Only audits the 4 runtime dependencies. DevDependencies (vitest, esbuild, stryker, typescript) are not shipped.
- Secret scan: Simple grep for high-confidence patterns (AWS keys, private keys, OpenAI keys, GitHub PATs). No third-party scanning tool needed for a 4-dep project.
- Runs on PRs too so issues are caught before merge.

### Stage 3: mutation (New, Main-Only)

Runs on: push to main only. Too slow for PR feedback loops (~5-10 minutes).

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
- Main-only: Stryker runs ~5-10 min with 4 concurrency and 60s timeout per mutant. Too slow for PR iteration.
- Runs after `check` succeeds (`needs: check`) to avoid wasting CI minutes on broken builds.
- Report uploaded as artifact for review. HTML reporter already configured in `stryker.config.json`.
- `if: always()` on upload ensures report is available even if mutation score is below threshold.

### Stryker Configuration Update

Add pact-fmt files to mutation targets in `stryker.config.json`:

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
    "src/schemas.ts",
    "src/tools/pact-claim.ts",
    "src/defaults-merge.ts"
  ]
}
```

Two new files: `pact-claim.ts` (domain logic with branching) and `defaults-merge.ts` (pure function with merge logic). Both are high-value mutation testing targets.

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

      - name: Scan for hardcoded secrets
        run: |
          if git ls-files -- '*.ts' '*.js' '*.json' | \
            xargs grep -lE 'AKIA[A-Z0-9]{16}|-----BEGIN (RSA |EC )?PRIVATE KEY|sk-[a-zA-Z0-9]{48}|ghp_[a-zA-Z0-9]{36}'; then
            echo "::error::Potential secrets detected in codebase"
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
| **mutation** | No -- too slow for PR iteration | Yes -- quality gate on main |

### PR Requirements (Enforced by Branch Protection)

- `check` must pass (both matrix entries)
- `security` must pass
- At least 1 review approval
- Branch must be up to date with main

### Why Full Suite on Every Change

PACT is a modular monolith. Schema changes in `schemas.ts` affect every handler. Defaults-merge is called from both `pact-discover` and `pact-request`. The action dispatcher touches all handlers. There is no safe subset of tests to skip.

**Cost**: ~3 minutes for `check` (parallel matrix). Acceptable for a project this size.

---

## Future Considerations

### npm Publish (When Ready)

When PACT is ready for npm distribution, add a release job:

```yaml
  publish:
    if: github.ref == 'refs/heads/main' && startsWith(github.ref, 'refs/tags/v')
    needs: [check, security]
    runs-on: ubuntu-latest
    permissions:
      id-token: write  # npm provenance
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          registry-url: https://registry.npmjs.org
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - run: bun run build
      - run: npm publish --provenance
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

Triggered by version tags (`v0.2.0`). Uses npm provenance for supply chain security. Not needed until pact-fmt is complete and tested.

### Mutation Score Threshold

Once baseline mutation score is established on main, add a threshold check:

```yaml
      - name: Check mutation score
        run: |
          SCORE=$(npx stryker run --reporters json | jq '.schemaVersion' ...)
          # Parse score from Stryker JSON output and fail if below threshold
```

Defer until baseline is known. Premature thresholds cause false failures.
