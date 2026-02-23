# Solution Testing: Git Scaling Pattern Analysis for PACT

**Date**: 2026-02-22
**Researcher**: Scout (nw-product-discoverer)
**Focus**: Comparing git scaling patterns to find the one that fits PACT's philosophy

---

## The Question

The refactoring plan proposes a Gerrit-inspired thread-per-branch model with inbox refs. The product owner asks: "Are there patterns to inform us rather than a model adopted and forced?"

This document examines 6 distinct patterns for scaling git-based coordination, comparing them against PACT's actual needs and philosophy.

---

## PACT's Constraints and Philosophy

Before evaluating patterns, ground the analysis in what PACT actually is:

| Constraint | Implication |
|---|---|
| "PACT stays out of the way" | Solutions must not require users to understand git internals |
| 2-user team today, 10-20 target | Patterns must work at small scale, not just large |
| Append-only file model | Most git operations are conflict-free by design |
| Git push with single retry | Current contention handling is minimal |
| Developers are the users | Git proficiency can be assumed |
| stdio MCP subprocess | No persistent server process; each tool call is independent |
| 96 passing tests | Any change must not break existing behavior |

---

## Pattern 1: Status Quo with Improved Retry (Recommended for Now)

### How It Works

Keep the current single-branch, directory-lifecycle model. Improve the retry mechanism in `GitAdapter.push()`.

### Changes Required

```
git-adapter.ts:
  push():
    retry_count: 1 -> 3 (configurable)
    backoff: none -> exponential (100ms, 400ms, 1600ms)
    logging: add retry count to structured logs
    error: more descriptive failure message after exhausted retries
```

### Evidence

- PACT's current 2-user production: zero conflicts observed.
- The append-only file model means rebase almost always auto-resolves (different files).
- GitOps tools (Kargo, Flux) use similar retry patterns and handle moderate concurrency.
- Kargo's default is 50 retries ([Kargo docs](https://docs.kargo.io/user-guide/reference-docs/promotion-steps/git-push/)).

### Pros

- Zero architectural change
- Zero risk to existing tests
- Extends viable team size from ~5 to ~15-20 users
- Takes 30 minutes to implement

### Cons

- Does not fundamentally solve contention at scale (50+ users)
- Retry latency adds unpredictable delay to write operations

### PACT Philosophy Fit: EXCELLENT

No user-facing complexity. No new concepts. The tool "stays out of the way."

### Viable Scale: 2-20 concurrent users

---

## Pattern 2: Branch-Per-User Inbox (from PACT's Research)

### How It Works

Each user has their own branch (`inbox/<user_id>`). Senders push to the recipient's branch. The main branch holds only configuration and pacts.

Source: `/Users/cory/pact/docs/research/protocol-design/branch-per-user-inbox-architecture.md`

### Architecture

```
main              -> config.json, pacts/ (read-only)
inbox/cory        -> requests/pending/, requests/completed/, responses/
inbox/dan         -> requests/pending/, requests/completed/, responses/
inbox/team/backend -> team inbox (fan-out to members)
dead-letters      -> failed deliveries
```

### Evidence

- Well-researched in PACT's own docs (60+ sources cited).
- Email SMTP model maps cleanly (envelope = refspec, header = commit metadata).
- public-inbox project validates git as message storage substrate at scale (Linux kernel mailing list).
- MCP Agent Mail (1.7k GitHub stars) uses folder-based separation within a single branch.

### Pros

- Write contention reduced to "two senders push to same recipient simultaneously" (much rarer)
- Natural access control via branch permissions
- Inbox scan reads only user's branch (no filtering)
- Migration path documented (dual-write shadow mode)

### Cons

- Branch proliferation: N users + M teams = N+M branches
- Team fan-out requires server-side hook or GitHub Actions (reliability concern documented in PACT research: "GitHub Actions are designed for CI/CD, not message routing")
- Client must manage multiple branches (checkout/fetch/push to different refs)
- More complex `git push` targeting (must specify refspec for each operation)
- Responses cross branches (Dan responds to Cory's request by pushing to `inbox/cory`)

### Critical Concern: stdio MCP Model

PACT runs as a **stateless stdio subprocess**. Each tool call starts fresh. There is no persistent process managing working tree state. Branch-per-user requires either:
1. Multiple working tree checkouts (one per branch) -- requires significant disk management
2. `git fetch` + `git show` to read branch contents without checkout -- requires rewriting FileAdapter
3. Bare repo manipulation with `git update-ref` -- expert-level git, error-prone

This is a significant implementation concern that the research document does not address.

### PACT Philosophy Fit: MODERATE

Users never see branches directly (abstracted by MCP tools). But the internal complexity is real, and failure modes are harder to debug.

### Viable Scale: 5-100 concurrent users

---

## Pattern 3: Thread-Per-Branch with Inbox Refs (Gerrit Model, from Refactoring Plan)

### How It Works

Every thread gets its own branch (`refs/threads/<thread_id>`). Lightweight ref pointers (`refs/inbox/<user_id>/<thread_id>`) provide discovery. Multi-ref atomic push creates both the data branch and inbox pointers simultaneously.

Source: refactoring plan, Section 3.

### Architecture

```
refs/threads/req-123    -> full thread data (requests, responses)
refs/inbox/alice/req-123 -> pointer to refs/threads/req-123 tip
refs/inbox/bob/req-123   -> pointer to refs/threads/req-123 tip
refs/archive/2026/02     -> consolidated old threads
```

### Evidence

- Gerrit uses `refs/changes/XX/YYYY/Z` for code review at Android scale (866k+ refs). Shards with mod-100 to manage directory entries ([Gerrit docs](https://gerritcodereview-test.gsrc.io/alpha-concept-refs-for-namespace.html)).
- `git push --atomic` ensures all-or-nothing updates on GitHub and GitLab, but NOT on Azure DevOps ([Microsoft Q&A](https://learn.microsoft.com/en-us/answers/questions/2262768/(ado)-(repo)-support-for-git-push-atomic)).
- `git ls-remote` for inbox scanning is O(1) per ref (fast for filtering by prefix).

### Pros

- Absolute write contention isolation (only same-thread conflicts possible)
- Inbox discovery via `git ls-remote "refs/inbox/bob/*"` (server-side, fast)
- Clean conceptual model (every thread is an isolated unit)
- Supports mid-flight topology changes (add CC participant by creating new inbox ref)

### Cons

- **Complexity explosion**: Each request creates a new branch + N inbox refs. 100 threads with 3 participants = 400 refs.
- **Archival required**: Without cleanup, refs accumulate indefinitely. Plan acknowledges this.
- **Atomic push portability**: Not supported on Azure DevOps. Plan's assumption is wrong for non-GitHub/GitLab hosts.
- **No sharding**: Gerrit shards refs/changes with mod-100 for filesystem reasons. The plan does not include this.
- **stdio incompatibility**: Same working tree concerns as Pattern 2, but worse (more branches to manage).
- **`git ls-remote` at scale**: Can produce megabytes of output with many refs ([HN report of 14MB](https://news.ycombinator.com/item?id=43387189)).
- **Packed-refs linear scan**: Looking up a single ref in packed-refs requires scanning the entire file ([Git reftable docs](https://git-scm.com/docs/reftable)).
- **Tooling gap**: Standard git clients (GitHub UI, GitLab UI, VS Code) do not display custom ref namespaces well.

### Critical Concern: Operational Complexity

The Gerrit model works because Gerrit is a PURPOSE-BUILT server that manages refs internally. Users never interact with refs/changes/* directly -- they interact through the Gerrit web UI. PACT would need to build equivalent management infrastructure, turning a 2,200 LOC MCP server into a ref management system.

### PACT Philosophy Fit: POOR

This is the most complex option. It requires users (or at least operators) to understand custom ref namespaces, archival policies, and multi-ref push semantics. It does not "stay out of the way."

### Viable Scale: 50-10,000+ concurrent users (but designed for scales PACT is years away from)

---

## Pattern 4: Git Notes as Side-Channel Metadata

### How It Works

Use `git notes` to attach structured metadata (inbox assignments, lifecycle state) to commits, rather than using directory structure or branch namespaces.

### Architecture

```
main                          -> all request/response files (current model)
refs/notes/pact/inbox         -> notes mapping commit -> assigned recipients
refs/notes/pact/status        -> notes mapping commit -> lifecycle state
refs/notes/pact/thread        -> notes mapping commit -> thread membership
```

### Evidence

- Google's git-appraise used git notes for distributed code review. Used `cat_sort_uniq` merge strategy for conflict-free note merging ([GitHub](https://github.com/google/git-appraise)).
- Git notes are a built-in feature with separate ref namespaces.
- Poor tooling support is widely acknowledged: "git notes are Git's coolest, most unloved feature" ([HN discussion](https://news.ycombinator.com/item?id=44345334)).
- `git notes` requires custom tools for non-text notes ([Alchemists](https://www.alchemists.io/articles/git_notes)).
- git-appraise is now archived (no longer maintained), which is a signal about the viability of notes-based approaches.

### Pros

- No branch proliferation (everything stays on main)
- Notes have separate merge strategies (can be conflict-free)
- Keeps the current single-branch model intact
- Notes are invisible to normal git operations (do not clutter diffs)

### Cons

- **Poor tooling**: No GitHub/GitLab UI for notes. No VS Code support. Custom tools required.
- **Fragile**: Notes are easily lost (git rebase drops notes, git filter-branch drops notes).
- **Not well understood**: Most developers have never used git notes.
- **Performance**: Notes refs can grow large and require their own packing.
- **git-appraise is dead**: The most prominent git-notes project is archived, suggesting the pattern has limited viability.

### PACT Philosophy Fit: POOR

Requires understanding an obscure git feature. Fragile under common git operations. Does not stay out of the way -- it stays hidden and breaks silently.

### Viable Scale: N/A (not recommended due to tooling and fragility concerns)

---

## Pattern 5: Orphan Branches for Isolation

### How It Works

Use git orphan branches (no shared history with main) to create completely isolated data stores within the same repository.

### Architecture

```
main                -> config.json, pacts/
orphan:inbox-cory   -> cory's inbox data (completely separate history)
orphan:inbox-dan    -> dan's inbox data (completely separate history)
orphan:threads      -> all thread data (separate history)
```

### Evidence

- GitHub Pages uses orphan branches (`gh-pages`) for isolated content storage -- a well-established pattern ([GitHub docs](https://docs.github.com/en/pages)).
- Orphan branches share no history, meaning `git clone --single-branch` can fetch only the relevant branch.
- Standard git feature, widely supported.

### Pros

- Complete history isolation (inbox history does not pollute main history)
- Each branch can be independently cloned, garbage collected, or archived
- No shared commits means no rebase conflicts between branches
- Well-supported by all git hosting platforms

### Cons

- Same working tree management challenges as Pattern 2
- `git checkout` between orphan branches replaces the entire working tree
- No commit-level cross-referencing between branches (thread linking is harder)
- Adds cognitive complexity for debugging ("why is git log empty after checkout?")

### PACT Philosophy Fit: MODERATE

Cleaner than branch-per-user (complete isolation), but same stdio/working-tree challenges.

### Viable Scale: 5-50 concurrent users

---

## Pattern 6: Directory Sharding on Main Branch

### How It Works

Keep the single-branch model but partition the directory structure to reduce contention. Use user-namespaced directories within requests/pending/ so that concurrent writers target different filesystem paths.

### Architecture

```
main/
  config.json
  pacts/
  requests/
    pending/
      cory/           <- only requests TO cory go here
        req-123.json
      dan/            <- only requests TO dan go here
        req-456.json
    completed/
      cory/
        req-789.json
  responses/
    req-789.json
```

### Evidence

- This is how email maildir format works (separate directory per user, separate files per message). Proven at massive scale for decades.
- Git handles directory-level writes without conflicts when files are in different paths.
- The current model already partitions by lifecycle (pending/completed/cancelled). This extends partitioning by recipient.

### Pros

- **Zero new concepts**: Still a single branch. Still directory-based lifecycle. Still append-only files.
- **Reduces contention**: Two senders targeting different recipients write to different directories. Rebase auto-resolves.
- **Trivial migration**: Move existing pending files into recipient subdirectories. Backward-compatible with a feature flag.
- **Inbox scan is cheaper**: `listDirectory("requests/pending/<userId>")` instead of listing all pending + filtering by recipient.
- **No branch management**: No multi-branch checkout, no refspec targeting, no ref cleanup.
- **Works with stdio model**: No changes to how PACT interacts with git.

### Cons

- Does not eliminate contention (two senders to same recipient still conflict). But reduces it significantly.
- Directory structure becomes deeper (one more nesting level).
- Responses still need lookup by request_id (not partitioned).
- Does not provide the Gerrit model's "perfect isolation" -- it is a pragmatic improvement, not an architectural shift.

### PACT Philosophy Fit: EXCELLENT

No new concepts for users or operators. The directory structure is still the protocol. File locations still communicate meaning. The tool stays out of the way.

### Viable Scale: 2-30+ concurrent users

---

## Comparison Matrix

| Pattern | Complexity | Incrementality | Scale Ceiling | stdio Compatible | Evidence Quality |
|---|---|---|---|---|---|
| 1. Improved retry | Trivial | 5/5 | ~20 users | Yes | High (known pattern) |
| 2. Branch-per-user | High | 2/5 | ~100 users | Difficult | Medium (researched, not tested) |
| 3. Thread-per-branch (Gerrit) | Very high | 1/5 | ~10k users | Very difficult | Medium (Gerrit at Google scale) |
| 4. Git notes | Medium | 3/5 | Unknown | Yes | Low (dead project: git-appraise) |
| 5. Orphan branches | High | 2/5 | ~50 users | Difficult | Medium (gh-pages pattern) |
| 6. Directory sharding | Low | 4/5 | ~30 users | Yes | High (maildir pattern) |

---

## Recommended Path: Layered Scaling

Rather than choosing one pattern for all scales, layer patterns as PACT grows:

### Layer 1: Now (2-5 users)
**Pattern 1: Improved retry** -- increase retry count, add backoff. Effort: 30 minutes.

### Layer 2: Next (5-20 users)
**Pattern 6: Directory sharding** -- namespace pending directories by recipient. Effort: 1-2 sessions. Reduces contention and improves inbox scan performance. Fully incremental, single-branch.

### Layer 3: Later (20-50 users)
**Pattern 2: Branch-per-user** -- separate inbox branches. Effort: significant. Only pursue when Layers 1-2 are insufficient. Requires solving the stdio working-tree problem first.

### Layer 4: Much Later (50+ users)
**Pattern 3 elements** -- selectively adopt Gerrit-inspired patterns (e.g., `git ls-remote` for discovery) if branch-per-user proves insufficient. Do not adopt the full model wholesale.

### Never
**Pattern 4: Git notes** -- insufficient tooling and fragile under common git operations.

---

## The Key Insight

The refactoring plan's Gerrit model is designed for Google-scale problems. PACT is a 2-person tool growing toward 10-20 users. The simplest patterns (retry improvements + directory sharding) cover the next 10-15x of growth without introducing any architectural complexity.

The patterns that fit PACT's philosophy share a trait: **they are invisible to the user.** Improved retries, directory sharding, and smarter inbox scans all happen behind the tool surface. The user never needs to understand branches, refs, or git internals. This is what "stays out of the way" means.

The Gerrit model violates this principle by requiring ref management, archival policies, and multi-ref push semantics. It is the right tool for Gerrit. It is not the right tool for PACT -- not yet, and possibly not ever.

---

## Sources

### Primary Sources (High Confidence)
- [GitHub Repository Limits](https://docs.github.com/en/repositories/creating-and-managing-repositories/repository-limits)
- [Git push documentation](https://git-scm.com/docs/git-push) -- `--atomic` flag semantics
- [Git reftable documentation](https://git-scm.com/docs/reftable) -- packed-refs scaling
- [Gerrit Quick Introduction](https://gerrit.cloudera.org/Documentation/intro-quick.html)
- [Gerrit refs/for namespace](https://gerritcodereview-test.gsrc.io/alpha-concept-refs-for-namespace.html)
- [Azure DevOps: no atomic push support](https://learn.microsoft.com/en-us/answers/questions/2262768/(ado)-(repo)-support-for-git-push-atomic)
- [Kargo git-push configuration](https://docs.kargo.io/user-guide/reference-docs/promotion-steps/git-push/)

### Secondary Sources (Medium Confidence)
- [Hacker News: git ls-remote at scale](https://news.ycombinator.com/item?id=43387189) -- 14MB output report
- [Jujutsu git compatibility: ref performance](https://docs.jj-vcs.dev/latest/git-compatibility/) -- slowdown with many refs
- [git-appraise (Google)](https://github.com/google/git-appraise) -- archived git-notes code review
- [Hacker News: git notes unloved feature](https://news.ycombinator.com/item?id=44345334)
- [Graphite: Gerrit approach to code review](https://graphite.com/guides/gerrits-approach-to-code-review)

### Codebase Analysis
- `/Users/cory/pact/src/adapters/git-adapter.ts` -- current push retry implementation
- `/Users/cory/pact/src/tools/pact-inbox.ts` -- current inbox scan implementation
- `/Users/cory/pact/docs/research/protocol-design/branch-per-user-inbox-architecture.md` -- existing research
- `/Users/cory/pact/docs/adrs/adr-001-git-as-coordination-transport.md` -- original git transport decision
- `/Users/cory/pact/docs/adrs/adr-005-directory-as-lifecycle.md` -- directory lifecycle design
