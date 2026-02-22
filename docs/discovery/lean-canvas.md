# Lean Canvas — Agent-Native Async GARP

## Discovery Phase: 4 (Market Viability) COMPLETE + POST-MVP RE-DISCOVERY

**Date**: 2026-02-21
**Product**: Agent-native async coordination ("agent-first email inbox")
**Architecture**: Git repo as Tier 1 transport, optional brain service as Tier 2
**All evidence below derived from discovery interviews, not speculation.**

---

## The Canvas

### 1. PROBLEM (Validated)

**Top 3 problems** (from user's daily tech support workflow):

1. **Context assembly is manual and interruptive** — Investigating a bug with an agent requires stopping to manually compose a handoff document before a colleague can help.

2. **Coordination tools are not agent-native** — Slack, email, and ticketing systems speak to humans, not to the agents that are doing the actual investigative work. Every handoff requires copy-paste to bridge the gap.

3. **No structured request/response flow** — Each handoff is ad-hoc. No templates, no expected response formats, no audit trail of who asked what and what came back.

**Existing alternatives**:
- Slack + markdown files (current workaround)
- Email chains with attachments
- Ticketing systems (Zendesk, JIRA) — human-oriented, no agent integration
- Shared documents — no routing, no lifecycle

### 2. CUSTOMER SEGMENTS (Identified)

**Early adopters**:
- Technical teams already using LLM agents for daily work (the user's own team)
- Developer friend (testing, games) — lighter use cases
- Teams using Craft Agents, Claude Code, or similar agent platforms

**Broader segments** (future):
- Any team doing async knowledge work where agents assist
- Support teams, engineering teams, product teams
- RPG groups (the original use case, now a domain implementation)

### 3. UNIQUE VALUE PROPOSITION

**One sentence**: An agent-first GARP where structured requests with context bundles flow between human+agent pairs via a shared git repository, so the receiving agent starts with full situational awareness instead of a cold start.

**Tagline candidates** (user's own words):
- "An agent-first email inbox"
- "A Git Remote with a brain"

### 4. SOLUTION (Validated Shape — Git Transport)

**Tier 1 (MVP)**: Shared git repo + local MCP server per client.

| Tool | What It Does |
|------|-------------|
| `garp_request` | Write structured request JSON to repo, commit, push |
| `garp_inbox` | Pull repo, scan for pending requests addressed to user |
| `garp_respond` | Write response, move request to completed, commit, push |
| `garp_status` | Pull repo, read request status and any response |

**Tier 2 (Phase 2)**: Brain service that watches the repo.
- Validates and enriches requests via LLM
- Sends push notifications (Slack, email)
- Runs per-request-type orchestrator skills (search JIRA, check duplicates)

**Tier 3 (Phase 3)**: Institutional memory.
- Indexes all requests/responses
- Detects patterns, proactively enriches context

**Key architectural decisions**:
- Git repo IS the GARP server (no custom server to deploy for MVP)
- Local MCP server wraps git operations into 4 tools
- Skills live in the repo, distribute via git pull
- Type-agnostic protocol: rigid envelope, flexible payload (Code Mode pattern)
- Tiered: Tier 1 always works, Tier 2/3 are additive and removable

### 5. CHANNELS

**Phase 1 (MVP testing)**:
- Direct personal network (developer friend, work colleagues)
- Shared GitHub/GitLab private repo

**Phase 2 (early adoption)**:
- Open source release of MCP server + repo template
- Craft Agents community
- Developer communities (HN, Reddit, Discord)

**Phase 3 (growth)**:
- Integration with other agent platforms
- Technical blog posts / demos
- Word of mouth

### 6. REVENUE STREAMS

**MVP**: None. Open source tool. The "server" is a git repo.

**Future possibilities** (not validated, speculative):
- Hosted brain service (Tier 2 as SaaS)
- Enterprise brain with institutional memory
- Managed repo + brain service bundles

**Note**: Revenue is not the primary goal. This is a tool built for personal and team use.

### 7. COST STRUCTURE

**MVP costs**:
- Developer time (user's own time)
- GitHub private repo (free)
- LLM API costs for client agents (user already has API keys)
- Zero server hosting costs (no server to host)

**Ongoing costs** (per team):
- GitHub/GitLab private repo (free for small teams)
- LLM inference costs at each client (BYO API key)
- Tier 2 brain service hosting (only when added; minimal compute)

**Key cost advantage of git transport**: The entire coordination infrastructure for MVP is a free GitHub private repo. There is no server to deploy, no database to maintain, no hosting to pay for.

### 8. KEY METRICS

**MVP success metrics**:

| Metric | Target | Rationale |
|--------|--------|-----------|
| Round-trip completion rate | >80% without Slack fallback | Core functionality works |
| Receiver agent startup time | <2 turns to useful work | Context bundles are effective |
| Skill contract consistency | >80% schema compliance | Skills produce reliable behavior |
| Adoption over Slack | >50% of handoffs during test | System is actually preferred |
| Second user initiation | At least 1 organic request | Not just responding |
| Git operation speed | <10s per operation | Transport is fast enough |
| Git conflict rate | <5% of operations | Append-only design works |

### 9. UNFAIR ADVANTAGE

**What cannot be easily copied or bought**:

1. **Builder is the user** — shortest possible feedback loop between design and usage.

2. **Existing platform ecosystem** — Craft Agents provides the mature client with MCP support, skills, Plan UI, and hooks.

3. **The skill contract pattern** — Code Mode insight applied to multi-agent coordination. Novel architectural approach.

4. **Git as transport** — Eliminates the "build a server" barrier entirely. Anyone with a GitHub account can have a GARP server in 5 minutes.

5. **Domain expertise** — Deep understanding of agent platforms (built Craft Agents) AND async coordination pain (daily tech support work).

---

## Risk Assessment (4 Big Risks)

### Value Risk: Will anyone use this?

**Status**: MITIGATED (for primary user)

The user has daily pain with the exact workflow this solves. Risk is whether it is better enough than Slack to justify switching.

**Git transport reduces value risk**: The switching cost is lower because there is no server to deploy. Clone a repo, install an MCP source, and you are running. If it does not work, you just stop using it — no infrastructure to tear down.

### Usability Risk: Can people figure it out?

**Status**: LOW RISK (for target users)

Target users are developers who use git daily. The coordination system uses tools they already understand (git push, git pull, JSON files). The MCP server abstracts the git operations, so the agent handles the mechanics.

**Onboarding**: Clone repo, add MCP source config to Craft Agents, start using. Skills are already in the repo.

### Feasibility Risk: Can we build it?

**Status**: VERY LOW RISK

The entire MVP is a local MCP server (~500 lines) that wraps git operations and validates JSON. The user built Craft Agents (a full Electron app with multiple MCP servers). This is a weekend-to-week build.

No server deployment. No database. No authentication infrastructure. No hosting. Git provides all of it.

### Viability Risk: Does the business model work?

**Status**: NOT APPLICABLE

Open source tool. The "server" is a free GitHub repo. There is nothing to monetize and nothing to maintain at the infrastructure level. Viability means "can two people use this without it falling over" — and git has been doing that for 20 years.

---

## Go/No-Go Decision

### GO — Proceed to Build

**Rationale**:

1. **Problem is validated** from daily lived experience (tech support handoffs)
2. **Solution is dramatically simpler** with git transport — no server to build or deploy
3. **Builder is the user** — shortest possible feedback loop
4. **Technical feasibility is trivially high** — ~500 lines of MCP server code
5. **Second user is confirmed** — can test full loop with shared repo
6. **MVP is tightly scoped** — local MCP server + repo conventions + 1 skill contract pair
7. **Phase 2 path is clear** — brain service watches repo, adds intelligence additively
8. **Zero infrastructure cost** — GitHub private repo is free
9. **Skills distribute for free** — git pull syncs skill contracts
10. **Audit trail is free** — git log IS the audit

**Conditions for GO**:
- Conduct lightweight validation with second user (15-min conversation about handoff pain)
- Define repo structure conventions (README in the repo)
- Build the local MCP server
- Write the sanity-check skill contract pair
- Test one complete round-trip

---

## Handoff Summary

### What Was Discovered

Started with an RPG Campaign State Engine. Through 6 rounds of Mom Test questioning (24+ questions), discovered the actual product: an agent-native async GARP for human+agent teams. Further refined through an architectural pivot to git as GARP transport.

### Discovery Arc

1. RPG Campaign State Engine (all gaps unvalidated)
2. Vision pivot to async multi-agent coordination
3. Explicit choice of Product B (GARP, separate from Craft Agents)
4. Validated via daily tech support workflow (real pain, real behavior)
5. Architectural decisions: central HTTP service, dumb router MVP, type-agnostic server
6. **Architecture pivot**: git repo as transport, local MCP server, tiered brain service

### What Was Validated

- The problem (manual context assembly, non-agent-native coordination)
- The user segment (technical teams using LLM agents daily)
- The core loop (structured request -> sync -> context-loaded response)
- The skill contract pattern (Code Mode applied to coordination)
- The deployment model (git repo = server; self-hostable; zero infrastructure)
- The tiered architecture (git base + optional brain + optional memory)

### What Needs Testing (requires building)

- Skill contract reliability (do paired skills produce consistent agent behavior?)
- Context bundle quality (better than manual markdown handoff?)
- Receiver agent startup time (1-2 turns from context bundle?)
- Git operation speed and conflict rate
- Adoption signal (will users prefer this over Slack?)

### Artifacts Produced

| File | Contents |
|------|----------|
| `docs/discovery/problem-validation.md` | 6-round interview record, evidence, assumptions, gate evaluation |
| `docs/discovery/opportunity-tree.md` | 6 scored opportunities, git-upgraded scoring, MVP boundary |
| `docs/discovery/solution-testing.md` | Git-based MVP components, repo structure, skill contracts, test plan, tiered roadmap |
| `docs/discovery/lean-canvas.md` | This file -- business model, risks, go/no-go decision |

---

## Post-MVP Viability Update (2026-02-21)

### Risk Reassessment After Build

| Risk | Pre-Build Status | Post-Build Status | Evidence |
|------|-----------------|-------------------|----------|
| Value | MITIGATED | PARTIALLY VALIDATED | Protocol works. Value proposition (better than Slack for rich handoffs) still untested with real workloads. |
| Usability | LOW | LOW | Two users onboarded. No confusion about protocol mechanics. |
| Feasibility | VERY LOW | CONFIRMED | 1,260 lines, 65+ tests, clean architecture, zero blocking issues. |
| Viability | N/A (open source) | CONFIRMED | Zero infrastructure cost. Free GitHub repo. BYO compute. |

### What Changed In the Canvas

**Problem**: Unchanged. The 3 validated problems remain. Real-world validation of the solution against these problems is the Phase 2 priority.

**Customer Segments**: Expanded. The README now documents generic MCP host compatibility (Claude Code, Cursor, VS Code, etc.), not just Craft Agents. This broadens the potential user base beyond the Craft Agents ecosystem.

**Solution**: Delivered and exceeded. Ports-and-adapters architecture, structured logging, graceful degradation -- all improvements over the planned design. Three new protocol primitives (thread_id, attachments, short_id) extend the solution space.

**Channels**: On track. garp-init.sh provides the onboarding tool. README is host-agnostic. Open source release path is clear.

**Key Metrics -- Post-MVP Actuals**:

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Round-trip completion rate | >80% | 100% (2/2) | PASS (small sample) |
| Receiver agent startup | <2 turns | Not measured (trivial requests) | NOT TESTED |
| Skill contract consistency | >80% | 100% (2/2) | PASS (small sample) |
| Adoption over Slack | >50% | Not measured | NOT TESTED |
| Second user initiation | 1+ organic | 1 (Dan sent a request back) | PASS |
| Git operation speed | <10s | <1s | PASS |
| Git conflict rate | <5% | 0% | PASS |

### Phase 2 Success Metrics

| Metric | Target | How Measured |
|--------|--------|-------------|
| Rich context bundle usage | 5+ requests with 4+ context fields | Count requests with substantive context bundles |
| Thread completion rate | 3+ multi-round threads completed | Count threads that reach resolution |
| Attachment usage | 3+ requests with attachments | Count requests with file attachments |
| Real workflow adoption | 2+ tech support handoffs through GARP instead of Slack | User self-report + request type diversity |
| New skill types | 2+ new skills created (beyond ask and design-skill) | Count skills/ directories |
| Cancel/amend usage | At least 1 cancel or amend exercised | Usage of lifecycle management tools |

### Updated Unfair Advantage

The original unfair advantages hold, with one addition:

5. **Emergent protocol evolution** -- The protocol adapts to real usage patterns. thread_id, attachments, and short_id were not designed in discovery but emerged from building. The protocol is simple enough that new primitives can be added without breaking existing usage. This is evidence that the type-agnostic, skill-driven design was the right call.
