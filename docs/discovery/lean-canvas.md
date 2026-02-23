# Lean Canvas: PACT Evolution -- Validated Business Model

**Date**: 2026-02-22
**Researcher**: Scout (nw-product-discoverer)
**Scope**: Cost-benefit analysis for each proposed change in the refactoring plan

---

## Current State: What PACT Is Today

| Attribute | Value |
|---|---|
| Codebase | ~3,100 LOC (including tests), 96 passing tests |
| Users | 2 (dev). **Deployment target: ~100 users, teams of 10-12, 20-30 repos** |
| Architecture | Ports-and-adapters, 3 ports (Git, File, Config), 7 action handlers |
| Transport | Git, single branch (main), pull-rebase-push |
| Tools | 2 MCP tools (pact_discover, pact_do) dispatching to 7 actions |
| Deployment | stdio subprocess via MCP SDK |
| Identity | PACT_USER env var + config.json lookup (per repo, no federation) |
| Attachments | Committed directly to git history |
| Conflict handling | Single retry with pull --rebase |
| Pact scoping | Repo-level only (`pacts/{name}/PACT.md`). **Target: single pact store per org, flat `{name}.md` files, metadata-driven scoping, recursive scan** |

---

## Change-by-Change Analysis

### Change 1: S3 Attachment Storage

**Who benefits**: Any team sharing binary attachments (screenshots, logs, PDFs).

| Dimension | Assessment |
|---|---|
| Development cost | 1-2 sessions. New AttachmentPort interface + S3 adapter + config. |
| Complexity cost | Low. Isolated to attachment code paths. New port follows existing pattern. |
| Operational cost | Medium. S3 bucket setup, IAM credentials, cost ($0.023/GB/month for S3 Standard). |
| Risk if we DO it | Low. Well-understood pattern. Default stays git-local (zero disruption for existing users). |
| Risk if we DON'T | Medium-High. Repository grows permanently with every binary attachment. At ~200 requests with attachments, could approach GitHub's 1GB recommendation. |

**Validated by**: Product owner ("absolutely needed"), GitHub documentation (repo size limits), git-lfs ecosystem evidence.

**Verdict**: DO IT. High confidence, isolated change, validated need.

---

### Change 2: TransportSPI Extraction

**Who benefits**: Future developers building HTTP or A2A transports.

| Dimension | Assessment |
|---|---|
| Development cost | 2-4 sessions. Refactor all 7 handlers to call TransportSPI instead of ports directly. |
| Complexity cost | Medium. New abstraction layer. Must ensure 96 tests pass unchanged. |
| Operational cost | None (refactoring, not new infrastructure). |
| Risk if we DO it | Medium. Premature abstraction risk -- designing the interface without a second consumer leads to wrong abstractions. |
| Risk if we DON'T | Low for 6-12 months. The current port interfaces already provide testability and swappability. When HTTP transport is needed, extract then with the real second consumer as guide. |

**Not validated by**: No user has requested a non-git transport. No evidence of demand from non-git teams.

**Verdict**: DEFER until HTTP transport work begins. The plan's own roadmap places HTTP at Phase 4.

---

### Change 3: Gerrit-Model Thread-Per-Branch + Inbox Refs

**Who benefits**: Teams with 50+ concurrent users experiencing push contention storms.

| Dimension | Assessment |
|---|---|
| Development cost | High. 4-8 sessions minimum. New ref management, multi-ref push, inbox scanning via ls-remote, archival mechanism. |
| Complexity cost | Very high. Doubles the git interaction surface. Introduces ref lifecycle management. Requires solving stdio working-tree problem. |
| Operational cost | Ongoing. Ref cleanup, archival cron, monitoring ref count, debugging cross-ref issues. |
| Risk if we DO it | High. Atomic multi-ref push not supported on Azure DevOps. `git ls-remote` degrades with many refs. No sharding (unlike Gerrit). Difficult to test without production scale. |
| Risk if we DON'T | Low for years. PACT has 2 users. Even at 20 users, improved retry + directory sharding handles contention. |

**Not validated by**: Zero push conflicts observed in production. No user has reported contention.

**Verdict**: DO NOT DO. The simplest effective patterns (retry improvements + directory sharding) cover the next 10-15x of growth at a fraction of the complexity.

---

### Change 4: Lifecycle Hooks

**Who benefits**: Teams wanting automation (notifications, validation, enrichment) triggered by PACT lifecycle events.

| Dimension | Assessment |
|---|---|
| Development cost | 2-3 sessions (hook points only). Longer for executor + dry-run. |
| Complexity cost | Low for hook points (add before/after calls to handlers). Medium for full executor system. |
| Operational cost | Depends on executor. PACT defines points, not executors. |
| Risk if we DO it (points only) | Low. Hook points are no-ops until an executor is registered. Zero behavioral change. |
| Risk if we DON'T | Medium. Lifecycle hooks are PACT's competitive differentiator (per `/Users/cory/pact/docs/research/protocol-design/04-competitive-landscape.md`). Without them, PACT is "just another message pipe." MCP Agent Mail could expand into this space. |

**Partially validated by**: Competitive analysis shows hooks as unique differentiator. No user has explicitly requested hooks.

**Verdict**: DO HOOK POINTS incrementally. Defer executor implementation until the first concrete use case (e.g., "send Slack notification on new request").

---

### Change 5: HTTP Transport

**Who benefits**: Teams without shared git repos. Non-developer collaborators.

| Dimension | Assessment |
|---|---|
| Development cost | Very high. New server, REST API, persistence (SQLite/Postgres), OAuth, Docker packaging. Estimated: 2-4 weeks. |
| Complexity cost | Very high. Separate deployable artifact with its own operational concerns. |
| Operational cost | High. Server hosting, database management, authentication infrastructure, monitoring. |
| Risk if we DO it | Medium-High. Large scope. Unknown demand. Could build a server nobody needs. |
| Risk if we DON'T | Low. PACT's target users are developers with git. No evidence of demand from non-git users. |

**Not validated by**: No user has requested HTTP transport. Target audience is developers with git configured.

**Verdict**: DO NOT DO until there is evidence of demand. Consider surveying potential users: "Would you use PACT if it did not require git?"

---

### Change 6: IdentityProvider Abstraction

**Who benefits**: Large organizations wanting dynamic membership via GitHub Org or LDAP.

| Dimension | Assessment |
|---|---|
| Development cost | 1-2 sessions for abstraction. More for specific providers (GitHub API, OIDC). |
| Complexity cost | Low-Medium. Abstraction over existing ConfigPort. |
| Operational cost | Depends on provider. GitHub Org requires API token. OIDC requires identity server. |
| Risk if we DO it | Medium. Premature abstraction. Designing without a real consumer. |
| Risk if we DON'T | Low. config.json handles 2-50 members trivially. Manual updates are acceptable at this scale. |

**Not validated by**: No user has requested dynamic identity. config.json works.

**Verdict**: DEFER. When GitHub Org sync is needed, write a `GitHubConfigAdapter` that implements the existing `ConfigPort` interface. No new abstraction needed.

---

### Change 7: Team/Group Routing

**Who benefits**: Teams of 3+ people who want to address requests to groups.

| Dimension | Assessment |
|---|---|
| Development cost | 1-2 sessions. Config schema extension + routing logic in request handler. |
| Complexity cost | Low. Additive change. Does not alter existing functionality. |
| Operational cost | None (configuration, not infrastructure). |
| Risk if we DO it | Low. Well-scoped, testable, backward-compatible. |
| Risk if we DON'T | Medium. The 3rd person joining a PACT team immediately needs "@backend-team" addressing. Without it, senders must know individual recipient IDs. |

**Partially validated by**: The branch-per-user research doc already proposed team config format. Teams are a natural next step.

**Verdict**: DO IT when the 3rd user joins. Low cost, clear value, incremental.

---

### Change 8: Retry Improvements

**Who benefits**: All users, as team size grows.

| Dimension | Assessment |
|---|---|
| Development cost | < 30 minutes. One function modification. |
| Complexity cost | Trivial. |
| Operational cost | None. |
| Risk if we DO it | Essentially zero. More retries with backoff is strictly better. |
| Risk if we DON'T | Low now, grows with team size. A failed push with no fallback blocks the user. |

**Validated by**: Production systems (Kargo uses 50 retries). Common practice in distributed systems.

**Verdict**: DO IT immediately. Highest value-to-effort ratio of any change.

---

## Summary: Cost-Benefit Ordering (Updated for 100-User Org)

| Change | Cost | Benefit | Evidence | When |
|---|---|---|---|---|
| Retry + directory sharding | Low | Survives 10-12 user teams | **High (validated)** | Before deployment |
| S3 attachments | Low | Prevents 20-30 repos bloating | **High (validated)** | Before deployment |
| Pact store migration | Low-Medium | Org-wide consistent workflows | **High (design decided)** | Before deployment |
| Config federation | Medium | Manages 20-30 repos | **High (validated)** | Before deployment |
| Team routing | Low | Enables team addressing | High | With config federation |
| Lifecycle hook points | Low-Medium | Competitive differentiation | Medium | Post-deployment |
| TransportSPI | Medium | Enables future transports | Low | When HTTP transport begins |
| Gerrit thread refs | Very High | Enterprise contention | Low | If sharding insufficient |
| HTTP Transport | Very High | Non-git users | Low | When demand is proven |

---

## The "What If We Do Nothing" Scenario

If PACT makes ZERO architectural changes from today, deploying to a ~100-user org:

| Timeframe | What Happens | Impact |
|---|---|---|
| Deployment day | 10-12 user teams hit push contention immediately | **High** -- blocked workflows |
| Week 1 | Binary attachments start accumulating across 20-30 repos | Medium -- git clone slows |
| Month 1 | Config drift across 20-30 repos as members change | Medium -- manual sync burden |
| Month 2 | Teams want org-standard pact types, only have repo-local | Medium -- inconsistent workflows |
| Month 3+ | 20-30 repos with growing attachment bloat | **High** -- repo size spiraling |

**Key insight**: Doing nothing is NOT viable for org deployment. The deployment target demands retry+sharding, S3 attachments, and config federation as prerequisites — not nice-to-haves.

---

## Risk Map

```
              Probability of Needing It (within 12 months)
                 LOW                        HIGH
            +-------------------+-------------------+
            |                   |                   |
  HIGH      | Gerrit refs       | S3 Attachments    |
  Cost      | HTTP Transport    |                   |
            | A2A Bridge        |                   |
            |                   |                   |
            +-------------------+-------------------+
            |                   |                   |
  LOW       | IdentityProvider  | Retry improvements|
  Cost      | TransportSPI      | Team routing      |
            |                   | Hook points       |
            |                   |                   |
            +-------------------+-------------------+
```

**The optimal strategy**: Start in the bottom-right quadrant (low cost, high probability). Move to top-right only when validated. Avoid top-left entirely until evidence demands it.

---

## For the Product Owner

### Deployment Prerequisites (all validated)

The ~100 user, 20-30 repo deployment target means these are **prerequisites**, not aspirations:

1. **Retry + directory sharding** — without this, 10-12 user teams will see push failures on day one
2. **S3 attachment storage** — without this, 20-30 repos will accumulate binary bloat
3. **Config federation** — without this, onboarding/offboarding creates manual sync across 20-30 repos
4. **Pact store migration** — without this, teams can't share org-standard pact types across repos

### Open Design Questions

1. **Config federation approach**: Shared config repo? CLI sync tool? Config inheritance? Needs design.
2. **Pact store location**: Separate git repo? Directory within an org config repo? Same repo as config federation?
3. **Deployment timeline**: When does the org deployment start? This determines the sprint priority.
