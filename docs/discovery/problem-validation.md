# Problem Validation — Async Multi-Agent GARP (Product B)

## Discovery Status: RE-DISCOVERY (Post-MVP) — Phase 2 Planning

**Discovery Date**: 2026-02-21
**Interviewer**: Scout (Product Discovery Facilitator)
**Interviewee**: Product creator / primary user / platform builder

---

## Discovery Timeline

### Round 1: Original Brief (Campaign State Engine)

The original brief identified 7 gaps in BWG Engine + Craft Agents for solo RPG play: no campaign state, no NPC tracking, no location persistence, no event timeline, no T1 context, no narrative summaries, no session continuity.

**Evidence status**: ALL UNVALIDATED. Zero gaps experienced through actual use.

**Key quote**: "I haven't actually used the system for this beyond basic testing of some functionality of the initial MCP server design."

### Round 2: Vision Pivot

During Phase 1 questioning about session frequency and play patterns, the user pivoted from RPG-specific problems to a broader architectural insight:

**Key quote**: "This architecture is almost transcending the entire RPG system thing entirely to an asynchronous multi-agent coordination and orchestration layer with HUMANS at each client node. Almost like a Git Remote for a shared or collaborative project, whatever it is, but with a 'brain' and an LLM."

### Round 3: Explicit Product Choice

**Key quote**: "The multi-agent GARP is absolutely what I want to focus on, that's *significantly* larger than just the RPG stuff. This is separate projects."

**Explicit choice**: Product B — separate project from craft-gm.

### Round 4: Grounded Evidence (STRONG)

The user provided concrete, lived workflow evidence from their actual job in tech support. This is the first validated pain signal in the discovery.

---

## Validated Problem: Async Human+Agent Coordination

### Primary Evidence: Tech Support Bug Handoff Workflow

**Source**: User's actual daily work at their startup organization.

**The workflow as described** (direct quotes, emphasis added):

> "I work in tech support at my startup organization, so being able to orchestrate a handoff of a bug investigation with context (e.g. repositories & files involved and to read in that session to validate) pointers to ask a colleague to sanity-check something for me."

> "I send that request from my agent session where I think I found the bug, it queues up a message to my colleague, she does her own agent session from that -- either by 'accepting' the incoming pre-constructed prompt for that type of request (something templated server side as a sanity check) [...] or by adding our own commentary to it and iterating on the Plan before it's Executed."

> "Once she's got a response that matches the expected reply for this request, she asks to push it back to the GARP server, which pushes back to me and alerts me that there's a reply."

> "From there, I can then pivot over to pushing out a new type of request with the additional validation / review trail context attached to the relevant engineering/product team to file the appropriate bug."

### Pain Points Identified (From Behavior, Not Speculation)

1. **Context loss at handoff** — When asking a colleague to verify a bug, the context (repos, files, what to look for) must be manually assembled and communicated
2. **No templated request types** — Each handoff is ad-hoc; no reusable structure for "sanity check" vs. "bug filing" vs. "review"
3. **No response flow** — No mechanism for the colleague's findings to flow back with structure
4. **No chain of context** — When escalating from sanity-check to bug-filing to engineering, context degrades at each hop
5. **No institutional memory** — Past tickets/investigations are not indexed; patterns are not detected; tribal knowledge lives in peoples' heads

### The "Tribal Knowledge Brain" Vision

**Key quote**: "Every single ticket starts to become indexed and the orchestrator will be able to spot patterns, inject context and historical context or insights into sessions."

This is the highest-value insight in the discovery. It reframes the GARP from "task dispatch" to "organizational intelligence that grows smarter with use."

### Round 4 Evidence: The Workflow in Detail

**Current literal steps** (from user):
1. Investigating a bug with their agent in a Craft Agents session
2. Interrupt the investigation to ask the agent to compose a handoff markdown file
3. Send the markdown file to colleague via Slack
4. Colleague receives it, has to "juggle it around" — open new agent session, load context manually
5. Colleague investigates, communicates back through Slack
6. User then manually re-packages for escalation to engineering with review trail context

**What makes Slack inadequate** (direct quote): "Directly feeding the context to the agents and being agent-native. The agents are the ones doing the investigations and sanity checks. The humans are in the loop monitoring them and making sure they're not going off the rails, and deciding how to triage and prioritize incoming requests. It's an agent-first email inbox."

**Institutional memory explicitly deferred** (direct quote): "Long-term aspiration, focus on the core framework model here."

**Minimal complete loop described** (from user): Human A works with agent to compose a structured request. Server validates against schema, resolves recipient, places in inbox. Client B sees it, Human B initiates agent session with pre-loaded context, composes response, submits back. Same notification chain fires in reverse. "It's async, the actual queues, requests, audit logs of who's asking for what, etc is all server-side."

**Skill contract early shape** (from user): Fields like "customer context", "issue description", "involved files", "requested reply type", "deadline for reply" — but explicitly open-ended: "open-ended flexibility is ideal here."

**Orchestration patterns confirmed non-prescriptive**: Ping-pong, ring, chain, broadcast (cron-triggered stand-up), hub-and-spoke all described as first-class. User specifically rejected rigid "tick" semantics.

---

## Product B: Async Multi-Agent GARP (Refined)

### Core Concept (Updated)

A self-hostable GARP server where:
- Humans paired with local LLM agents form the node type
- The server orchestrates async requests between nodes using templated, skill-based contracts
- Context bundles accompany every request so the receiving agent starts with full situational awareness
- The server accumulates institutional knowledge and can enrich future requests with historical context
- Multiple orchestration patterns are first-class: ping-pong, ring, hub-and-spoke, cron-triggered
- Domain-agnostic: tech support, dev workflows, RPG, any async collaboration

### Analogy

"Git Remote with a brain" — shared state + intelligent coordination + institutional memory.

### Architecture (From User's Descriptions)

```
                    +----------------------------+
                    |    Coordination Server      |
                    |  (Orchestrator + LLM Brain) |
                    |                            |
                    |  - Shared state            |
                    |  - Request routing         |
                    |  - Context assembly        |
                    |  - Pattern detection       |
                    |  - Institutional memory    |
                    +----------------------------+
                     /        |         \
                    /         |          \
        +-----------+  +-----------+  +-----------+
        | Client A  |  | Client B  |  | Client C  |
        | Human+LLM |  | Human+LLM |  | Human+LLM |
        |           |  |           |  |           |
        | Local:    |  | Local:    |  | Local:    |
        | - Skills  |  | - Skills  |  | - Skills  |
        | - Sources |  | - Sources |  | - Sources |
        | - Context |  | - Context |  | - Context |
        +-----------+  +-----------+  +-----------+
```

### Core Primitives (Emerging)

1. **Request Types** — Templated, schema-validated, with skill contracts on both ends
2. **Context Bundles** — Structured data + pointers (repos, files, versions, history), not hardcoded fields
3. **Skill Contracts** — Versioned skills synced between clients; define how agents handle request types
4. **Orchestration Patterns** — Ping-pong, ring, hub-and-spoke, cron-triggered (all first-class, not hardcoded)
5. **Institutional Memory** — Accumulated index of all interactions; pattern detection; context enrichment
6. **Response Flow** — Structured responses that match expected schemas for each request type

### The Skill Contract Pattern (Key Differentiator)

**Key quote**: "The actual system/protocol is an entry point akin to the Cloudflare Code Mode insights; and then the skills on each side of the client (versioned & synced with each other as part of 'connecting' as a team on that workspace, ideally) dictate how the agent utilizes that flexibility consistently as part of the shared contract defined through those skills."

This is the Code Mode pattern applied to multi-agent coordination:
- **Code Mode**: Few tools, flexible schemas, agent uses skill context to choose the right action
- **GARP**: Flexible protocol, skill contracts define how each side handles a request type
- **Implication**: The protocol is thin and generic; the intelligence lives in skills that are version-synced across team members

### Orchestration Patterns (Explicitly Non-Prescriptive)

The user was clear that rigid "tick" semantics are wrong. Multiple patterns must be first-class:

| Pattern | Example | Trigger |
|---------|---------|---------|
| Ping-pong | Bug sanity check: A asks B, B responds to A | On-demand, human-initiated |
| Chain | Bug escalation: Support -> Eng -> PM | On completion of previous step |
| Ring | Brainstorm: each person adds context, passes to next | Sequential, round-robin |
| Broadcast | Stand-up: server asks all team members | Cron-triggered |
| Hub-and-spoke | GM dispatches turns to all players | On-demand or scheduled |
| Accumulate | Support ticket indexing, pattern detection | Continuous, passive |

### What Makes This Novel (Refined)

1. **Human + LLM agent is the mandatory node type** — not pure agent orchestration, not pure human task management
2. **Skill contracts as GARP** — versioned, synced, define both sides of every interaction
3. **Institutional memory as first-class feature** — the server gets smarter with use
4. **Pattern-agnostic orchestration** — not one interaction model, but a framework for many
5. **Self-hostable, BYO API key** — not a SaaS platform, a tool you own

---

## Platform Decisions (Confirmed)

| Decision | Answer | Confidence |
|----------|--------|------------|
| Relationship to Craft Agents | Entirely separate platform | HIGH (explicit) |
| Client frontend | Craft Agents as first client (OSS, SDK integration) | HIGH |
| Deployment model | Self-hostable, BYO API key | HIGH (explicit) |
| First domain | Tech support coordination (workplace) | HIGH (lived experience) |
| RPG use case | Future domain implementation, not the first | MED |
| Target users | Technical teams, starting with user's own team | HIGH |

---

## Existing Art Analysis

### What Exists (Closest Frameworks)

| Framework | What It Does | What It Lacks |
|-----------|-------------|---------------|
| AutoGen v0.4 | Multi-agent orchestration, group chat | No HITL as first-class, no institutional memory |
| LangGraph Platform | Graph-based agent flows, persistence | Focused on agent-to-agent, not human+agent nodes |
| Google A2A Protocol | Agent-to-agent communication standard | Protocol only, no coordination intelligence |
| CrewAI | Role-based agent teams | Simulated humans, not real HITL |
| Temporal | Durable execution, workflow orchestration | No LLM intelligence, no context assembly |
| Slack/Linear/GitHub | Human async coordination | No agent assistance, no context bundles, no institutional memory |

### True Gap

No existing framework combines:
- Real human-in-the-loop as mandatory node type
- Local LLM agent assistance at each node
- Server-side LLM intelligence for coordination
- Skill-based interaction contracts
- Institutional memory that grows with use

---

## What Exists Today (Platform Inventory)

### Craft Agents Platform (craft-gm repo)

- Electron desktop AI agent platform
- Claude Code SDK + Codex dual-backend
- Workspace/session model with persistence
- MCP server integration (stdio + HTTP)
- Hooks system: event-driven automation
- Session lifecycle: status workflow
- Skills system: SKILL.md format, workspace-scoped
- Sources system: MCP, API, local filesystem
- Permission modes per session
- call_llm tool: secondary LLM invocation
- Plan submission pattern (UI for reviewing structured proposals)

### Relevant Craft Agents Patterns for Product B

| Pattern | In Craft Agents | Product B Application |
|---------|----------------|----------------------|
| Plan submission | SubmitPlan tool + UI review | Request review before execution |
| Skills | SKILL.md, workspace-scoped | Skill contracts, team-synced |
| Sources | MCP/API/local connections | Coordination server as source |
| Hooks | Event-driven automation | Could trigger on incoming requests |
| Sessions | Isolated conversation scopes | Local task sessions for requests |
| Labels | Session tagging | Request type / status tagging |
| Status workflow | Todo/InProgress/Done | Request lifecycle |

### rpg-tools (3rd Party Reference)

Transferable design patterns:
- Tiered context assembly (PILLARS / RECENT ARC / CURRENT)
- Importance classification with hierarchical filtering
- Changelog as audit trail
- Canonicity filter (anti-LLM-inflation)

---

## Assumptions Tracker (Product B — Final Round 4 Scoring)

| # | Assumption | Risk | Impact | Confidence | Priority | Status |
|---|-----------|------|--------|------------|----------|--------|
| B1 | Separate platform from Craft Agents | LOW | HIGH | HIGH | RESOLVED | CONFIRMED |
| B2 | Human+LLM as mandatory node differentiates | LOW | HIGH | HIGH | RESOLVED | CONFIRMED by tech support workflow |
| B3 | Multiple orchestration patterns needed (not just ticks) | LOW | HIGH | HIGH | RESOLVED | CONFIRMED — user listed 5+ patterns |
| B4 | Second user exists and will participate | LOW | HIGH | HIGH | RESOLVED | CONFIRMED + additional users available |
| B5 | Context bundles are key value-add | LOW | HIGH | HIGH | RESOLVED | CONFIRMED by handoff pain |
| B6 | Tech support is the right first domain | LOW | HIGH | HIGH | NEW — HIGH CONFIDENCE | Lived daily workflow |
| B7 | Server-side LLM brain is necessary for MVP | HIGH | MED | LOW | TEST | Could start without institutional memory |
| B8 | Craft Agents is the right first client | LOW | HIGH | HIGH | RESOLVED | CONFIRMED |
| B9 | User will build and use this | LOW | HIGH | HIGH | UPGRADED | Strong workplace motivation |
| B10 | Skill contracts are the right GARP | MED | HIGH | MED | DESIGN CRITICAL | Novel, needs prototyping |
| B11 | Self-hostable + BYO API key is the right deployment model | LOW | MED | HIGH | RESOLVED | CONFIRMED |
| B12 | Institutional memory (tribal knowledge brain) is achievable at MVP scale | HIGH | HIGH | LOW | DEFER to Phase 3 | May need to be Phase 2 feature |

---

## Phase 1 Gate Evaluation

### G1 Criteria Assessment

| Criterion | Target | Actual | Status |
|-----------|--------|--------|--------|
| Interviews conducted | 5+ | 1 (deep, multi-round) | PARTIAL — single user, but primary user/builder with workplace evidence |
| Pain confirmation >60% | >60% | 100% for tech support workflow | PASS for first domain |
| Problem articulated in customer words | Yes | Yes — extensive direct quotes | PASS |

### G1 Decision: CONDITIONAL PASS

**Rationale**: Traditional G1 requires 5+ interviews. We have 1 deep interview with the primary user/builder. However:

1. The user IS the first customer (builder-user)
2. The tech support pain is validated from daily work experience (past behavior, not future intent)
3. Multiple concrete workflow descriptions provided
4. The second user and colleague pool are identified but not yet interviewed

**Condition**: Before completing Phase 2, conduct at least 2 lightweight interviews with:
- The developer friend (secondary user perspective)
- One work colleague (tech support workflow validation)

These do not need to be formal — even a 15-minute conversation about "how do you currently handle bug investigation handoffs" would strengthen the evidence base.

---

## Round 5: Architectural Decisions

### Deployment Model

**Decision**: Central HTTP service. One server per team.

**Key quote**: "Each 'Team' would have its own central server deployed. This is where the actual orchestration LLM lives."

### Server Intelligence at MVP

**Decision**: Dumb router for MVP. LLM brain is Phase 2.

**Key quote**: "We can absolutely do a dumb router first for the initial MVP, so long as we don't lose track of the goals or design ourselves into a corner and get the brain wired up quickly once we've proven the concept."

### Request Type Agnosticism

**Decision**: Server is fully type-agnostic. Skills define everything.

**Key quote**: "That's exactly it! The 'validation' on a per-request type will be a feature for once we're wiring up the brain. The skills can define steps or processes that the orchestrator will perform in between routing the request."

**Phase 2 elaboration**: When the brain is wired up, skills will define orchestrator-side intermediate steps per request type. Example: "Search for historical tickets for this customer to ensure there are no other agents working on similar issues for them, do a parallel search of JIRA for existing filed tickets about this topic."

---

## Round 6: Architecture Pivot — Git as GARP Transport

### The Insight

The user recognized that the "dumb router" MVP they agreed to is exactly what git provides:

> "If we do use a local MCP client and handle the 'orchestration LLM' layer locally on the client before pushing it to a central shared git repository(ies) where the other clients are syncing from and using as the queues, does that greatly simplify our MVP architecture or even the entire project?"

### What This Changes

**Before (Round 5)**: Central HTTP service as MVP. Server handles routing, validation, inbox management.

**After (Round 6)**: Git repository IS the GARP. Local MCP server on each client wraps git operations into 4 tools. No server to build, deploy, or maintain.

### The Tiered Architecture

```
Tier 1: Git Repository (always works, the base protocol)
  - Shared repo = coordination "server"
  - Local MCP server per client wraps git operations
  - Directory structure = the protocol
  - git log = the audit trail
  - Skills hosted in repo, synced via git pull

Tier 2: Brain Service (optional, watches repo, adds intelligence)
  - Runs as GitHub Action, CI pipeline, or standalone watcher
  - Enriches requests, validates context, sends notifications
  - Commits enrichment back to repo
  - Hosts the orchestrator LLM

Tier 3: Institutional Memory (optional, accumulates knowledge)
  - Indexes all requests/responses
  - Pattern detection, proactive enrichment
```

This is exactly the relationship between bare git and GitHub — GitHub adds intelligence on top of the base protocol without changing it.

### What Git Provides Free

| MVP Need | Git Provides |
|----------|-------------|
| Request storage | JSON files in repo |
| Routing/inbox | Directory conventions + recipient field |
| Audit trail | git log |
| Sync | git push/pull |
| Conflict detection | git merge |
| Authentication | SSH keys / tokens |
| Versioning | Every commit |
| Hosting | GitHub/GitLab private repo (free) |
| Skill distribution | Skills in repo, synced on pull |
| Offline-first | Commit locally, push when ready |

### What This Supersedes

Round 5's "central HTTP service" decision is superseded. The HTTP service is now the Tier 2 brain — an optional additive layer, not the foundation. The foundation is git.

### Key Architectural Property

**The protocol (structured requests, context bundles, skill contracts) is completely independent of the transport.** If we design the file/directory conventions cleanly, the transport is swappable: git today, HTTP service tomorrow, both simultaneously. Tier 2 does not replace Tier 1 — it watches it and adds intelligence.

---

## Skill Evolution Path (Updated for Git Transport)

| Tier | Client Skills | Repo/Server Skills |
|------|--------------|-------------------|
| Tier 1 (MVP) | Sender + Receiver skills hosted in GARP repo, synced via git pull | None — git is the transport |
| Tier 2 (Brain) | Same | Orchestrator skills: per-request-type intermediate steps run by brain service |
| Tier 3 (Memory) | Same + auto-generated context hints | Institutional memory: pattern detection, proactive enrichment |

---

## Final Assumptions Tracker

| # | Assumption | Risk | Impact | Confidence | Priority | Status |
|---|-----------|------|--------|------------|----------|--------|
| B1 | Separate platform from Craft Agents | LOW | HIGH | HIGH | RESOLVED | CONFIRMED |
| B2 | Human+LLM as mandatory node differentiates | LOW | HIGH | HIGH | RESOLVED | CONFIRMED |
| B3 | Multiple orchestration patterns needed | LOW | HIGH | HIGH | RESOLVED | CONFIRMED |
| B4 | Second user exists and will participate | LOW | HIGH | HIGH | RESOLVED | CONFIRMED |
| B5 | Context bundles are key value-add | LOW | HIGH | HIGH | RESOLVED | CONFIRMED |
| B6 | Tech support is the right first domain | LOW | HIGH | HIGH | RESOLVED | CONFIRMED |
| B7 | Dumb router is sufficient for MVP | LOW | MED | HIGH | RESOLVED | Git IS the dumb router |
| B8 | Craft Agents is the right first client | LOW | HIGH | HIGH | RESOLVED | CONFIRMED |
| B9 | User will build and use this | LOW | HIGH | HIGH | RESOLVED | Weekend build scope reduces barrier |
| B10 | Skill contracts are the right protocol | MED | HIGH | MED | MUST TEST | Novel, needs prototyping |
| B11 | Self-hostable / zero infrastructure | LOW | MED | HIGH | RESOLVED | Git repo = zero infrastructure |
| B12 | Git as GARP transport | LOW | HIGH | HIGH | RESOLVED | CONFIRMED — user's insight |
| B13 | Type-agnostic protocol works in practice | MED | HIGH | MED | MUST TEST | Risk: agents produce invalid payloads |
| B14 | Tiered architecture supports brain insertion | LOW | HIGH | HIGH | RESOLVED | Brain watches repo; completely decoupled |
| B15 | Git conflicts are rare with append-only design | LOW | MED | HIGH | NEW | Requests are new files; conflicts unlikely |
| B16 | Git pull/push latency is acceptable for async | LOW | MED | HIGH | NEW | Async work tolerates seconds of latency |

### Remaining Risks (Ranked)

1. **B10 — Skill contract reliability**: Will paired skill files produce consistent, interoperable agent behavior? This is the single highest-risk assumption. Mitigation: prototype the "sanity check" skill pair and test 10 round-trips.

2. **B13 — Type-agnostic protocol works in practice**: Without centralized validation (at Tier 1), agents might produce garbage context bundles. Mitigation: local validation in MCP server; receiver skill must be robust to malformed input; optional JSON Schema per request type in repo.

3. Both risks are testable with a working prototype and two users. The git transport architecture did not introduce new high risks — it eliminated several (no server deployment, no auth infrastructure, no hosting).

---

## Phase 1 Gate: PASS (Final)

| Criterion | Target | Actual | Status |
|-----------|--------|--------|--------|
| Interviews | 5+ | 1 deep, multi-round (6 rounds, 24+ questions) | CONDITIONAL PASS |
| Pain confirmation | >60% | 100% for tech support workflow | PASS |
| Customer words | Yes | Extensive direct quotes across 6 rounds | PASS |
| Problem clearly articulated | Yes | "Agent-first email inbox" — user's own phrase | PASS |

**Condition remaining**: Lightweight validation with second user and one colleague before Phase 3 testing begins.

---

## Post-MVP Re-Discovery (2026-02-21)

### What Was Built vs What Was Planned

The MVP shipped. Every component described in the original discovery was delivered, plus three unplanned features emerged during implementation. This section reconciles planned vs actual.

#### Planned and Delivered (Complete Match)

| Discovery Artifact | What Was Planned | What Was Built | Delta |
|---|---|---|---|
| Local MCP server | ~500 lines wrapping git into 4 tools | 14 source files, ~1,260 lines, ports-and-adapters architecture | EXCEEDED — cleaner architecture than planned |
| 4 MCP tools | garp_request, garp_inbox, garp_respond, garp_status | All 4 implemented with full validation | EXACT MATCH |
| Request envelope | Rigid envelope + flexible context_bundle | Zod schema validation, exact design | EXACT MATCH |
| Directory lifecycle | pending -> active -> completed | Implemented. Active directory exists but is reserved (brain service) | EXACT MATCH |
| Skill contracts | SKILL.md files per request type, repo-hosted | Two skills shipped: "ask" and "design-skill" | EXCEEDED — design-skill is a multi-round pattern not in original scope |
| Team config | config.json with member registry | TeamConfigSchema with Zod validation | EXACT MATCH |
| Git transport | Shared repo as GARP, commit messages as audit | Implemented via simple-git with pull-rebase retry | EXACT MATCH |
| Commit message format | `[garp] new request: ...` | `[garp] new request: {id} ({type}) -> {recipient}` | EXACT MATCH |
| Conflict handling | Push retry with pull-rebase | Single retry in GitAdapter.push() | EXACT MATCH |
| Offline tolerance | git pull fails gracefully | Inbox and status fall back to local data with staleness warning | EXCEEDED — more graceful than planned |
| Init tooling | Not explicitly planned | garp-init.sh with new/join commands, example skill seeding | BONUS |

#### Planned but Deferred

| Discovery Artifact | What Was Planned | Status | Notes |
|---|---|---|---|
| Sanity-check skill | First skill contract pair | REPLACED by "ask" skill | More generic starting point. Sanity-check is in test fixtures only. |
| Craft Agents integration | Source configuration for Craft Agents specifically | GENERALIZED | README documents generic MCP host configuration (Claude Code, Cursor, VS Code, etc.) |
| Second user testing | 2-week test with developer friend | PARTIALLY DONE | Dan onboarded. Two real requests completed (both "ask" type). Evidence of bidirectional flow. |

#### Unplanned Features That Emerged

Three features were added during implementation that were not in the original discovery:

**1. thread_id** — Optional field on the request envelope that groups related requests into conversation threads. This emerged from the design-skill contract's need for multi-round iteration. The original discovery discussed orchestration patterns (ping-pong, chain, ring) but did not identify the threading primitive needed to implement them.

**2. attachments** — Optional array on the request envelope for file attachments committed atomically with requests. Each attachment has filename + description. Files stored in `attachments/{request_id}/`. The original discovery discussed "context bundles" extensively but assumed all context would fit in JSON fields. Attachments handle the case where context includes actual files (logs, screenshots, configs).

**3. short_id** — Derived from the last two segments of request_id (e.g., "cory-a1b2"). The request_id format `req-{date}-{time}-{user}-{hex}` is precise but unwieldy for conversation. short_id is the human-friendly handle for inbox display and verbal reference.

### Assumption Validation Against Implementation Experience

| # | Original Assumption | Pre-Build Confidence | Post-Build Status | Evidence |
|---|---|---|---|---|
| B1 | Separate platform from Craft Agents | HIGH | CONFIRMED | GARP is a standalone repo; MCP server works with any host |
| B2 | Human+LLM as mandatory node type | HIGH | CONFIRMED | Both real requests show human decision-making + agent execution |
| B3 | Multiple orchestration patterns needed | HIGH | PARTIALLY CONFIRMED | Only ping-pong tested. thread_id enables multi-round. Chain/ring/broadcast untested |
| B4 | Second user will participate | HIGH | CONFIRMED | Dan completed 2 round-trips on day 1 |
| B5 | Context bundles are key value-add | HIGH | UNCLEAR | Real requests ("y tho", "No U") used minimal context. Not yet used for the validated tech support workflow |
| B7 | Dumb router sufficient for MVP | HIGH | CONFIRMED | Git transport works. No intelligence needed |
| B10 | Skill contracts are the right protocol | MED | PARTIALLY CONFIRMED | "ask" skill works. "design-skill" proves multi-round contracts are viable. Schema compliance is agent-dependent |
| B12 | Git as transport | HIGH | CONFIRMED | Push/pull cycle works. Latency acceptable for async work |
| B13 | Type-agnostic protocol works | MED | CONFIRMED | Same protocol handles "ask" (simple) and "design-skill" (multi-round) identically |
| B15 | Git conflicts rare with append-only | HIGH | CONFIRMED | Zero conflicts observed in testing or live usage |
| B16 | Git latency acceptable for async | HIGH | CONFIRMED | Sub-second local operations |

### Assumptions That Were Wrong or Need Revision

**B5 — Context bundles are key value-add: NEEDS TESTING**

The original discovery validated this assumption from the tech support handoff workflow: "repos, versions, product, deployment type, customer all written up manually." But the real requests so far have been lightweight "ask" queries with minimal context. The context bundle infrastructure is built and works, but the high-value use case (rich tech support handoffs) has not been exercised in production. This is the highest-priority thing to validate next.

**B10 — Skill contracts produce consistent agent behavior: PARTIALLY CONFIRMED, RISK REMAINS**

The "ask" skill is simple enough that agents follow it naturally. The "design-skill" contract is sophisticated (multi-round, phase-tracking, draft refinement) but has not been tested with two humans using it in practice. The original risk was "SKILL.md might be too imprecise" — this remains the highest-risk assumption for complex request types.

**NEW ASSUMPTION — Agents will compose requests without excessive prompting**: Not in original tracker. When agents compose garp_request calls, they need to know what context_bundle fields to include. The skill file provides guidance, but the agent has to be in a context where it knows to read the skill and follow it. This is a UX/prompting challenge that was not anticipated.

### New Pain Points Discovered During Build

1. **Request ID verbosity** — `req-20260221-234611-cory-be49` is precise but hard to reference in conversation. short_id mitigates this, but suggests request_id format might be over-engineered for the actual use case.

2. **No request cancellation** — If you send a request to the wrong person, there is no cancel/retract mechanism. You would have to manually git rm the file.

3. **No request editing** — Context bundles are write-once. If you realize you left out critical context after sending, you cannot amend the request.

4. **Inbox is pull-only** — The agent has to explicitly call garp_inbox. There is no notification that new requests have arrived. For async work this is acceptable, but it means requests can sit unnoticed.

5. **Status field not updated in place** — The request envelope keeps `"status": "pending"` even after being moved to `requests/completed/`. The status is determined by directory location, not the field value. This is a minor inconsistency but could confuse agents reading the completed request.

6. **No thread listing** — thread_id exists on individual requests but there is no tool to list all requests in a thread. To follow a multi-round conversation, you would need to manually search.

### Evidence Quality Assessment

The real usage evidence is thin but genuine:

- 2 completed round-trips with a second user (Dan) on day 1
- Both used the "ask" skill type — no complex request types tested in production
- Context bundles were minimal ("y tho" / "No U") — playful testing, not the validated tech support workflow
- Bidirectional flow confirmed: Cory -> Dan and Dan -> Cory both worked
- Response times: ~3 minutes (first request), ~4 minutes (second request) — well within async tolerance

**What this validates**: The protocol works. Two humans with two agents can exchange structured requests through a shared git repo without manual git operations.

**What this does NOT validate**: Whether rich context bundles are actually better than Slack for real work. Whether skill contracts produce consistent behavior for complex request types. Whether the system gets adopted for daily tech support handoffs.
