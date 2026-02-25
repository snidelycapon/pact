# Branching Strategy: pact-y30 (Post-Apathy Revision)

**Feature**: pact-y30 — Flat-file format, catalog metadata, default pacts, group addressing
**Architect**: Apex (nw-platform-architect)
**Date**: 2026-02-24
**Supersedes**: pact-q6y branching-strategy (pre-apathy, 2026-02-23)

---

## Strategy: Trunk-Based Development

Single long-lived branch (`main`). Short-lived feature branches (< 1 day ideal). PRs required for merge. Simple, appropriate for a small team on a ~2,600 LOC codebase.

```
main ──────●─────●──────●──────●──────●──── (always releasable)
            \   /  \   /        \    /
             ●─●    ●─●          ●──●
           PR #1   PR #2       PR #3
```

---

## Branch Naming Convention

```
pact-y30/{scope}/{short-description}
```

| Component | Convention | Examples |
|-----------|-----------|----------|
| Prefix | `pact-y30/` | Groups all feature work |
| Scope | Component or concern | `schema`, `loader`, `respond`, `inbox`, `discover`, `ci`, `test` |
| Description | Kebab-case, 2-4 words | `add-group-fields`, `flat-file-glob`, `per-respondent-files` |

**Examples**:
```
pact-y30/schema/add-group-fields
pact-y30/loader/flat-file-glob
pact-y30/loader/inheritance-resolution
pact-y30/respond/per-respondent-files
pact-y30/inbox/group-filtering
pact-y30/discover/compressed-catalog
pact-y30/ci/add-security-mutation
pact-y30/test/group-acceptance-tests
pact-y30/pacts/default-pact-files
```

---

## PR Organization

### Strategy: By User Story, Not By Component

pact-y30 has vertical slices through the system. Organize PRs around coherent changes, not individual files.

**Rationale**: A PR that changes `schemas.ts` alone is untestable. A PR that implements "send a group request end-to-end" changes schemas + request handler + tests, but is reviewable as a coherent unit.

### Recommended PR Sequence

PRs should be merged in this order. Each builds on the previous.

| PR | Branch | Scope | Files Changed | Story |
|----|--------|-------|---------------|-------|
| **1** | `pact-y30/schema/add-group-fields` | Foundation | `schemas.ts`, all test fixtures (migrate `recipient` to `recipients[]`) | -- |
| **2** | `pact-y30/loader/flat-file-glob` | Foundation | `pact-loader.ts`, unit tests | Flat-file pact store |
| **3** | `pact-y30/loader/inheritance-resolution` | Foundation | `pact-loader.ts`, unit tests | Pact inheritance |
| **4** | `pact-y30/send/group-request` | Vertical | `pact-request.ts`, `pact-discover.ts`, acceptance tests | Group send |
| **5** | `pact-y30/respond/per-respondent` | Vertical | `pact-respond.ts`, `pact-status.ts`, `pact-thread.ts`, acceptance tests | Group respond |
| **6** | `pact-y30/inbox/group-enrichment` | Vertical | `pact-inbox.ts`, acceptance tests | Inbox enrichment |
| **7** | `pact-y30/discover/compressed-catalog` | Vertical | `pact-discover.ts`, unit tests | Token-efficient catalog |
| **8** | `pact-y30/pacts/default-pact-files` | Content | 8 new `.md` files in `pact-store/` | Default pacts |
| **9** | `pact-y30/ci/add-security-mutation` | Infra | `.github/workflows/ci.yml` | CI extensions |

**Why this order**:
1. Schema migration first -- unblocks everything, forces test fixture migration early.
2. Flat-file loader next -- needed before inheritance, catalog, and default pacts.
3. Inheritance after loader -- builds on the glob scan.
4. Group send before respond -- need group requests before anyone can respond.
5. Per-respondent respond + status/thread together -- tightly coupled storage layout change.
6. Inbox enrichment after send -- depends on group requests existing.
7. Compressed catalog independent of response handling.
8. Default pact files after loader is ready to read them.
9. CI changes last -- extended pipeline isn't needed until feature code exists.

### PR Size Guidelines

| Size | Lines Changed | Guidance |
|------|--------------|----------|
| **Small** | < 100 | Ideal. Review in one sitting |
| **Medium** | 100-300 | Acceptable for vertical slices with tests |
| **Large** | 300-500 | Split if possible. Acceptable for schema migration (PR #1) |
| **Too large** | > 500 | Must split. No exceptions |

PR #1 (schema migration) may be the largest because it touches every test fixture that uses `recipient`. This is acceptable as a mechanical change.

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
      - "security"                           # Dependency audit + license + secret scan
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
- **Security required**: Catch dependency and license issues before merge.
- **Linear history**: Clean `git log`. Squash merge preferred.
- **No force push**: Protect the audit trail.

---

## Merge Strategy

**Squash merge** for feature PRs. Each PR becomes a single commit on main.

```
Feature branch: 5 commits (WIP, fix, more WIP, tests, cleanup)
     ↓ squash merge
main: 1 commit ("feat: add group fields to request envelope schema")
```

**Rationale**: Development history on feature branches is noisy. Main should have clean, one-commit-per-feature history.

### Commit Message Format (on main, after squash)

```
{type}: {description}

{body - optional, from PR description}
```

Types: `feat`, `fix`, `refactor`, `test`, `ci`, `docs`, `chore`.

**Examples** (one per PR in the sequence):
```
feat: add group fields to request envelope schema
feat: implement flat-file pact loader with recursive glob
feat: add single-level pact inheritance resolution
feat: implement group send with recipients and group_ref
feat: add per-respondent response files
feat: add group enrichment to inbox entries
feat: implement compressed pipe-delimited catalog format
feat: add 8 default pact definitions
ci: add security scanning and mutation testing stages
```

---

## Release Tagging

Releases use semver tags on main:

```bash
# After a set of features is ready
git tag v0.2.0
git push origin main --tags
```

Tag naming: `v{major}.{minor}.{patch}` (e.g., `v0.2.0`).

The publish workflow (see ci-cd-pipeline.md) triggers on `v*` tags. No release branches -- tags point to commits on main.

### Versioning Strategy (Pre-1.0)

- `0.1.x` -- current (pre pact-y30)
- `0.2.0` -- after pact-y30 is complete (breaking: `recipient` -> `recipients[]`)
- `0.x.y` -- continued pre-1.0 development
- `1.0.0` -- when format and API are stable

Breaking changes bump the minor version while pre-1.0. pact-y30 is a breaking change (`recipient` -> `recipients[]`), so it will be `0.2.0`.

---

## Development Workflow

### Starting Work

```bash
git checkout main
git pull origin main
git checkout -b pact-y30/loader/flat-file-glob
```

### During Development

```bash
# Run tests frequently
bun run typecheck
bun run test:unit
bun run test:acceptance

# Commit often (these get squashed)
git add src/pact-loader.ts tests/unit/pact-loader.test.ts
git commit -m "WIP: flat-file glob scan"
```

### Creating PR

```bash
git push -u origin pact-y30/loader/flat-file-glob
gh pr create --title "feat: implement flat-file pact loader with recursive glob" --body "..."
```

### After PR Merge

```bash
git checkout main
git pull origin main
git branch -d pact-y30/loader/flat-file-glob
```

---

## Handling Conflicts Between PRs

The PR sequence is designed to minimize conflicts, but schema changes (PR #1) will conflict with anything started before it merges.

**Rule**: Merge PRs in order. Do not start PR #4 (group send) until PR #1 (schema migration) is merged.

If parallel work is unavoidable:
1. Base the second branch on the first branch (not main).
2. Rebase onto main after the first PR merges.
3. Resolve conflicts once, in the rebase.

---

## After pact-y30 Is Complete

Delete all `pact-y30/*` branches. The feature is fully on main. Future work uses new branch prefixes.

No release branch. No staging branch. npm publish is triggered from main via version tag (`v0.2.0`).
