# Branching Strategy: pact-fmt

**Feature**: pact-fmt (Group Envelope Primitives)
**Architect**: Apex (nw-platform-architect)
**Date**: 2026-02-23

---

## Strategy: GitHub Flow

Single long-lived branch (`main`). Feature branches for all changes. PRs required for merge. Simple, appropriate for a small team on a ~2,800 LOC codebase.

```
main ──────●─────●──────●──────●──────●──────●──── (always releasable)
            \   /  \   /        \    /  \   /
             ●─●    ●─●          ●──●    ●─●
           PR #1   PR #2       PR #3   PR #4
```

---

## Branch Naming Convention

```
pact-fmt/{scope}/{short-description}
```

| Component | Convention | Examples |
|-----------|-----------|----------|
| Prefix | `pact-fmt/` | Groups all feature work |
| Scope | Component or concern | `schema`, `claim`, `respond`, `inbox`, `defaults`, `ci`, `test` |
| Description | Kebab-case, 2-4 words | `add-group-fields`, `claim-action`, `response-completion` |

**Examples**:
```
pact-fmt/schema/add-group-fields
pact-fmt/claim/claim-action
pact-fmt/respond/per-respondent-files
pact-fmt/respond/completion-logic
pact-fmt/inbox/group-filtering
pact-fmt/defaults/merge-function
pact-fmt/visibility/status-thread-filter
pact-fmt/discover/merged-defaults
pact-fmt/ci/add-security-mutation
pact-fmt/test/group-acceptance-tests
```

---

## PR Organization

### Strategy: By User Story, Not By Component

pact-fmt has 5 user stories (from the DISCUSS wave). Each story is a vertical slice through the system. Organize PRs around stories, not individual files.

**Rationale**: A PR that changes `schemas.ts` alone is untestable. A PR that implements "send a group request end-to-end" changes schemas + request handler + tests, but is reviewable as a coherent unit.

### Recommended PR Sequence

PRs should be merged in this order. Each builds on the previous.

| PR | Branch | Scope | Files Changed | Story |
|----|--------|-------|---------------|-------|
| **1** | `pact-fmt/schema/add-group-fields` | Foundation | `schemas.ts`, all existing tests (migration from `recipient` to `recipients`) | -- |
| **2** | `pact-fmt/defaults/merge-function` | Foundation | `defaults-merge.ts` (new), `pact-loader.ts`, unit tests | -- |
| **3** | `pact-fmt/send/group-request` | Vertical | `pact-request.ts`, `action-dispatcher.ts`, `pact-discover.ts`, acceptance tests | US1: Send group request |
| **4** | `pact-fmt/respond/per-respondent` | Vertical | `pact-respond.ts`, `pact-status.ts`, `pact-thread.ts`, acceptance tests | US2: Respond + visibility |
| **5** | `pact-fmt/claim/claim-action` | Vertical | `pact-claim.ts` (new), `action-dispatcher.ts`, `pact-inbox.ts`, acceptance tests | US3: Claim |
| **6** | `pact-fmt/inbox/group-enrichment` | Vertical | `pact-inbox.ts`, acceptance tests | US4: Inbox enrichment |
| **7** | `pact-fmt/ci/add-security-mutation` | Infra | `.github/workflows/ci.yml`, `stryker.config.json` | -- |

**Why this order**:
1. Schema migration first -- unblocks everything, forces test migration early.
2. Defaults merge next -- pure function, easy to review, needed by send and discover.
3. Send before respond -- need group requests before anyone can respond to them.
4. Respond + visibility together -- per-respondent files and visibility filtering are tightly coupled.
5. Claim after respond -- claim is independent of response logic but needs group requests to exist.
6. Inbox enrichment last -- read-only, depends on all write-path changes being stable.
7. CI changes last -- don't need the extended pipeline until the feature code exists.

### PR Size Guidelines

| Size | Lines Changed | Guidance |
|------|--------------|----------|
| **Small** | < 100 | Ideal. Review in one sitting |
| **Medium** | 100-300 | Acceptable for vertical slices with tests |
| **Large** | 300-500 | Split if possible. Acceptable for schema migration (PR #1) |
| **Too large** | > 500 | Must split. No exceptions |

PR #1 (schema migration) may be the largest because it touches every test that uses `recipient`. This is acceptable as a mechanical change.

---

## Branch Protection Rules

### Required for main

```yaml
# GitHub branch protection settings
branch: main
rules:
  require_pull_request:
    required_approving_review_count: 1
    dismiss_stale_reviews: true
    require_review_from_code_owners: false   # Small team, no CODEOWNERS needed
  required_status_checks:
    strict: true                             # Branch must be up to date
    contexts:
      - "check (20)"                         # Node 20 matrix entry
      - "check (22)"                         # Node 22 matrix entry
      - "security"                           # Dependency audit + secret scan
  enforce_admins: false                      # Small team, trust admin overrides
  allow_force_pushes: false
  allow_deletions: false
  require_linear_history: true               # Squash or rebase merge only
```

### Why These Settings

- **1 approval**: Small team (~4 devs). More would bottleneck.
- **Dismiss stale reviews**: Schema changes can invalidate earlier reviews.
- **Strict status checks**: Ensures PR is tested against latest main, not stale base.
- **Both matrix entries required**: Node 20 and 22 must both pass.
- **Security required on PRs**: Catch dependency issues before merge.
- **Linear history**: Clean `git log`. Squash merge preferred for feature PRs (one commit per PR on main).
- **No force push**: Protect the audit trail.

---

## Merge Strategy

**Squash merge** for feature PRs. Each PR becomes a single commit on main.

```
Feature branch: 5 commits (WIP, fix, more WIP, tests, cleanup)
     ↓ squash merge
main: 1 commit ("Add group fields to request envelope schema")
```

**Rationale**: Development history on feature branches is noisy. Main should have clean, one-commit-per-feature history. The PR description preserves the detailed context.

### Commit Message Format (on main, after squash)

```
{type}: {description}

{body - optional, from PR description}
```

Types: `feat`, `fix`, `refactor`, `test`, `ci`, `docs`, `chore`.

**Examples** (one per PR in the sequence):
```
feat: add group fields to request envelope schema
feat: add defaults merge function for protocol and pact overrides
feat: implement group send with recipients and defaults
feat: add per-respondent response files and visibility filtering
feat: implement exclusive claim action for group requests
feat: add group enrichment to inbox entries
ci: add security scanning and mutation testing stages
```

---

## Development Workflow

### Starting Work

```bash
git checkout main
git pull origin main
git checkout -b pact-fmt/claim/claim-action
```

### During Development

```bash
# Run tests frequently
bun run typecheck
bun run test:unit
bun run test:acceptance

# Commit often (these get squashed)
git add src/tools/pact-claim.ts tests/unit/pact-claim.test.ts
git commit -m "WIP: claim action skeleton"
```

### Creating PR

```bash
git push -u origin pact-fmt/claim/claim-action
gh pr create --title "feat: implement exclusive claim action" --body "..."
```

### After PR Merge

```bash
git checkout main
git pull origin main
git branch -d pact-fmt/claim/claim-action
```

---

## Handling Conflicts Between PRs

The PR sequence is designed to minimize conflicts, but schema changes (PR #1) will conflict with anything started before it merges.

**Rule**: Merge PRs in order. Do not start PR #3 (group send) until PR #1 (schema migration) is merged.

If parallel work is unavoidable:
1. Base the second branch on the first branch (not main).
2. Rebase onto main after the first PR merges.
3. Resolve conflicts once, in the rebase.

---

## After pact-fmt Is Complete

Delete all `pact-fmt/*` branches. The feature is fully on main. Future work uses new branch prefixes.

No release branch. No staging branch. npm publish (when ready) is triggered from main via version tag.
