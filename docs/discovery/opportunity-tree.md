# Opportunity Tree: PACT Protocol Evolution

**Date**: 2026-02-22
**Researcher**: Scout (nw-product-discoverer)
**Context**: Evaluating the refactoring plan's proposed changes against evidence

---

## Desired Outcome

Evolve PACT from a 2-person coordination tool to one that supports **~100 users across 20-30 repos, with teams of 10-12**, while maintaining its core philosophy: "PACT stays out of the way."

**Updated context**: Product owner confirmed a concrete deployment target at their company. Additionally, pact types scope to multiple levels (conversation > usergroup > repo > org > global), not just repo-local.

---

## Evidence Scoring Criteria

Each opportunity is scored on 4 dimensions (1-5 each, max 20):

| Dimension | Meaning |
|---|---|
| **Problem Evidence** | Is there validated pain? Past behavior, not speculation. |
| **Value to Next 10 Users** | Does this matter for the 3rd through 20th PACT user? |
| **Implementation Risk** | How likely is this to work as designed? (5 = low risk) |
| **Incrementality** | Can this be shipped without a big-bang refactor? (5 = fully incremental) |

---

## Opportunity Map

### OE1: Externalize Attachment Storage (S3/Cloud)

**Score: 17/20**

| Dimension | Score | Evidence |
|---|---|---|
| Problem Evidence | 5 | Product owner validated. Binary files committed to git history grow repo permanently. GitHub warns at 5GB. |
| Value to Next 10 Users | 4 | Any team sharing screenshots, logs, or documents hits this. |
| Implementation Risk | 4 | Proven patterns exist (LFS-S3, direct upload). Minimal codebase touch. |
| Incrementality | 4 | New AttachmentPort interface; default stays git-local; S3 is opt-in config. Does not require TransportSPI. |

**What to build**:
- `AttachmentPort` interface in `ports.ts`
- Git-local adapter (current behavior, default)
- S3 adapter (upload binary, store URL in envelope)
- Config: `PACT_ATTACHMENT_BACKEND=local|s3` + `PACT_S3_BUCKET` env vars
- Schema: add optional `url` field to `AttachmentSchema`

**Does NOT require**: TransportSPI, branch partitioning, or any other architectural change.

---

### OE2: Retry Improvements + Directory Sharding (Combined)

**Score: 19/20** (updated — deployment target validates both)

| Dimension | Score | Evidence |
|---|---|---|
| Problem Evidence | 5 | **Validated**: 100-user org, teams of 10-12 will hit contention on single-branch model. |
| Value to Next 10 Users | 5 | Directly enables the deployment target. |
| Implementation Risk | 5 | Retry is trivial. Directory sharding is a low-risk structural change. |
| Incrementality | 4 | Retry is one function. Sharding requires inbox scan update + migration path. |

**What to build**:
- Configurable retry count (default 3, env var override) + exponential backoff
- Directory sharding: namespace `requests/pending/` by recipient (`requests/pending/<user_id>/`)
- Update `pact-inbox.ts` to scan only the user's directory
- Migration: move existing flat pending files into recipient subdirectories
- Structured log entries for retry events

**Why these ship together**: Retry alone extends to ~15-20 users. Sharding alone reduces contention. Together, they provide a solid foundation for teams of 10-12 without any branch complexity.

---

### OE3: Config Federation + Team Routing

**Score: 17/20** (updated — 20-30 repo deployment validates config federation)

| Dimension | Score | Evidence |
|---|---|---|
| Problem Evidence | 5 | **Validated**: 100 users across 20-30 repos. Managing 20-30 config.json files manually is operational pain. |
| Value to Next 10 Users | 5 | The 3rd user joining needs group addressing. The 20th repo needs config sync. |
| Implementation Risk | 3 | Config federation design has multiple approaches — needs careful design. |
| Incrementality | 4 | Team routing is additive. Federation can layer on top. |

**What to build**:
- `teams` array in config.json: `{ team_id, display_name, members[], routing }`
- Routing strategies: fan-out (copy to all), round-robin (next available)
- Recipient field accepts `@team_id` in addition to `user_id`
- Config federation: mechanism to share/inherit config across repos (shared config repo, CLI sync, or inheritance)

**Does NOT require**: IdentityProvider, branch-per-user, or TransportSPI.

---

### OE10: Pact Store Migration (DESIGN DECIDED)

**Score: 18/20** (up from 16 — design risk resolved through product owner iteration)

| Dimension | Score | Evidence |
|---|---|---|
| Problem Evidence | 5 | **Validated by product owner**: pacts scope to conversation, usergroup, repo, org, global. |
| Value to Next 10 Users | 5 | Org-wide pact store enables consistent workflows across 20-30 repos. |
| Implementation Risk | 4 | Design decided: single store, recursive scan, metadata scoping. No resolution chain complexity. |
| Incrementality | 4 | Current repo-level pacts migrate to flat files. Backward compatible. |

**Design (finalized through 3 rounds of product owner iteration)**:

1. **Single pact store per org** — a git repo or directory, one root entrypoint
2. **Flat markdown files** — `{pact-name}.md` (not `{name}/PACT.md` directories)
3. **Ad-hoc subfolder organization** — teams create folders as they wish (`platform/`, `frontend/`, etc.)
4. **Recursive scan** — `pact_discover` globs `**/*.md` from root, ignores folder structure
5. **Metadata-driven scoping** — YAML frontmatter `scope` and `registered_for` fields control visibility
6. **No resolution chain** — no override, no cascade, no shadowing. Unique pact names.
7. **Global = built-in defaults** shipped with PACT, living in the store with `scope: global`

**What to build**:
- New `PactStorePort` interface: `discoverPacts(context) -> PactMetadata[]`
- Recursive glob + YAML frontmatter parsing (reuse existing `pact-loader.ts` logic)
- Config: `PACT_STORE` env var pointing to pact store root
- Migrate `pact-loader.ts` from `pacts/{name}/PACT.md` to `{name}.md` flat files
- Drop `schema.json` fallback (all metadata in frontmatter)
- Update `pact_discover` and `pact_request` to resolve from store

**Does NOT require**: TransportSPI, branch partitioning, or config federation (though pairs well with it).

---

### OE4: Lifecycle Hook Points in Handlers

**Score: 14/20**

| Dimension | Score | Evidence |
|---|---|---|
| Problem Evidence | 2 | No user has asked for hooks. But hooks are PACT's competitive differentiator per the positioning analysis. |
| Value to Next 10 Users | 4 | Teams want notifications, validation, auto-enrichment -- all require hook points. |
| Implementation Risk | 3 | Hook point insertion is safe. Hook execution is the complex part (deferred to executor). |
| Incrementality | 4 | Add before/after call sites in existing handlers. No structural change. |

**What to build (Phase 1 -- points only)**:
- Hook point interface: `{ stage: 'pre_send' | 'post_send' | 'pre_respond' | 'post_respond' | ... }`
- Insert hook invocation points in `pact-request.ts`, `pact-respond.ts`, `pact-amend.ts`, `pact-cancel.ts`
- No-op default (hooks fire but nothing listens)
- Log hook events for debugging

**What to defer (Phase 2 -- executors)**:
- Hook declaration in PACT.md YAML frontmatter
- Executor interface and reference implementation
- Dry-run mode

This separates "where hooks fire" (safe, incremental) from "what hooks do" (complex, needs design).

---

### OE5: TransportSPI Extraction

**Score: 11/20**

| Dimension | Score | Evidence |
|---|---|---|
| Problem Evidence | 2 | No user needs a second transport. Architecture concern, not user pain. |
| Value to Next 10 Users | 2 | Next 10 users are git users. HTTP transport matters for users 20-100. |
| Implementation Risk | 3 | Refactoring all 7 handlers is medium risk. 96 tests must continue passing. |
| Incrementality | 2 | Touches every handler. Must be done in one coordinated pass (or behind feature flag). |

**What it enables**: HTTP transport, A2A bridge, potential for non-git backing stores.

**Why it scores lower**: It delivers no user-visible value. It is enabling infrastructure for features that are not yet validated as needed. The plan calls it "P0 (architectural foundation)" -- but that framing assumes HTTP transport is coming soon, which has no evidence of demand.

**When to do it**: When HTTP transport development begins. Not before.

---

### OE6: Branch-Per-User Partitioning

**Score: 9/20**

| Dimension | Score | Evidence |
|---|---|---|
| Problem Evidence | 1 | Zero contention observed in production. Theoretical concern only. |
| Value to Next 10 Users | 2 | Only relevant if 10+ users push frequently enough to trigger conflicts. |
| Implementation Risk | 2 | Significant complexity: multi-branch management, inbox scanning across branches, cleanup. |
| Incrementality | 1 | Changes the fundamental git interaction model. Cannot be done incrementally. |

**The branch-per-user model** (from `/Users/cory/pact/docs/research/protocol-design/branch-per-user-inbox-architecture.md`) is well-researched and architecturally sound. But it solves a problem that has not manifested. The research itself acknowledges: "The current single-branch model may be preferable when team size is very small (2-3 people)."

**When to do it**: When retry improvements (OE2) are insufficient. Estimated: at 15-20+ concurrent users.

---

### OE7: Gerrit-Model Thread-Per-Branch with Inbox Refs

**Score: 7/20**

| Dimension | Score | Evidence |
|---|---|---|
| Problem Evidence | 1 | Zero evidence this is needed. The refactoring plan introduces it as a vision. |
| Value to Next 10 Users | 1 | Adds complexity with no user-facing benefit at current scale. |
| Implementation Risk | 1 | Complex: multi-ref pushes, inbox ref management, archival, garbage collection. Atomic push not supported on all platforms. |
| Incrementality | 1 | Big-bang change to git interaction model. |

**Specific concerns**:
1. `git push origin HEAD:refs/threads/req-123 HEAD:refs/inbox/alice/req-123 HEAD:refs/inbox/bob/req-123` -- atomic multi-ref push is NOT supported on Azure DevOps ([source](https://learn.microsoft.com/en-us/answers/questions/2262768/(ado)-(repo)-support-for-git-push-atomic))
2. `git ls-remote` performance degrades with many refs (14MB output reported on large repos, [HN](https://news.ycombinator.com/item?id=43387189))
3. Jujutsu (jj) reports "noticeably slower" performance with "a very large number of branches or other refs" ([jj docs](https://docs.jj-vcs.dev/latest/git-compatibility/))
4. Gerrit uses mod-100 sharding (`refs/changes/XX/YYYY/Z`) specifically because flat ref namespaces do not scale -- PACT's plan does not include this sharding

**When to consider it**: If PACT reaches enterprise scale (50+ users, 10,000+ threads). That is years away.

---

### OE8: HTTP Transport

**Score: 8/20**

| Dimension | Score | Evidence |
|---|---|---|
| Problem Evidence | 1 | No evidence any potential user lacks git access. Target users are developers. |
| Value to Next 10 Users | 2 | Possible value for non-developer collaborators in a mixed team. |
| Implementation Risk | 2 | New server, new persistence (SQLite/Postgres), new auth (OAuth). Large scope. |
| Incrementality | 2 | Requires TransportSPI first. Then a full server implementation. |

**When to do it**: When there is evidence of demand from non-git teams. Consider surveying potential users first.

---

### OE9: IdentityProvider Abstraction

**Score: 6/20**

| Dimension | Score | Evidence |
|---|---|---|
| Problem Evidence | 1 | config.json works fine for current and foreseeable usage. |
| Value to Next 10 Users | 2 | Might matter for GitHub Org integration at scale. |
| Implementation Risk | 3 | Abstraction is clean but adds indirection for no current benefit. |
| Incrementality | 3 | Can be done without touching handlers. |

**What to do instead**: When GitHub Org sync is needed, add a new ConfigAdapter that reads from GitHub API instead of config.json. The existing ConfigPort interface already supports this.

---

## Priority Matrix (Updated for 100-User Org)

```
                    Evidence Quality
                 LOW                HIGH
            +----------+----------+
            |          |          |
  HIGH      | OE4      | OE2     |  <-- Do now (validated deployment target)
  Value     |          | OE1     |
            |          | OE3     |
            |          | OE10    |
            +----------+----------+
            |          |          |
  LOW       | OE7 OE9  | OE5     |  <-- Defer / Do when needed
  Value     | OE8      | OE6     |
            |          |          |
            +----------+----------+
```

---

## Recommended Sequencing (Updated)

### Wave 1: Scaling Foundation (1-2 sessions)
1. **OE2**: Retry improvements + directory sharding (minimum viable scaling for 10-12 user teams)
2. **OE1**: S3 attachment storage (prevents 20-30 repos from bloating)

### Wave 2: Multi-Repo & Multi-Team (2-4 sessions)
3. **OE10**: Pact store migration (design decided — single store, flat files, metadata scoping)
4. **OE3**: Config federation + team routing (enables 20-30 repo org deployment)

### Wave 3: Differentiation (2-3 sessions)
5. **OE4**: Lifecycle hook points (competitive differentiator, incremental)

### Wave 4: Architecture Evolution (when triggered by need)
6. **OE5**: TransportSPI extraction (trigger: decision to build HTTP transport)
7. **OE6**: Branch partitioning (trigger: directory sharding insufficient at 10-12 users)

### Wave 5: Scale Features (when evidence demands)
8. **OE7**: Thread-per-branch (trigger: 50+ users, 10k+ threads)
9. **OE8**: HTTP transport (trigger: demand from non-git users)
10. **OE9**: IdentityProvider (trigger: need beyond config federation)

---

## Key Insight: Validated Scale Changes the Calculus

The original discovery assumed PACT's "next 10x" was 2 → 20 users. The product owner has validated a **concrete deployment target: ~100 users, teams of 10-12, across 20-30 repos.** This compresses the timeline significantly.

The gap between PACT today (2 users, 1 repo) and PACT's deployment target (~100 users, 20-30 repos) requires:
- **Contention resilience** for 10-12 user teams (OE2: retry + sharding)
- **Attachment externalization** across 20-30 repos (OE1: S3 storage)
- **Pact store** with metadata-driven scoping (OE10: single store, flat files, recursive scan)
- **Config federation** across 20-30 repos (OE3: config sync)
- **Automation extension points** (OE4: lifecycle hooks)

None of these require TransportSPI, branch partitioning, Gerrit-model refs, or HTTP transport. They require focused changes that respect PACT's philosophy while meeting a real deployment target.
