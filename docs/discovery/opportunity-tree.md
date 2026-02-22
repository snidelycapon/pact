# Opportunity Solution Tree — Async Multi-Agent PACT

## Discovery Phase: 2 COMPLETE + POST-MVP RE-DISCOVERY (Updated for Git Transport Architecture)

**Date**: 2026-02-21
**Product**: Agent-native async PACT server ("agent-first email inbox")
**Primary domain**: Tech support coordination (validated from daily work experience)
**Transport**: Git repository (Tier 1) + optional brain service (Tier 2)

---

## Desired Outcome

Enable human+agent teams to coordinate async work through structured, context-rich requests without manual context assembly, copy-pasting between tools, or losing audit trails.

**Success metric**: A complete request round-trip (compose -> push -> pull -> respond -> push -> pull) takes less time and produces better context than the current Slack + markdown handoff workflow.

---

## Opportunity Tree

### O1: Eliminate Manual Context Assembly (Score: 12/15)

**Evidence**: "I usually have to interrupt my conversation with the agent investigating it to write me a handoff file" / "repos, versions, product, deployment type, customer all written up manually or inferred through Zendesk"

**Job step**: When I find something that needs another person's eyes, I need to package up what I know so they can start where I left off.

**Current behavior**: Interrupt agent conversation, manually compose markdown handoff, post to Slack.

**Scoring**:
- Importance: 5/5 (happens daily, every handoff)
- Satisfaction with current solution: 1/5 (manual, interruptive, lossy)
- Frequency: 4/5 (multiple times per week minimum)
- Total: 12/15

**Opportunities within**:
- O1a: Agent-composed context bundles (agent extracts structured context from current session)
- O1b: Schema-defined request types (standard fields via pacts in repo)
- O1c: Automatic metadata enrichment (Tier 2 brain service fills in missing context)

---

### O2: Make Coordination Agent-Native (Score: 11/15)

**Evidence**: "Directly feeding the context to the agents and being agent-native. The agents are the ones doing the investigations and sanity checks." / "It's an agent-first email inbox"

**Job step**: When I receive a request from a colleague, I need my agent to immediately understand the context and start working, not make me copy-paste into a new session.

**Current behavior**: Receive markdown over Slack, open new agent session, paste context, agent re-parses.

**Scoring**:
- Importance: 5/5 (fundamental to the value proposition)
- Satisfaction with current solution: 1/5 (zero agent integration in current handoff)
- Frequency: 4/5 (every received request)
- Total: 11/15

**Opportunities within**:
- O2a: Pre-constructed prompts for request types (agent starts with full context from JSON file)
- O2b: Pacts hosted in PACT repo (receiver's agent loads pact + request together)
- O2c: Response schema guidance (agent knows what format the response needs to be in)

---

### O3: Centralize Audit and State (Score: 11/15 -- UPGRADED from 9)

**Evidence**: "The actual queues, requests, audit logs of who's asking for what, etc is all server-side and not fragmented out onto clients"

**Job step**: When I need to trace what happened with a request, or understand the chain of investigations, I need a single source of truth.

**Current behavior**: Information fragmented across Slack threads, Zendesk tickets, local agent sessions.

**Score change rationale**: Git transport makes this SIGNIFICANTLY better. `git log` IS the audit trail. Every request, response, status change, and enrichment is a commit with timestamp and author. This is not a feature to build -- it is a free consequence of the transport choice.

**Scoring (revised)**:
- Importance: 4/5 (needed for accountability, but not blocking daily work)
- Satisfaction with current solution: 2/5 (Slack search + Zendesk partially covers this)
- Frequency: 3/5 (not every request, but critical when needed)
- **Feasibility bonus**: +2 (git provides this for free, zero implementation cost)
- Total: 11/15

**Opportunities within**:
- O3a: Request lifecycle tracking via directory structure (pending -> active -> completed)
- O3b: Full audit log via git history (commits = state transitions)
- O3c: Request chain tracking via cross-references in JSON (parent_request_id field)

---

### O4: Enable Flexible Orchestration Patterns (Score: 8/15)

**Evidence**: "A templated pact between clients could be defined as a back and forth ping-ponging conversation. It could be a 'ring' around the group passing each users' context through until it makes it back to the originator."

**Job step**: Different types of coordination need different flow patterns.

**Current behavior**: All coordination is manual message-passing.

**Scoring**:
- Importance: 4/5 (needed for general-purpose)
- Satisfaction with current solution: 2/5 (manual but works)
- Frequency: 3/5 (most requests are simple ping-pong)
- Total: 8/15

**Opportunities within**:
- O4a: Ping-pong (request + response) as the first and only MVP pattern
- O4b: Chain (multi-step escalation with accumulated context) -- Phase 2
- O4c: Broadcast (cron-triggered team queries) -- Phase 2, Tier 2 brain service
- O4d: Ring (sequential round-robin) -- Phase 2

---

### O5: Build Institutional Memory (Score: 7/15)

**Evidence**: "Every single ticket starts to become indexed and the orchestrator will be able to spot patterns."

**User explicitly deferred**: "Long-term aspiration, focus on the core framework model here."

**Scoring**:
- Importance: 5/5 (transformative if achieved)
- Satisfaction with current solution: 2/5 (tribal knowledge in human heads)
- Frequency: 2/5 (only valuable after history accumulates)
- Total: 7/15

**Opportunities within**:
- O5a: Request/response indexing (Tier 2 brain indexes repo contents)
- O5b: Pattern detection (Tier 3)
- O5c: Automatic context enrichment (Tier 2 brain commits enrichment to repo)
- O5d: Customer/entity profile building (Tier 3)

---

### O6: Distribute Pacts Automatically (Score: 10/15 -- NEW)

**Evidence**: User described pacts as needing to be "versioned & synced with each other as part of 'connecting' as a team on that workspace"

**Job step**: When a new request type is created or a pact is updated, every team member needs the latest version without manual installation.

**Current behavior**: No coordination system exists. In Craft Agents, pacts are manually installed per workspace.

**Why this is new**: The git transport architecture solves this for free. Pacts live in the PACT repo. `git pull` syncs them. This was previously listed as a "Phase 2: pact versioning and sync" problem. With git, it is a Tier 1 freebie.

**Scoring**:
- Importance: 4/5 (essential for multi-person consistency)
- Satisfaction with current solution: 1/5 (no current solution)
- Frequency: 3/5 (every time pacts change, every new team member onboard)
- **Feasibility bonus**: +2 (git provides this for free)
- Total: 10/15

---

## Opportunity Prioritization (Updated)

| Rank | Opportunity | Score | MVP? | Rationale |
|------|-----------|-------|------|-----------|
| 1 | O1: Eliminate manual context assembly | 12 | YES | Highest pain, daily occurrence, core value prop |
| 2 | O2: Agent-native coordination | 11 | YES | This IS the product differentiation |
| 3 | O3: Centralize audit and state | 11 | YES (free) | Git provides this at zero implementation cost |
| 4 | O6: Distribute pacts automatically | 10 | YES (free) | Git provides this at zero implementation cost |
| 5 | O4: Flexible orchestration patterns | 8 | PARTIAL | Ping-pong only for MVP |
| 6 | O5: Institutional memory | 7 | NO | Explicitly deferred; needs Tier 2/3 |

**Key observation**: The git transport architecture UPGRADED two opportunities (O3, O6) from "partial/deferred" to "free at MVP." This is a strong signal that the architecture choice is correct — it solves more problems than we asked it to.

---

## MVP Boundary (Updated for Git Transport)

### In Scope (MVP / Tier 1)

**The Minimal Complete Loop**:
1. **Client A** composes a request via `pact_request` (agent writes JSON, MCP server commits + pushes)
2. **Shared git repo** stores the request as a file in `requests/pending/`
3. **Client B** runs `pact_inbox` (MCP server pulls, scans pending for their requests)
4. **Client B** initiates agent session with context + pact loaded from repo
5. **Client B** responds via `pact_respond` (writes response, moves request to completed, commits + pushes)
6. **Client A** runs `pact_status` (MCP server pulls, reads response)

**What this requires building**:
- Local MCP server (~500 lines) wrapping git operations into 4 tools
- Repository structure conventions (documented as README in the repo)
- One pact pair (sanity-check sender + receiver, hosted in repo)
- Craft Agents source configuration
- Basic envelope validation in MCP server

**What this gets for free from git**:
- Sync, audit trail, authentication, versioning, conflict detection
- Pact distribution (git pull)
- Hosting (GitHub/GitLab private repo)
- Offline-first capability

### Out of Scope (Tier 2+)

- Brain service (LLM enrichment, validation, notifications)
- Complex orchestration patterns (chain, ring, broadcast)
- Institutional memory
- Push notifications
- Multi-client support beyond Craft Agents

---

## Solution Shape: Core Components

### 1. Shared Git Repository (the "server")

The PACT repo IS the server. Its structure IS the protocol.

### 2. Local MCP Server (the "client")

A stdio MCP server running on each machine. 4 tools. Wraps git operations.

### 3. Request Schema

Rigid envelope + flexible context_bundle. Code Mode pattern.

### 4. Pacts (hosted in repo)

Sender + receiver pacts per request type. Synced via git pull.

### 5. Notification

MVP: polling via git pull in `pact_inbox`. Phase 2: brain service sends push notifications.

---

## Risk Assessment (Updated)

### Riskiest Assumptions (Must Test)

| # | Assumption | Why Risky | How to Test |
|---|-----------|-----------|-------------|
| R1 | Pacts produce consistent agent behavior | PACT.md might be too imprecise | 5+ round-trips, measure schema compliance |
| R2 | Agent-composed bundles are better than manual | Agents might miss what matters | A/B compare: structured request vs markdown handoff |
| R3 | Git pull/push cycle is fast enough | >10s latency might feel broken | Measure operation times over 2 weeks |
| R4 | Repo structure conventions are learnable | New users might not understand the protocol | Second user onboarding test |
| R5 | Conflicts are truly rare with append-only design | Concurrent operations might collide | Test with 2 active users over 2 weeks |

### Lower Risk (Monitor)

| # | Assumption | Why Lower Risk |
|---|-----------|----------------|
| R6 | MCP stdio transport works for this | Craft Agents has mature stdio MCP support |
| R7 | GitHub private repo as hosting | Free, reliable, familiar to target users |
| R8 | Git identity as user identity | Target users are developers who already have git configured |
| R9 | Pacts in repo solve distribution | Standard git pull; no novel mechanism |

---

## Phase 2 Gate Evaluation

### G2 Criteria

| Criterion | Target | Actual | Status |
|-----------|--------|--------|--------|
| Opportunities identified | 5+ | 6 (O1-O6) | PASS |
| Top opportunity score | >8 | 12 (O1) | PASS |
| Job step coverage | 80%+ | Core workflow fully covered; 2 free bonuses from git | PASS |
| Team alignment | Confirmed | Single decision-maker; git transport explicitly chosen | PASS |

### G2 Decision: PASS

The git transport architecture strengthened the opportunity map. Two previously deferred capabilities (audit trail, pact distribution) moved to "free at MVP." The solution shape is simpler, the build is smaller, and the protocol is more elegant.

---

## Post-MVP Re-Discovery: Opportunity Reassessment (2026-02-21)

### Original Opportunities — Post-Build Status

| Rank | Opportunity | Pre-Build Score | Post-Build Status | Notes |
|------|-----------|-----------------|-------------------|-------|
| 1 | O1: Eliminate manual context assembly | 12/15 | INFRASTRUCTURE DELIVERED, VALUE UNTESTED | The protocol supports rich context bundles. Real usage has been minimal context only. The tech support handoff scenario (the primary validation) has not been exercised. |
| 2 | O2: Agent-native coordination | 11/15 | VALIDATED | Agents compose and consume requests natively. No copy-paste between tools. |
| 3 | O3: Centralize audit and state | 11/15 | VALIDATED (FREE) | git log provides full audit trail. Directory lifecycle works as designed. |
| 4 | O6: Distribute pacts automatically | 10/15 | VALIDATED (FREE) | pact-init.sh seeds pacts from examples/. git pull syncs. |
| 5 | O4: Flexible orchestration patterns | 8/15 | PARTIALLY ADDRESSED | Ping-pong works. thread_id enables multi-round. Chain/ring/broadcast not implemented. |
| 6 | O5: Institutional memory | 7/15 | DEFERRED (as planned) | No Tier 2/3 work done. |

### New Opportunities Identified Post-MVP

#### O7: Multi-Round Collaborative Workflows (Score: 13/15 -- NEW, HIGH)

**Evidence**: The design-pact contract proves that thread_id enables iterative, multi-round collaboration through the PACT protocol. This is a new interaction pattern that was not explicitly designed in the original discovery -- it emerged from the implementation.

**Job step**: When two people need to iterate on something (a design, a decision, a document), they need each round to build on the previous one with shared context.

**Current behavior**: thread_id exists but is a raw primitive. No thread listing, no thread history, no thread state tracking.

**Scoring**:
- Importance: 5/5 (the design-pact contract is the most sophisticated use case yet)
- Satisfaction with current solution: 2/5 (thread_id exists but no tooling around it)
- Frequency: 4/5 (any non-trivial collaboration is iterative)
- **Implementation readiness bonus**: +2 (thread_id primitive already in the schema)
- Total: 13/15

**Opportunities within**:
- O7a: pact_thread tool -- list all requests sharing a thread_id, ordered chronologically
- O7b: Thread context accumulation -- each round can reference/include prior round responses
- O7c: Thread status tracking -- is a thread open, converging, or resolved?
- O7d: Thread-aware inbox -- group inbox entries by thread instead of flat list

---

#### O8: Richer Context Through Attachments (Score: 10/15 -- NEW)

**Evidence**: The attachments feature enables context bundles that go beyond JSON fields. Logs, config files, screenshots, diffs -- the kind of material that makes a tech support handoff actually useful.

**Job step**: When handing off an investigation, the receiver needs not just a summary but the actual artifacts (log snippets, config files, error screenshots).

**Current behavior**: Attachments schema exists. Files store in attachments/{request_id}/. But no tooling for reading attachments on the receiving end, and no integration with the pact for specifying expected attachment types.

**Scoring**:
- Importance: 4/5 (critical for the tech support use case specifically)
- Satisfaction with current solution: 2/5 (files are committed but not surfaced to the receiving agent)
- Frequency: 3/5 (not every request needs attachments, but the high-value ones do)
- **Implementation readiness bonus**: +1 (schema exists, storage works, but consumer side is thin)
- Total: 10/15

**Opportunities within**:
- O8a: Attachment content surfacing in inbox -- receiver's agent gets attachment paths/content
- O8b: Pact-defined attachment expectations -- PACT.md specifies what attachments are expected
- O8c: Attachment size/type validation -- prevent binary blobs in git
- O8d: Inline vs file attachments -- small text content inline in JSON vs large files on disk

---

#### O9: Request Lifecycle Management (Score: 9/15 -- NEW)

**Evidence**: During real usage, there is no way to cancel, edit, or retract a request. If you send something to the wrong person or forget critical context, the only option is manual git operations.

**Job step**: After sending a request, I sometimes realize I made an error and need to fix it before the recipient acts on it.

**Current behavior**: Requests are write-once. No cancel, no edit, no amend.

**Scoring**:
- Importance: 3/5 (errors happen but are not catastrophic in a small team)
- Satisfaction with current solution: 1/5 (manual git rm is not a real solution)
- Frequency: 3/5 (estimated -- depends on request volume)
- **Risk if unaddressed**: +2 (sending to wrong person with sensitive context is a real concern)
- Total: 9/15

**Opportunities within**:
- O9a: pact_cancel tool -- move a pending request to a cancelled/ directory
- O9b: pact_amend tool -- append additional context to a pending request
- O9c: Request retraction notification -- recipient sees that a request was cancelled
- O9d: Draft state -- compose locally before committing/pushing

---

#### O10: Notification and Awareness (Score: 8/15 -- NEW)

**Evidence**: The inbox is poll-only. The agent must explicitly call pact_inbox to discover new requests. In real usage, this means requests can sit unnoticed until someone thinks to check.

**Job step**: When a teammate sends me a request, I need to know about it without manually polling.

**Current behavior**: pact_inbox pulls on every call, but nothing triggers the call. No push notifications.

**Scoring**:
- Importance: 4/5 (discovery latency reduces the value of async coordination)
- Satisfaction with current solution: 2/5 (polling works, but is not proactive)
- Frequency: 5/5 (every incoming request needs discovery)
- Deduction: -3 (this is the Tier 2 brain service domain -- significant architecture work)
- Total: 8/15

**Opportunities within**:
- O10a: Polling automation -- agent auto-checks inbox at session start (client-side, no server)
- O10b: Git hook notifications -- post-receive hook triggers a local notification
- O10c: GitHub Actions webhook -- on push, send Slack/email notification
- O10d: Inbox count in status bar (requires client integration)

---

#### O11: Request Discovery and Search (Score: 7/15 -- NEW)

**Evidence**: With thread_id and growing request history, finding past requests becomes important. Currently the only option is manually browsing completed/ directory or using git log.

**Job step**: When I need to reference a past investigation or find related requests, I need to search across history.

**Current behavior**: No search capability. git log grep is the only option.

**Scoring**:
- Importance: 3/5 (not critical with low volume, increasingly important at scale)
- Satisfaction with current solution: 2/5 (git log works for developers)
- Frequency: 2/5 (infrequent at current volume)
- Total: 7/15

**Opportunities within**:
- O11a: pact_search tool -- search requests by type, sender, date range, keyword
- O11b: Thread listing -- find all threads, see thread status and participant list
- O11c: History summary -- "what happened this week" digest
- O11d: Related request linking -- manual cross-references between requests

---

### Updated Opportunity Prioritization (Phase 2)

| Rank | Opportunity | Score | Phase 2? | Rationale |
|------|-----------|-------|----------|-----------|
| 1 | O7: Multi-round collaborative workflows | 13 | YES | thread_id primitive exists. Highest emergent value. Design-pact proves the pattern. |
| 2 | O1: Rich context bundles (ORIGINAL -- untested) | 12 | YES | Core value prop still unvalidated with real tech support workflow. Must test. |
| 3 | O8: Richer context through attachments | 10 | YES | Consumer-side tooling needed to complete the feature. |
| 4 | O9: Request lifecycle management | 9 | YES | Cancel and amend are basic operational needs. |
| 5 | O4: Flexible orchestration patterns | 8 | PARTIAL | Chain pattern via thread_id. Broadcast/ring are Tier 2. |
| 6 | O10: Notification and awareness | 8 | PARTIAL | Client-side polling automation (O10a) is low-cost. Push notifications are Tier 2. |
| 7 | O11: Request discovery and search | 7 | DEFER | Low volume does not yet demand this. Revisit when request count grows. |
| 8 | O5: Institutional memory | 7 | DEFER | Still Tier 3. Explicitly deferred. |

### Phase 2 MVP Boundary

**In scope**: O7 (thread tooling), O1 validation (real tech support usage), O8 (attachment consumer), O9 (cancel/amend), O10a (auto-poll)

**Out of scope**: O5 (institutional memory), O10b-d (push notifications), O11 (search), advanced orchestration patterns
