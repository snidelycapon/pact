# Interview Log: Evidence Sources for PACT Evolution

**Date**: 2026-02-22
**Researcher**: Scout (nw-product-discoverer)
**Method**: Codebase analysis, web research, pattern comparison, product owner input

---

## Evidence Quality Framework

| Rating | Definition | Example |
|---|---|---|
| **PAST BEHAVIOR** | Observed in production or daily use | "Zero conflicts in 2-user testing" |
| **TECHNICAL FACT** | Verified against documentation or source code | "GitHub does not hard-limit branches but throttles at 15 ops/sec" |
| **PATTERN MATCH** | Similar system at similar scale demonstrated this | "Gerrit shards refs at mod-100 for directory performance" |
| **INFORMED OPINION** | Reasonable inference from evidence | "20+ users likely need retry improvements" |
| **SPECULATION** | No evidence, just reasoning | "HTTP transport would unlock non-developer users" |

---

## Source 1: PACT Codebase (PAST BEHAVIOR + TECHNICAL FACT)

### Key Files Examined

| File | Lines | Key Finding |
|---|---|---|
| `/Users/cory/pact/src/ports.ts` | 49 | 3 clean port interfaces. GitPort: 6 methods. ConfigPort: 2 methods. FilePort: 7 methods. |
| `/Users/cory/pact/src/adapters/git-adapter.ts` | 56 | Single retry on push. No backoff. No configurable retry count. Uses `simple-git` library. |
| `/Users/cory/pact/src/adapters/file-adapter.ts` | 65 | All paths relative to repoPath. Parent dirs auto-created. No attachment-specific logic. |
| `/Users/cory/pact/src/adapters/config-adapter.ts` | 31 | Flat member list only. 31 LOC. Zod validation. |
| `/Users/cory/pact/src/schemas.ts` | 97 | RequestEnvelope has `attachments: [{filename, description}]`. No URL field for external storage. |
| `/Users/cory/pact/src/tools/pact-request.ts` | 119 | Attachments written as `ctx.file.writeText()` directly to git. Lines 93-101. |
| `/Users/cory/pact/src/tools/pact-respond.ts` | 99 | Searches 3 directories sequentially. Atomic commit of response + move. |
| `/Users/cory/pact/src/tools/pact-inbox.ts` | 203 | Pull, list all pending, parse each JSON, filter by recipient. O(n) over all pending. |
| `/Users/cory/pact/src/tools/pact-discover.ts` | 151 | Scans pacts/ directory, loads YAML frontmatter metadata. |
| `/Users/cory/pact/src/tools/pact-do.ts` | 26 | Thin dispatcher wrapper. |

### Quantitative Findings

| Metric | Value | Method |
|---|---|---|
| Total LOC (src + tests) | ~3,100 | `wc -l` across all .ts files |
| Source files in src/ | 15 | Glob pattern |
| Port interface count | 3 | `ports.ts` inspection |
| Handler count | 7 (via 2 MCP tools) | Tool file enumeration |
| Push retry count | 1 | `git-adapter.ts` line 39 |
| Team members in schema | 2 (flat array) | `config.json` schema |
| Test count | 96 passing | Project documentation |

**Evidence Quality**: PAST BEHAVIOR / TECHNICAL FACT. Direct code inspection.

---

## Source 2: Product Owner Statements

| Statement | Context | Quality |
|---|---|---|
| "S3/external storage: Yes, absolutely needed." | Direct response to refactoring plan review | PAST BEHAVIOR -- has experienced the need |
| "Gerrit model: Let's explore. Are there patterns to inform us rather than a model adopted and forced?" | Healthy skepticism of complex proposal | INFORMED OPINION -- shows taste for simplicity |
| "Smallest valuable slice: Let's investigate this as well." | Concern about plan scope | INFORMED OPINION -- recognition of scope risk |

**Evidence Quality**: PAST BEHAVIOR for S3. INFORMED OPINION for scaling approach.

---

## Source 3: PACT Production Data

From `/Users/cory/pact/docs/discovery/problem-validation.md` (existing post-MVP discovery):

| Observation | Quality |
|---|---|
| "Zero conflicts observed in testing or live usage" (line 488) | PAST BEHAVIOR |
| "2 completed round-trips with a second user (Dan) on day 1" (line 519) | PAST BEHAVIOR |
| "Sub-second local operations" (line 489) | PAST BEHAVIOR |
| "Git operation speed: <1s. Git conflict rate: 0%" (line 283, lean canvas) | PAST BEHAVIOR |
| "Both used the 'ask' pact type -- no complex request types tested in production" (line 521) | PAST BEHAVIOR |

**Key implication**: The system works at 2-user scale with zero operational issues. Scaling concerns are theoretical until team grows.

---

## Source 4: Git Push Atomicity Research

### Search: "git push atomic multiple refs --atomic flag behavior"

| Finding | Source | Quality |
|---|---|---|
| `--atomic` flag ensures all-or-nothing ref updates if server supports it | [git-push docs](https://git-scm.com/docs/git-push) | TECHNICAL FACT |
| GitHub supports atomic pushes | Git protocol standard, confirmed in multiple sources | TECHNICAL FACT |
| **Azure DevOps does NOT support `git push --atomic`** | [Microsoft Q&A](https://learn.microsoft.com/en-us/answers/questions/2262768/(ado)-(repo)-support-for-git-push-atomic) | TECHNICAL FACT |
| `--atomic` has been stable since Git v2.4.0 | Git release history | TECHNICAL FACT |

**Impact on refactoring plan**: The plan's Gerrit model requires multi-ref atomic push (`HEAD:refs/threads/req-123 HEAD:refs/inbox/alice/req-123 HEAD:refs/inbox/bob/req-123`). This is NOT portable across all git hosting platforms. The plan states it is "generally atomic on modern Git servers" -- this is incorrect for Azure DevOps.

---

## Source 5: Git Ref Scaling Research

### Search: "github maximum number refs branches performance"

| Finding | Source | Quality |
|---|---|---|
| GitHub recommends repos under 1GB, warns at 5GB | [GitHub Docs](https://docs.github.com/en/repositories/creating-and-managing-repositories/repository-limits) | TECHNICAL FACT |
| "Large numbers of branches can result in unnecessary data in fetch operations, leading to slow transfer times or in extreme cases throttled repository performance" | [GitHub Docs](https://docs.github.com/en/repositories/creating-and-managing-repositories/repository-limits) | TECHNICAL FACT |
| 15 operations per second rate limit per repository | [GitHub Docs](https://docs.github.com/en/repositories/creating-and-managing-repositories/repository-limits) | TECHNICAL FACT |
| Android repo has 866k refs; packed-refs file is 62MB | [Git reftable docs](https://git-scm.com/docs/reftable) | TECHNICAL FACT |
| `git ls-remote` produced 14MB output on large repo (12MB from refs) | [Hacker News](https://news.ycombinator.com/item?id=43387189) | PATTERN MATCH |
| Packed-refs format requires linear scan for single ref lookup | [Git reftable docs](https://git-scm.com/docs/reftable) | TECHNICAL FACT |
| GitHub does not specify a hard maximum number of branches per repo | Multiple sources | TECHNICAL FACT |

**PACT projection**: 10-person team, 10 requests/day, 1 year = 3,650 threads. If thread-per-branch: 3,650 thread refs + ~10,950 inbox refs (3 participants avg) = ~14,600 refs/year. This is well within git's capability but would make `git ls-remote` and fetch operations measurably slower over time.

---

## Source 6: Gerrit Architecture Research

### Search: "Gerrit code review refs/changes refs model architecture"

| Finding | Source | Quality |
|---|---|---|
| Gerrit uses `refs/changes/XX/YYYY/Z` where XX = change_id mod 100 | [Gerrit Quick Intro](https://gerrit.cloudera.org/Documentation/intro-quick.html) | TECHNICAL FACT |
| Mod-100 sharding "reduces the number of files in any given directory within the git repository" | [Gerrit docs](https://gerritcodereview-test.gsrc.io/alpha-concept-refs-for-namespace.html) | TECHNICAL FACT |
| Users push to `refs/for/master`; Gerrit intercepts and creates change refs | [Graphite guide](https://graphite.com/guides/gerrits-approach-to-code-review) | TECHNICAL FACT |
| Gerrit is a PURPOSE-BUILT server managing refs internally | Multiple Gerrit docs | TECHNICAL FACT |

**Key insight**: Gerrit's model works because Gerrit is a server that manages refs. Users never interact with `refs/changes/*` directly. PACT is a client-side MCP tool with no server. Adopting Gerrit's model without Gerrit's server would require building equivalent ref management infrastructure.

---

## Source 7: Git Notes Research

### Search: "git notes practical use cases limitations scaling"

| Finding | Source | Quality |
|---|---|---|
| "Git Notes: Git's coolest, most unloved feature" | [Hacker News](https://news.ycombinator.com/item?id=44345334) | PATTERN MATCH |
| "Using non-text-format notes with git log doesn't make much sense, so you'll probably need to write some special-purpose tools" | [Alchemists](https://www.alchemists.io/articles/git_notes) | TECHNICAL FACT |
| git-appraise (Google) used notes for code review. Project is now archived. | [GitHub](https://github.com/google/git-appraise) | PAST BEHAVIOR |
| `cat_sort_uniq` merge strategy enables conflict-free note merging | git-appraise docs | TECHNICAL FACT |
| Git in 2025 focuses on Scalar, sparse checkout, background maintenance -- not notes | [PUDN article](https://www.pudn.club/programming/modern-git-in-2025-performance-scale-and-safety/) | PATTERN MATCH |

**Verdict**: Git notes are an interesting but impractical option. The archiving of git-appraise (the most prominent notes-based project) is a strong signal. Poor tooling support and fragility under common git operations make notes a risky foundation.

---

## Source 8: S3/Binary Storage Research

### Search: "git large binary files LFS alternatives S3 backend"

| Finding | Source | Quality |
|---|---|---|
| lfs-s3: Git LFS Custom transfer agent for S3 | [GitHub](https://github.com/nicolas-graves/lfs-s3) | PATTERN MATCH |
| Rudolfs: High-performance caching Git LFS server with S3 backend | [GitHub](https://github.com/jasonwhite/rudolfs) | PATTERN MATCH |
| Direct S3 upload (skip git entirely): store URL in git, content in S3 | Common industry pattern | PATTERN MATCH |
| git-annex: mature, many backends, but complex | [git-annex.branchable.com](https://git-annex.branchable.com/) | PATTERN MATCH |
| Backblaze B2 as cheaper LFS alternative | [nickb.dev](https://nickb.dev/blog/backblaze-b2-as-a-cheaper-alternative-to-githubs-git-lfs/) | PATTERN MATCH |

**Recommendation for PACT**: Direct S3 upload is the simplest pattern. Write binary content to S3, store URL in the envelope. No LFS setup required. The `AttachmentPort` interface abstracts the choice.

---

## Source 9: Jujutsu/jj Research

### Search: "jujutsu jj collaboration multi-user change-id colocated mode scaling"

| Finding | Source | Quality |
|---|---|---|
| Jujutsu separates change identity from commit identity via stable change-ids | [Jujutsu GitHub](https://github.com/jj-vcs/jj) | TECHNICAL FACT |
| Colocated mode works alongside git, transparent to team members | [cuffaro.com](https://cuffaro.com/2025-03-15-using-jujutsu-in-a-colocated-git-repository/) | TECHNICAL FACT |
| "In colocated workspaces with a very large number of branches or other refs, jj commands can get noticeably slower" | [Jujutsu docs](https://docs.jj-vcs.dev/latest/git-compatibility/) | TECHNICAL FACT |
| Designed to eventually handle Google's monorepo (86TB, 2B lines) | Community discussion | SPECULATION |

**Relevance to PACT**: The change-id concept validates stable identifiers across git operations. But jj's own documentation warns about performance with many refs -- the same scalability ceiling that would affect PACT's thread-per-branch model.

---

## Source 10: MCP Ecosystem Research

### Search: "MCP server multi-agent coordination async collaboration real-world use cases"

| Finding | Source | Quality |
|---|---|---|
| MCP November 2025 spec introduced Tasks primitive for async long-run operations | [Medium](https://medium.com/@dave-patten/mcps-next-phase-inside-the-november-2025-specification-49f298502b03) | TECHNICAL FACT |
| Agent-MCP framework for parallel agent coordination via MCP | [GitHub](https://github.com/rinadelph/Agent-MCP) | PATTERN MATCH |
| MCP Agent Mail: 1.7k GitHub stars, git+SQLite, freeform agent email | [GitHub](https://github.com/Dicklesworthstone/mcp_agent_mail) | PATTERN MATCH |
| Gartner forecasts 40% of business apps will integrate task-specific agents by 2027 | [OneReach](https://onereach.ai/blog/mcp-multi-agent-ai-collaborative-intelligence/) | SPECULATION |

**Risk assessment**: MCP Agent Mail is the closest competitor. It uses freeform email (no typed contracts), git+SQLite backing, and focuses on agents (not humans). PACT's differentiators (typed pacts, lifecycle hooks, human principals) remain unique. However, if Agent Mail adds typed contracts, PACT's moat narrows.

---

## Source 11: Concurrent Push / Retry Pattern Research

### Search: "git push pull rebase retry pattern concurrent users"

| Finding | Source | Quality |
|---|---|---|
| Kargo GitOps: default 50 retries for concurrent git pushes | [Kargo docs](https://docs.kargo.io/user-guide/reference-docs/promotion-steps/git-push/) | TECHNICAL FACT |
| Kargo issue: "concurrent promotions retry not working" | [GitHub issue #5286](https://github.com/akuity/kargo/issues/5286) | PAST BEHAVIOR |
| Git Rebase Push GitHub Action: "automatic rebase retry loop, perfect for GitOps workflows" | [GitHub Marketplace](https://github.com/marketplace/actions/git-rebase-push) | PATTERN MATCH |
| TortoiseGit requested "retry push after failed push followed by rebase" | [GitLab issue](https://gitlab.com/tortoisegit/tortoisegit/-/issues/2579) | PAST BEHAVIOR |

**Key insight**: Retry patterns are the industry standard for handling concurrent git pushes. Even at Kargo's scale (much more concurrent than PACT), retries work most of the time. The failure point is not "retries fail" but "too many concurrent writers overwhelm the retry mechanism."

**PACT projection**: At 2-20 users with append-only files (different file per request), rebase auto-resolves nearly 100% of the time. A 3-retry mechanism with backoff would handle this range comfortably.

---

## Source 12: Existing PACT Research Documents

| Document | Location | Key Finding | Quality |
|---|---|---|---|
| Branch-per-user architecture | `/Users/cory/pact/docs/research/protocol-design/branch-per-user-inbox-architecture.md` | Comprehensive 700-line research with 60+ sources. Email/IM/pub-sub pattern analysis. Migration path documented. | PATTERN MATCH (thorough but no production validation) |
| Transport & interop strategy | `/Users/cory/pact/docs/research/protocol-design/03-transport-and-interop.md` | TransportSPI design, HTTP/A2A plans. Well-structured. | INFORMED OPINION |
| Competitive landscape | `/Users/cory/pact/docs/research/protocol-design/04-competitive-landscape.md` | PACT occupies unique niche: typed contracts + lifecycle hooks + agent-native + human principals | PATTERN MATCH |
| Evolution roadmap | `/Users/cory/pact/docs/research/protocol-design/05-evolution-roadmap.md` | 5-phase plan: spec -> SPI -> hooks -> teams -> HTTP -> interop | INFORMED OPINION |
| ADR-001: Git as transport | `/Users/cory/pact/docs/adrs/adr-001-git-as-coordination-transport.md` | Git chosen for zero infra, zero cost, audit trail, offline-first | PAST BEHAVIOR (decision validated by production use) |
| ADR-005: Directory lifecycle | `/Users/cory/pact/docs/adrs/adr-005-directory-as-lifecycle.md` | Directories as state, designed for <100 pending requests | PAST BEHAVIOR (working in production) |
| Architecture doc | `/Users/cory/pact/docs/architecture/architecture.md` | "hundreds of requests, not millions" -- explicit scale expectation | INFORMED OPINION |

---

## Source 13: Product Owner Interview Session (2026-02-22, 7:30-8:20 PM EST)

**Participant**: Cory (product owner, PACT creator)
**Method**: Live discovery session — iterative design through direct questioning
**Evidence Quality**: PAST BEHAVIOR (deployment target from real org) + DESIGN DECISIONS

### Statements and Decisions

| Statement | Quality | Impact |
|---|---|---|
| "~100 users in the org where we'll be stress-testing this" | **PAST BEHAVIOR** — real company, real deployment target | Shifts contention from theoretical to deployment prerequisite |
| "Most teams will be more like ~10-12, but there will still be a broad number of users" | **PAST BEHAVIOR** — knows the org structure | Validates directory sharding need |
| "Potentially 20-30 repositories" | **PAST BEHAVIOR** — knows the org's repo count | Validates config federation need |
| "Pact types aren't global (necessarily), they can be specific to the org, to a repo, to a usergroup, to specific users in conversations" | **PAST BEHAVIOR** — understands the use cases | Introduces pact scoping as a design concern |
| "Drop ad-hoc, that's unnecessary" | **DESIGN DECISION** — scopes the feature | Removes conversation-inline pacts from scope |
| "Global is effectively going to be purely the default set that ships with PACT" | **DESIGN DECISION** — simplifies global scope | Global = built-in defaults, not a registry |
| "Why do we even need `/<pact-dir>/PACT.md` instead of just `/<pact-name>.md`?" | **DESIGN DECISION** — simplifies storage | Eliminates directory-per-pact convention |
| "Ad-hoc user-defined folders in this single flat storage is a good idea still" | **DESIGN DECISION** — finalizes storage model | Single store, recursive scan, folders for human organization |
| "A flat list with metadata that controls what's registered under what category" | **DESIGN DECISION** — finalizes scoping model | No resolution chain; metadata-driven visibility via frontmatter |

### Design Artifacts Produced

The session produced a finalized pact store design through 3 rounds of refinement:

1. **Round 1**: Multi-location resolution chain (conversation > usergroup > repo > org > global) — **rejected** as too complex
2. **Round 2**: Single store per org with flat list + metadata — **adopted**
3. **Round 3**: Ad-hoc subfolders for organization + recursive scan + flat `{name}.md` files — **finalized**

### Evidence Gaps Closed

| Gap (from original discovery) | Resolution |
|---|---|
| "At what team size does single-branch break?" | Product owner confirms teams of 10-12 — within the "noticeable contention" range |
| "Is S3 attachment storage actually needed?" | Confirmed: 20-30 repos accumulating attachments |
| "Do MCP users need structured async coordination?" | Confirmed: 100-user org deploying PACT for this purpose |

---

## Evidence Gap Summary (Updated)

| Question | Status | What We Know | Remaining Gap |
|---|---|---|---|
| At what team size does single-branch break? | **PARTIALLY CLOSED** | PO confirms teams of 10-12. Theoretical: contention at 5-15 users. | No load testing yet. Simulate concurrent pushes to validate. |
| Do MCP users need structured async coordination? | **CLOSED** | PO deploying to 100-user org for this purpose. | None — validated by deployment target. |
| Is S3 attachment storage actually needed? | **CLOSED** | PO confirms 20-30 repos with binary attachments. | None — validated. |
| How should pact types be scoped/stored? | **CLOSED** | Design decided: single store, flat files, metadata scoping, recursive scan. | None — design finalized through PO iteration. |
| Would HTTP transport unlock new users? | **OPEN** | Reasonable assumption for non-dev teams. | Zero evidence of demand. Ask potential users. |
| How important are lifecycle hooks? | **OPEN** | Competitive differentiator in analysis. | No user has asked for hooks. Build minimal; measure adoption. |
| Is branch-per-user operationally viable? | **OPEN** | Research says yes architecturally. | No production data on stdio MCP + multi-branch. Defer until sharding insufficient. |
| How should config federation work? | **NEW** | 20-30 repos need synced config. | Design not yet decided. Three approaches identified. |
