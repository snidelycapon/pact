# CI/CD Pipeline Design: Collapsed Tools + Declarative Brain

**Feature**: collapsed-tools-brain
**Date**: 2026-02-22
**Author**: Apex (nw-platform-architect)
**Status**: Draft

---

## 1. Existing Pipeline Analysis

GARP uses **GitHub Actions** via `.github/workflows/ci.yml`. The existing pipeline runs on every push to `main` and every pull request.

### Current Pipeline Stages

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
      - Checkout code
      - Setup Node.js
      - Setup Bun
      - Install dependencies
      - Type check (tsc --noEmit)
      - Unit tests (vitest tests/unit)
      - Integration tests (vitest tests/integration)
      - Acceptance tests (vitest tests/acceptance)
      - Build (bun run build)
      - Verify dist/index.js exists
```

### Test Structure

| Test Layer | Path | Purpose | Count (Current) |
|------------|------|---------|-----------------|
| Unit | `tests/unit/` | Module-level logic (schemas, request-id, logger, server) | ~10 test files |
| Integration | `tests/integration/` | Adapter contract tests (git, file, config adapters) | ~5 test files |
| Acceptance | `tests/acceptance/` | End-to-end tool behavior via MCP surface | ~12 test files |

Total: **179 existing tests** (from DESIGN artifacts context).

### Mutation Testing

Stryker is configured for mutation testing but not run in CI. Current configuration:

```json
{
  "mutate": [
    "src/tools/garp-cancel.ts",
    "src/tools/garp-amend.ts",
    "src/tools/garp-respond.ts",
    "src/tools/garp-status.ts",
    "src/tools/garp-inbox.ts",
    "src/tools/find-pending-request.ts",
    "src/schemas.ts"
  ],
  "testRunner": "vitest",
  "reporters": ["clear-text", "html"],
  "timeoutMS": 60000,
  "concurrency": 2
}
```

Mutation testing is currently **manual only** (not automated in CI).

---

## 2. Quality Gates for Migration

The collapsed-tools-brain feature introduces a **3-phase migration**. Each phase requires specific quality gates.

### Phase 1: Additive Build (New Tools Alongside Old)

**Goal**: Add `garp_discover` and `garp_do` without breaking existing functionality.

**Quality Gates**:

1. All 179 existing tests pass (no regressions)
2. Type check passes (strict TypeScript)
3. Build produces `dist/index.js` successfully
4. New acceptance tests pass for `garp_discover` and `garp_do`
5. Code coverage does not decrease (baseline: TBD from current coverage report)

**CI Changes**: None required for Phase 1. Existing pipeline catches regressions automatically.

### Phase 2: Behavioral Equivalence Validation

**Goal**: Prove that collapsed tools produce identical outcomes to legacy tools.

**Quality Gates**:

1. Equivalence tests pass (new test suite in `tests/acceptance/equivalence/`)
2. Mutation testing on new modules (`skill-loader.ts`, `action-dispatcher.ts`) achieves ≥90% mutation score
3. All existing tests continue to pass
4. Manual testing checklist completed (see Section 5)

**CI Changes**:

- Add equivalence test suite execution
- Add mutation testing gate for new modules only (not entire codebase yet)

### Phase 3: Removal (Delete Legacy Tools)

**Goal**: Remove legacy tools and migrate all tests to collapsed surface.

**Quality Gates**:

1. All migrated acceptance tests pass
2. Zero legacy tool registrations remain in `src/mcp-server.ts`
3. Deleted files verified: `skill-parser.ts`, `garp-skills.ts`, `schema.json` files
4. Documentation updated (ADR-010, ADR-011 marked as Superseded)
5. Mutation testing on full codebase achieves ≥85% mutation score (improvement from current ~70%)

**CI Changes**:

- Update Stryker config to mutate new modules
- Add full mutation testing gate (optional: run on PR, required on merge to main)

---

## 3. Enhanced Pipeline Design

### Proposed Pipeline Structure (Post-Migration)

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  # --- Gate 1: Static Analysis ---
  static-analysis:
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
      - name: Lint (future)
        run: bun run lint  # Placeholder for future ESLint integration

  # --- Gate 2: Unit Tests ---
  unit-tests:
    runs-on: ubuntu-latest
    needs: static-analysis
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
      - name: Run unit tests
        run: bun run test:unit
      - name: Upload coverage (future)
        if: matrix.node-version == '20'
        uses: codecov/codecov-action@v3  # Placeholder
        with:
          files: ./coverage/unit/coverage-final.json

  # --- Gate 3: Integration Tests ---
  integration-tests:
    runs-on: ubuntu-latest
    needs: static-analysis
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
      - name: Run integration tests
        run: bun run test:integration

  # --- Gate 4: Acceptance Tests ---
  acceptance-tests:
    runs-on: ubuntu-latest
    needs: [unit-tests, integration-tests]
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
      - name: Run acceptance tests
        run: bun run test:acceptance

  # --- Gate 5: Build Verification ---
  build:
    runs-on: ubuntu-latest
    needs: acceptance-tests
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
      - name: Build
        run: bun run build
      - name: Verify dist exists
        run: test -f dist/index.js
      - name: Smoke test (import check)
        run: node -e "import('./dist/index.js')"

  # --- Gate 6: Mutation Testing (Optional, Phase 3+) ---
  mutation-testing:
    runs-on: ubuntu-latest
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    needs: build
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - uses: oven-sh/setup-bun@v2
      - name: Install dependencies
        run: bun install
      - name: Run mutation tests
        run: bun run test:mutation  # New script: npx stryker run
      - name: Check mutation score threshold
        run: |
          # Parse Stryker output and fail if mutation score < 85%
          # Implementation: custom script or Stryker's --failOnScore option
          echo "Checking mutation score threshold..."
      - name: Upload mutation report
        uses: actions/upload-artifact@v3
        with:
          name: mutation-report
          path: reports/mutation/
```

### Pipeline Phasing Strategy

| Phase | Pipeline Changes | Rationale |
|-------|------------------|-----------|
| Phase 1 (Build) | No changes; existing pipeline sufficient | Additive changes, no new quality gates needed |
| Phase 2 (Validate) | Add mutation testing job for new modules only | Validate skill-loader and action-dispatcher quality |
| Phase 3 (Remove) | Add full mutation testing gate | Ensure overall code quality meets 85% threshold |

---

## 4. Migration-Specific Test Suites

### Phase 2 Equivalence Tests

Create `tests/acceptance/equivalence/` directory with tests that exercise both surfaces:

```typescript
// tests/acceptance/equivalence/send-request.test.ts
describe("Behavioral equivalence: send request", () => {
  it("garp_request and garp_do(send) produce identical outcomes", async () => {
    const params = {
      request_type: "ask",
      recipient: "dan",
      context_bundle: { question: "Test?" }
    };

    // Execute legacy surface
    const legacyResult = await server.callTool("garp_request", params);

    // Reset repo to clean state
    await resetRepo();

    // Execute collapsed surface
    const collapsedResult = await server.callTool("garp_do", {
      action: "send",
      ...params
    });

    // Assert identical outcomes
    expect(collapsedResult).toMatchObject({
      request_id: expect.any(String),
      status: legacyResult.status,
      message: legacyResult.message
    });

    // Assert identical file structure
    const legacyFiles = await listPendingRequests();
    const collapsedFiles = await listPendingRequests();
    expect(collapsedFiles).toEqual(legacyFiles);
  });
});
```

Run equivalence tests in Phase 2 only. They are not needed in Phase 3 (legacy surface deleted).

### Phase 3 Migration Test Updates

Update all acceptance tests from legacy tool calls to collapsed tool calls:

```diff
- await server.callTool("garp_request", { ... });
+ await server.callTool("garp_do", { action: "send", ... });

- await server.callTool("garp_skills");
+ await server.callTool("garp_discover");
```

Assertions remain unchanged (handler behavior is identical).

---

## 5. Manual Testing Checklist (Phase 2)

Automated tests cannot cover all integration scenarios. Manual testing checklist:

- [ ] Install GARP in a fresh directory and verify `bun install` succeeds
- [ ] Configure GARP as an MCP server in Craft Agents
- [ ] Invoke `garp_discover` and verify skill catalog returns all 4 example skills
- [ ] Send a request using `garp_do` with action `send` and verify it appears in `requests/pending/`
- [ ] Respond to the request using `garp_do` with action `respond` and verify it moves to `requests/completed/`
- [ ] Check request status using `garp_do` with action `check_status`
- [ ] View inbox using `garp_do` with action `inbox` and verify grouped threads display correctly
- [ ] Cancel a request using `garp_do` with action `cancel`
- [ ] Amend a request using `garp_do` with action `amend`
- [ ] Verify that legacy tools still work (parallel registration check)

All checklist items must pass before Phase 3 deletion.

---

## 6. Mutation Testing Strategy

### Current State

Mutation testing is configured but not run in CI. The current mutation score is estimated at ~70% based on existing test coverage.

### Goal for Phase 3

Achieve **≥85% mutation score** on the full codebase (excluding test files, adapters, and third-party integrations).

### Stryker Configuration Updates (Phase 3)

```json
{
  "mutate": [
    "src/skill-loader.ts",        // New: Target ≥90%
    "src/action-dispatcher.ts",   // New: Target ≥90%
    "src/tools/garp-discover.ts", // New: Target ≥85%
    "src/tools/garp-do.ts",       // New: Target ≥85%
    "src/tools/garp-request.ts",  // Existing
    "src/tools/garp-inbox.ts",    // Existing
    "src/tools/garp-respond.ts",  // Existing
    "src/tools/garp-status.ts",   // Existing
    "src/tools/garp-cancel.ts",   // Existing
    "src/tools/garp-amend.ts",    // Existing
    "src/tools/find-pending-request.ts", // Existing
    "src/schemas.ts"              // Existing
  ],
  "testRunner": "vitest",
  "reporters": ["clear-text", "html", "json"],
  "ignorePatterns": [".beads", ".nwave", "repos"],
  "tempDirName": ".stryker-tmp",
  "timeoutMS": 60000,
  "concurrency": 2,
  "thresholds": {
    "high": 90,
    "low": 85,
    "break": 80
  }
}
```

### CI Integration

Add mutation testing as a **post-merge job** on `main` branch only (not PR gates, too slow):

```yaml
mutation-testing:
  runs-on: ubuntu-latest
  if: github.event_name == 'push' && github.ref == 'refs/heads/main'
  steps:
    - name: Run Stryker
      run: npx stryker run
    - name: Fail if mutation score < 85%
      run: |
        SCORE=$(jq '.mutationScore' reports/mutation/mutation.json)
        if (( $(echo "$SCORE < 85" | bc -l) )); then
          echo "Mutation score $SCORE below threshold 85"
          exit 1
        fi
```

Mutation test failures block future merges until fixed (fail-fast on main).

---

## 7. Code Coverage Strategy

### Current State

Code coverage is not currently measured or enforced.

### Recommendation

Add code coverage reporting for visibility, but do not gate PRs on coverage percentage. Use mutation testing as the primary quality metric.

**Rationale**: Coverage measures "lines executed" but not "lines tested well." Mutation testing is a stronger signal. Coverage is useful for identifying untested code paths but should not be a hard gate.

### Optional Coverage Collection

```yaml
- name: Run tests with coverage
  run: bun run test:unit --coverage
- uses: codecov/codecov-action@v3
  with:
    files: ./coverage/coverage-final.json
```

Coverage reports uploaded to Codecov (or similar) for trend analysis.

---

## 8. Branching Strategy Alignment

GARP uses **trunk-based development**:

- Single `main` branch
- All changes land on `main` via pull requests
- No long-lived feature branches visible

### PR Quality Gates (Enforced via GitHub Branch Protection)

1. CI pipeline passes (all jobs green)
2. At least one approval from a team member
3. No merge commits (squash or rebase required)
4. PR description references issue/feature (convention, not enforced)

### Branch Protection Rules (Recommended)

```yaml
# .github/branch-protection.yml (if using Probot)
main:
  required_status_checks:
    strict: true
    contexts:
      - static-analysis (Node 20)
      - static-analysis (Node 22)
      - unit-tests (Node 20)
      - unit-tests (Node 22)
      - integration-tests (Node 20)
      - integration-tests (Node 22)
      - acceptance-tests (Node 20)
      - acceptance-tests (Node 22)
      - build (Node 20)
      - build (Node 22)
  required_pull_request_reviews:
    required_approving_review_count: 1
  enforce_admins: false
  restrictions: null
```

All pipeline jobs must pass before merge.

---

## 9. Deployment Strategy

GARP is not deployed to production infrastructure. "Deployment" is a manual developer action:

1. Developer runs `git pull origin main` in their local GARP directory
2. Developer runs `bun install` to update dependencies (if `package.json` changed)
3. Developer runs `bun run build` to rebuild `dist/index.js`
4. Developer restarts their MCP host application (Craft Agents)

### No Automated Deployment

There is no automated deployment pipeline. No Docker images pushed, no npm packages published, no serverless functions deployed.

### Release Tagging (Optional)

Releases can be tagged in git for reference:

```bash
git tag -a v0.2.0 -m "Collapsed tools + declarative brain (Phase 3 complete)"
git push origin v0.2.0
```

Tags are documentation only; they do not trigger automated processes.

---

## 10. Continuous Learning

Not applicable. GARP is a local development tool with no telemetry, no user analytics, and no feedback loops beyond manual developer reports.

---

## 11. Pipeline Performance Optimization

### Current Performance

Estimated pipeline duration (based on existing ci.yml):

- Checkout + Setup: ~30 seconds
- Install dependencies: ~20 seconds
- Type check: ~10 seconds
- Unit tests: ~10 seconds
- Integration tests: ~20 seconds
- Acceptance tests: ~60 seconds
- Build: ~5 seconds

**Total: ~155 seconds per matrix job** (x2 for Node 20 and 22 = ~5 minutes total wall time with parallelism).

### Optimization Opportunities

1. **Cache dependencies**: Add npm/bun cache to reduce install time
2. **Parallel job execution**: Already parallelized via matrix strategy
3. **Skip redundant builds**: Only build once (not per Node version) since esbuild output is version-agnostic

### Optimized Pipeline (Future)

```yaml
- uses: actions/cache@v3
  with:
    path: ~/.bun/install/cache
    key: ${{ runner.os }}-bun-${{ hashFiles('**/bun.lockb') }}
    restore-keys: |
      ${{ runner.os }}-bun-
```

**Expected improvement**: ~10-15 seconds reduction per job.

---

## 12. Failure Handling and Notifications

### On Failure

- CI job fails immediately on first test failure (fail-fast within job)
- PR cannot merge if any job fails
- GitHub automatically comments on PR with failure link

### Notification Strategy

- GitHub notifications for PR authors (default behavior)
- Optional: Slack integration for `main` branch failures (not configured currently)

### No Rollback

Since GARP is not deployed to production, there is no rollback mechanism. If a bad commit lands on `main`, developers fix forward with a new PR.

---

## 13. Summary of CI/CD Enhancements

| Enhancement | Phase | Priority | Effort |
|-------------|-------|----------|--------|
| Add equivalence test suite | Phase 2 | High | Medium (write new tests) |
| Add mutation testing for new modules | Phase 2 | High | Low (Stryker already configured) |
| Update Stryker config for full codebase | Phase 3 | High | Low (configuration change) |
| Add mutation score gate on main | Phase 3 | Medium | Low (add CI job) |
| Add code coverage reporting | Post-migration | Low | Low (add upload step) |
| Add dependency caching | Post-migration | Low | Low (add cache action) |
| Add ESLint/Prettier | Post-migration | Low | Medium (configure linter) |

All Phase 1 work uses the existing pipeline unmodified. Phases 2 and 3 require incremental CI enhancements as described above.
