# Branching Strategy: Collapsed Tools + Declarative Brain

**Feature**: collapsed-tools-brain
**Date**: 2026-02-22
**Author**: Apex (nw-platform-architect)
**Status**: Draft

---

## 1. Current Branching Model

GARP uses **trunk-based development** with a single long-lived branch: `main`.

### Characteristics

- **Single trunk**: All production code lives on `main`
- **Short-lived feature branches**: Developers create branches for PRs, delete after merge
- **No release branches**: No `develop`, `staging`, or version-specific branches
- **No hotfix branches**: Fixes land on `main` like any other change

### Rationale

Trunk-based development is appropriate for GARP because:

1. **Small team** - 2-3 developers, low merge conflict risk
2. **Local deployment** - No production environment to protect with release branches
3. **Continuous integration** - Changes integrate immediately, reducing integration debt
4. **Simplicity** - One branch to track, no branch management overhead

---

## 2. Branch Protection Rules

The `main` branch is protected via GitHub branch protection settings.

### Required Checks (Status Checks)

All CI jobs must pass before merge:

- `static-analysis` (Node 20)
- `static-analysis` (Node 22)
- `unit-tests` (Node 20)
- `unit-tests` (Node 22)
- `integration-tests` (Node 20)
- `integration-tests` (Node 22)
- `acceptance-tests` (Node 20)
- `acceptance-tests` (Node 22)
- `build` (Node 20)
- `build` (Node 22)

### Required Reviews

- **Minimum approvals**: 1
- **Dismiss stale reviews**: Yes (on new push)
- **Require review from code owners**: No (no CODEOWNERS file currently)

### Merge Restrictions

- **Merge methods allowed**: Squash and merge (preferred), Rebase and merge
- **Merge commits**: Disallowed (no merge commits on main)
- **Force push**: Disallowed (main is append-only)
- **Delete branch after merge**: Required (auto-delete via GitHub setting)

### Admin Overrides

- **Enforce for administrators**: No (admins can bypass for emergency fixes)
- **Reason**: Small team, no need for strict admin enforcement

---

## 3. Feature Development Workflow

### Standard PR Flow

```
1. Create feature branch from main
   git checkout main
   git pull origin main
   git checkout -b feat/collapsed-tools-phase1

2. Develop incrementally (commit early, commit often)
   git add <files>
   git commit -m "Add skill-loader module"
   git push origin feat/collapsed-tools-phase1

3. Open PR against main
   - Title: "feat: Add skill-loader and garp_discover tool"
   - Description: Reference issue/feature, describe changes, list testing done
   - Reviewers: Assign team members

4. Address review feedback
   - Make changes in local branch
   - git commit --amend (if squashing locally) OR new commit
   - git push --force-with-lease (if amended)

5. Merge after approval + CI green
   - Use "Squash and merge" button on GitHub
   - Edit commit message to be concise (summarize entire PR)
   - Branch auto-deleted after merge

6. Pull latest main locally
   git checkout main
   git pull origin main
```

### Branch Naming Conventions

| Prefix | Usage | Example |
|--------|-------|---------|
| `feat/` | New feature or enhancement | `feat/collapsed-tools-phase1` |
| `fix/` | Bug fix | `fix/yaml-parse-error-handling` |
| `docs/` | Documentation only | `docs/update-skill-format-guide` |
| `test/` | Test-only changes | `test/add-equivalence-tests` |
| `chore/` | Maintenance, refactoring | `chore/update-dependencies` |

Convention is informal; any descriptive name is acceptable.

---

## 4. Commit Message Conventions

### Format

```
<type>: <subject>

<optional body>

<optional footer>
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation change
- `test`: Test addition or modification
- `chore`: Maintenance (dependencies, build config)
- `refactor`: Code restructuring without behavior change

### Example: Good Commit Message

```
feat: Add YAML frontmatter skill loader

Replace heuristic markdown parser with deterministic YAML parser.
Reads SKILL.md files, extracts frontmatter, validates schema.
Target: >90% mutation score.

Closes #42
```

### Example: Bad Commit Message

```
WIP

(No context, not descriptive, not helpful in git log)
```

### Enforcement

Commit message quality is **not enforced** by tooling (no commitlint, no pre-commit hooks). Enforced socially via code review.

---

## 5. PR Review Process

### Reviewer Responsibilities

1. **Understand the change** - Read PR description, review code diffs
2. **Verify tests** - Check that new code has test coverage
3. **Check for regressions** - Ensure existing tests pass (CI enforces this)
4. **Suggest improvements** - Code style, clarity, performance, edge cases
5. **Approve or request changes** - Use GitHub review feature

### Approval Criteria

A PR can be approved if:

- All CI checks pass
- Code is understandable and maintainable
- Tests adequately cover new functionality
- No obvious bugs or regressions
- PR description clearly explains the change

### Review Turnaround

- **Target**: Reviews completed within 24 hours
- **Escalation**: Ping reviewer on Slack if blocked >48 hours
- **Self-merge**: Not allowed (even with admin rights, wait for review)

---

## 6. Merge Strategies

### Squash and Merge (Preferred)

- Combines all commits in the PR into a single commit on `main`
- Keeps `main` history clean and linear
- PR branch commits are discarded (preserved in PR view only)

**When to use**: Most PRs (default choice).

### Rebase and Merge (Alternative)

- Replays all commits from the PR onto `main` linearly
- Preserves individual commit history from the PR
- Useful when PR commits are already well-structured

**When to use**: When commit history in the PR is intentionally structured (e.g., "Add X", "Add Y", "Add Z" as separate logical steps).

### Merge Commit (Disallowed)

- Creates a merge commit on `main` with two parents
- Clutters history, makes `git log --oneline` harder to read
- **Not allowed** via branch protection rules.

---

## 7. Hotfix Process

### Definition

A hotfix is an urgent fix for a critical issue (e.g., GARP crashes on startup, data corruption bug).

### Workflow

Same as regular PR workflow (no special hotfix branches). Differences:

1. **Branch name**: `fix/critical-crash-on-startup`
2. **PR priority**: Label PR as `priority: urgent`
3. **Reviewer assignment**: Assign immediately, request expedited review
4. **Testing**: Run full test suite locally before pushing (don't skip CI)
5. **Merge**: Squash and merge after approval (same as regular PR)

### No Fast-Track Merging

Even urgent fixes require:

- CI to pass
- At least one approval

This prevents introducing new bugs in the rush to fix old bugs.

---

## 8. Release Management

### No Formal Releases

GARP has no versioned releases. Developers pull from `main` whenever they want the latest code.

### Git Tags (Optional)

Tags can mark significant milestones:

```bash
git tag -a v0.2.0 -m "Collapsed tools feature complete (Phase 3)"
git push origin v0.2.0
```

Tags are documentation only; they don't trigger builds or deployments.

### Changelog (Optional)

A `CHANGELOG.md` file can track notable changes per tag:

```markdown
## [0.2.0] - 2026-02-22

### Added
- `garp_discover` meta-tool for skill discovery
- `garp_do` meta-tool for unified actions
- YAML frontmatter skill format

### Removed
- 8 legacy tool registrations
- `skill-parser.ts` (replaced by `skill-loader.ts`)
```

This is optional; git log provides a complete history.

---

## 9. Migration-Specific Branching (Collapsed Tools Feature)

### Phase 1: Additive Build

**Branch**: `feat/collapsed-tools-phase1`

**Changes**:
- Add `skill-loader.ts`, `action-dispatcher.ts`, `garp-discover.ts`, `garp-do.ts`
- Register new tools alongside old tools in `mcp-server.ts`
- Add acceptance tests for new tools

**Merge criteria**:
- All existing tests pass (179 tests)
- New acceptance tests pass
- CI green on Node 20 and 22

**PR size**: Medium (~500-800 lines added)

### Phase 2: Behavioral Equivalence Validation

**Branch**: `feat/collapsed-tools-phase2`

**Changes**:
- Add equivalence tests in `tests/acceptance/equivalence/`
- Run mutation testing on `skill-loader.ts` and `action-dispatcher.ts`
- Verify ≥90% mutation score

**Merge criteria**:
- Equivalence tests pass
- Mutation score ≥90% for new modules
- Manual testing checklist completed

**PR size**: Small (~200-300 lines added)

### Phase 3: Removal

**Branch**: `feat/collapsed-tools-phase3`

**Changes**:
- Remove 8 legacy tool registrations from `mcp-server.ts`
- Delete `skill-parser.ts`, `garp-skills.ts`
- Migrate acceptance tests to use collapsed surface
- Update ADR-010 and ADR-011 status to Superseded

**Merge criteria**:
- All migrated tests pass
- No legacy tools remain
- Mutation score ≥85% on full codebase
- Documentation updated

**PR size**: Medium (~400-600 lines removed, ~200 lines modified)

### Alternative: Single Branch Approach

All three phases could be developed in a single long-lived branch:

**Branch**: `feat/collapsed-tools-complete`

**Workflow**:
- Develop Phase 1, commit
- Develop Phase 2, commit
- Develop Phase 3, commit
- Open PR with all three phases
- Merge as a single atomic change

**Pros**: Single large PR ensures atomicity (no intermediate broken states)

**Cons**: Harder to review, longer time to first merge, higher merge conflict risk

**Recommendation**: Use **three separate PRs** (Phase 1, Phase 2, Phase 3). Each PR is independently reviewable and mergeable. If a phase needs rework, it doesn't block the others.

---

## 10. Conflict Resolution

### Merge Conflicts

When a feature branch has merge conflicts with `main`:

1. **Pull latest main**:
   ```bash
   git checkout feat/my-feature
   git fetch origin main
   git rebase origin/main
   ```

2. **Resolve conflicts**:
   - Edit conflicted files
   - Mark as resolved: `git add <file>`
   - Continue rebase: `git rebase --continue`

3. **Force push**:
   ```bash
   git push --force-with-lease origin feat/my-feature
   ```

4. **Re-review**: Conflicts may introduce bugs; request re-review after resolving.

### Avoiding Conflicts

- Keep feature branches short-lived (<3 days)
- Rebase on `main` frequently
- Communicate with team about overlapping work

---

## 11. Rollback Strategy

### No Automated Rollback

If a bad commit lands on `main`, there is no automated rollback. Options:

### Option 1: Revert Commit

```bash
git revert <commit-hash>
git push origin main
```

Creates a new commit that undoes the bad commit. Preserves history.

**Preferred approach**: Safe, auditable, no force push.

### Option 2: Fix Forward

```bash
git checkout -b fix/revert-bad-change
# Make fixes
git commit -m "fix: Correct issue introduced in <commit>"
# Open PR, merge
```

**When to use**: When revert is insufficient (e.g., bad commit is already built upon by other commits).

### Option 3: Force Push (Emergency Only)

```bash
git reset --hard <commit-before-bad-change>
git push --force origin main
```

**DANGER**: Rewrites history, breaks other developers' clones.

**Only use if**:
- Bad commit was just merged (<5 minutes ago)
- No other developers have pulled it yet
- Commit contains a security vulnerability that must be removed from history

**Notify team immediately** if force push is used.

---

## 12. Fork and External Contributor Strategy

### No Forks Expected

GARP is an internal tool, not an open-source project. External contributors are not expected.

### If Forks Occur

If someone forks GARP and wants to contribute:

1. Fork the repository
2. Create a branch in the fork
3. Open a PR from the fork to `coryetzkorn/garp:main`
4. Same review process as internal PRs

GitHub supports this workflow natively.

---

## 13. Pre-Commit Hooks (Future)

### Current State

No pre-commit hooks configured.

### Potential Hooks (Future Enhancements)

| Hook | Purpose | Tool |
|------|---------|------|
| Type check | Ensure `tsc --noEmit` passes | Husky + lint-staged |
| Linting | Enforce code style | ESLint + Prettier |
| Test run | Run affected tests | Vitest |
| Commit message lint | Enforce commit message format | commitlint |

**Recommendation**: Add type check and linting hooks in a future chore PR. Do not add as part of the collapsed-tools feature (scope creep).

---

## 14. Branch Lifecycle

```
1. Branch created from main
   git checkout -b feat/my-feature

2. Development (days to weeks)
   - Commits pushed to remote
   - PR opened
   - Reviews requested

3. Approval + CI green
   - PR merged to main via squash

4. Branch deleted (automatic via GitHub setting)
   - Local cleanup: git branch -d feat/my-feature
```

Average branch lifetime: **1-3 days** (goal: keep branches short-lived).

---

## 15. Comparison: Trunk-Based vs. GitFlow

| Aspect | Trunk-Based (GARP) | GitFlow (Alternative) |
|--------|--------------------|-----------------------|
| **Branches** | `main` only | `main`, `develop`, `feature/*`, `release/*`, `hotfix/*` |
| **Merge frequency** | Multiple times per day | Once per release cycle |
| **Release process** | Tag on `main` | Merge `develop` to `main` |
| **Hotfix process** | Fix on `main` directly | Create `hotfix/*` branch, merge to `main` and `develop` |
| **Complexity** | Low (one branch) | High (many branches) |
| **Team size** | Small teams (2-10) | Large teams (10+) |
| **Deployment frequency** | Continuous (every commit) | Periodic (releases) |
| **Best for** | Local tools, microservices | Traditional software releases |

**Why trunk-based is right for GARP**:

- Small team (2-3 developers)
- No production deployment cadence (developers pull when ready)
- High integration frequency reduces merge conflicts
- Simpler mental model (one source of truth)

---

## 16. Summary

| Aspect | Strategy |
|--------|----------|
| **Branching model** | Trunk-based development (single `main` branch) |
| **Feature branches** | Short-lived (<3 days), deleted after merge |
| **Branch protection** | Require CI pass + 1 approval before merge |
| **Merge strategy** | Squash and merge (preferred), rebase and merge (alternative) |
| **Commit messages** | Conventional format (feat/fix/docs/test/chore), informally enforced |
| **Review process** | 1 approval required, 24-hour target turnaround |
| **Hotfix process** | Same as regular PR (no special branches) |
| **Rollback strategy** | Revert commit (preferred), fix forward (alternative) |
| **Release management** | No formal releases, optional git tags for milestones |
| **Pre-commit hooks** | None (future enhancement) |

This branching strategy balances simplicity with quality gates, appropriate for a small-team local development tool.
