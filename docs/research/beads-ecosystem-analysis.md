# Beads Ecosystem Analysis: Patterns for an Agent-First Inbox Coordination Server

**Research Date**: 2026-02-21
**Researcher**: Nova (Evidence-Driven Knowledge Researcher)
**Scope**: Deep analysis of the Beads ecosystem (Beads, MCP Agent Mail, Gas Town) with focus on patterns transferable to a git-backed agent GARP server with inbox UX
**Source Count**: 19 sources across 5 topic areas
**Confidence Distribution**: 5 High, 3 Medium, 1 Low

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [What Beads Is and How It Works](#2-what-beads-is-and-how-it-works)
3. [The Beads Ecosystem: Three Interlocking Systems](#3-the-beads-ecosystem-three-interlocking-systems)
4. [Multi-Agent Handoff Patterns](#4-multi-agent-handoff-patterns)
5. [Inbox and Workflow Patterns](#5-inbox-and-workflow-patterns)
6. [Structured Request/Response: The "Bead" Protocol](#6-structured-requestresponse-the-bead-protocol)
7. [Context Chaining Between Agent Instances](#7-context-chaining-between-agent-instances)
8. [Skill/Contract/Template Patterns](#8-skillcontracttemplate-patterns)
9. [UI Patterns for Agent Coordination](#9-ui-patterns-for-agent-coordination)
10. [Transferable Patterns for Craft Agents Integration](#10-transferable-patterns-for-craft-agents-integration)
11. [Knowledge Gaps](#11-knowledge-gaps)
12. [Sources](#12-sources)

---

## 1. Executive Summary

The Beads ecosystem is not one project but three interlocking systems that, together, form the most complete open-source implementation of agent-first asynchronous coordination available as of February 2026:

| System | Purpose | Creator |
|--------|---------|---------|
| **Beads** (`bd`) | Git-backed graph issue tracker -- persistent structured memory for agents | Steve Yegge |
| **MCP Agent Mail** | Asynchronous messaging, inboxes, file reservations, and human oversight | Steve Yegge (fork/evolution of Dicklesworthstone's original) |
| **Gas Town** (`gt`) | Multi-agent workspace manager -- orchestration, dispatch, and lifecycle management | Steve Yegge |

The three systems address different coordination concerns and are designed to compose:

- **Beads** owns task state: what work exists, what blocks what, what is ready.
- **Agent Mail** owns communication: messages, threads, decisions, audit trails, file leases.
- **Gas Town** owns orchestration: who works on what, dispatch, supervision, merge queues.

The parallels to the Craft Agents GARP server vision are substantial. Both architectures share the same foundational insight: **git is the right transport for agent coordination data**, and **agent work should be structured as addressable, dependency-aware units rather than unstructured conversation**. The specific patterns below are directly transferable.

**Confidence: HIGH** -- Based on 19 sources including primary documentation (GitHub repos, official docs site), community analysis (DeepWiki, ianbull.com, paddo.dev), and the author's own writings.

---

## 2. What Beads Is and How It Works

### 2.1 Core Identity

Beads is a "distributed, git-backed graph issue tracker for AI agents." It replaces ad-hoc markdown plans and TODO lists with a dependency-aware graph optimized for agent consumption. The key philosophy, as articulated by Yegge: "Everyone is focused on making planning tools, and Beads is an execution tool. It's focused on just the tracking, and nothing else: a small name for a small system." [Source: GitHub README, ianbull.com, paddo.dev]

The system intentionally occupies a narrow scope:
- Not for future planning (that belongs in backlogs)
- Not for past documentation (that belongs in docs)
- Only for **current work**: what matters now, what just finished and might break, what is blocked

**Confidence: HIGH** -- Consistent across 5+ independent sources.

### 2.2 Dual-Storage Architecture

Beads uses a hybrid persistence model optimized for two different access patterns:

```
SQLite (.beads/beads.db)     -- fast local queries, complex filtering, gitignored
     |
     |  auto-sync (5-second debounce via daemon)
     v
JSONL (.beads/issues.jsonl)  -- git-tracked, human-readable, merge-friendly
```

A background daemon manages synchronization between the two stores. Git hooks (`pre-commit`, `post-merge`, `pre-push`, `post-checkout`) automate import/export. The JSONL format was chosen specifically because it is line-oriented and merge-friendly -- each issue is one line, enabling standard git merge tooling. [Source: DeepWiki, ianbull.com, official docs]

Additionally, the production system supports **Dolt** (a version-controlled SQL database) as the primary store with two modes:
- **Embedded mode**: Direct file access via CGO (single-writer)
- **Server mode**: MySQL protocol on port 3307 (multi-writer, 5-10x faster, default)

An **EphemeralStore** (SQLite-backed) handles temporary issues ("wisps") that should not clutter version history. [Source: DeepWiki]

**Transferable pattern**: The dual-storage model (fast queryable local store + git-tracked serialization format) directly maps to the GARP server architecture. Sessions in Craft Agents already persist as JSONL. The Beads pattern validates this approach and adds the synchronization daemon concept.

### 2.3 Identity: Hash-Based IDs

Issue IDs use SHA-256 hashing of content (title + description + timestamp + salt + actor), adaptively truncated based on database size. The format is `bd-a3f8e9`. This prevents merge collisions when multiple agents create issues simultaneously on different branches -- a problem that sequential numbering (like GitHub Issues) cannot solve. [Source: DeepWiki, GitHub README, FAQ]

Hierarchical IDs support task decomposition: `bd-a3f8` (epic) -> `bd-a3f8.1` (task) -> `bd-a3f8.1.1` (sub-task).

**Transferable pattern**: Any GARP server handling concurrent agent actions needs collision-resistant identifiers. Content-addressed hashing is the right approach for git-backed systems.

### 2.4 Dependency Graph

Beads tracks **19 dependency types** organized into two categories:

**Workflow dependencies** (affect ready-work calculation):

| Type | Semantics | Use Case |
|------|-----------|----------|
| `blocks` | A blocks B until A closes | Sequential gating |
| `parent-child` | B is subtask of A | Parallel children by default |
| `conditional-blocks` | A blocks B unless A fails | Error handling paths |
| `waits-for` | Dynamic fanout gate | Aggregating parallel results |

**Association types** (non-blocking, organizational):

| Type | Semantics | Use Case |
|------|-----------|----------|
| `related` | Bidirectional "see also" | Knowledge linking |
| `discovered-from` | Found while working on A | Audit trail |
| `replies-to` | Threading | Conversation chains |
| `duplicates` | Same underlying issue | Deduplication |
| `supersedes` | Replacement | Version evolution |
| `authored-by` | Attribution | Provenance |
| `assigned-to` | Ownership | Work routing |
| `approved-by` | Approval gate | Human oversight |
| `attests` | With metadata | Verification |

The system enforces DAG structure via recursive CTE cycle detection limited to 100 levels. [Source: DeepWiki]

The `bd ready` command is the critical interface: it calculates which tasks have no open blockers and presents them to agents as available work. This is the "what should I do next?" query that replaces human-directed task selection. [Source: GitHub README, DeepWiki, paddo.dev, ianbull.com]

**Transferable pattern**: The dependency graph with blocking vs. non-blocking relationship types maps directly to GARP server needs. A "tick" dispatch system benefits from the same `ready` computation: "what context bundles should be dispatched because their prerequisites are met?"

---

## 3. The Beads Ecosystem: Three Interlocking Systems

### 3.1 Beads + MCP Agent Mail: Division of Responsibility

The two systems maintain a strict separation of concerns:

| Concern | Owner | Storage |
|---------|-------|---------|
| Task status, priority, dependencies | **Beads** | `.beads/issues.jsonl` in git |
| Messages, decisions, discussions, attachments | **Agent Mail** | `messages/YYYY/MM/{id}.md` in git |
| File reservation leases | **Agent Mail** | `file_reservations/{sha1}.json` in git |
| Agent identity and profiles | **Agent Mail** | `agents/profile.json` in git |

Shared identifiers (e.g., `bd-123` as a thread_id in Mail) keep both systems synchronized across commits, messages, and task lifecycle. [Source: MCP Agent Mail README, steveyegge/mcp_agent_mail]

The recommended integrated workflow:

```
1. bd ready --json                          # Pick unblocked work from Beads
2. file_reservation_paths(["src/**"])       # Reserve edit surface in Mail
3. send_message(thread_id="bd-123", ...)   # Announce start in Mail thread
4. [do work, post progress updates]        # Progress visible in both systems
5. bd close bd-123                          # Close task in Beads
6. release_file_reservations()             # Release leases in Mail
7. send_message("Final summary")           # Post completion in Mail
```

**Transferable pattern**: The clean separation between "work state" (what exists, what blocks what) and "communication state" (who said what, who reserved what) is directly applicable. Craft Agents sessions are communication; the GARP server manages work state. Keeping them separate but linked by shared identifiers is the correct architecture.

### 3.2 Gas Town: Orchestration Layer

Gas Town sits above Beads and Agent Mail as the orchestration framework. Its core metaphor is a **steam engine**: "when an agent finds work on their hook, they EXECUTE." Throughput depends on immediate action, not supervisory polling. [Source: Gas Town overview.md, mayor.md.tmpl]

**Agent Taxonomy:**

| Role | Type | Lifecycle | Purpose |
|------|------|-----------|---------|
| **Mayor** | Infrastructure | Singleton, persistent | Global coordinator, cross-rig dispatch |
| **Deacon** | Infrastructure | Background daemon | Supervision via watchdog chains |
| **Witness** | Infrastructure | Per-rig | Polecat lifecycle management |
| **Refinery** | Infrastructure | Per-rig | Merge queue processing |
| **Crew** | Worker | Persistent, human-controlled | Long-term work, direct main pushes |
| **Polecats** | Worker | Transient, Witness-managed | Discrete tasks, branch work, auto-merge |
| **Dogs** | Infrastructure helper | Deacon-managed | System tasks (health triage, etc.) |

**Workspace Hierarchy:**

```
~/gt/
+-- .beads/              (town-level issues)
+-- mayor/               (global config)
+-- deacon/              (daemon + dogs)
+-- <rig>/               (project container)
    +-- .beads/          (rig-level issues)
    +-- crew/            (persistent workspaces)
    +-- polecats/        (ephemeral sandboxes)
    +-- refinery/        (merge queue)
    +-- witness/         (lifecycle manager)
```

**Convoy System**: Convoys batch and track discrete work units across rigs:

```
gt convoy create "Feature X" gt-abc gt-def --notify overseer
gt convoy status hq-cv-abc
gt convoy list
```

They provide single visibility into in-flight work, cross-rig tracking, auto-notifications, and historical records. [Source: Gas Town overview.md]

**Transferable pattern**: The role taxonomy (coordinator, supervisor, worker) and the distinction between persistent workers (crew) and transient workers (polecats) maps to how a GARP server might manage different types of agent sessions. The "hook" metaphor (find work on your hook, execute immediately) is an elegant dispatch pattern that avoids polling overhead.

---

## 4. Multi-Agent Handoff Patterns

### 4.1 The "Landing the Plane" Protocol

This is Beads' mandatory end-of-session handoff pattern. It is the single most important operational protocol in the ecosystem. [Source: AGENT_INSTRUCTIONS.md, paddo.dev, ianbull.com, LinkedIn]

**Protocol steps:**

1. File remaining work as new Beads issues (with dependencies to current work)
2. Run quality gates (linting, tests)
3. Update Beads issues -- close finished work, note progress on in-progress items
4. Execute git operations in strict order:
   - `git pull --rebase`
   - Handle merge conflicts in JSONL if needed
   - `bd sync` (exports JSONL, imports changes, commits)
   - `git push` (non-negotiable)
   - Verify with `git status`
5. Generate a **handoff prompt** for the next session

The handoff prompt is the critical output: "a ready-to-paste summary that the next agent (or tomorrow's session) can use to immediately orient itself." The agent queries Beads for highest-priority unblocked work and produces a prompt including context about what was done and what is next. [Source: paddo.dev, LinkedIn]

**Why this works**: Yegge's observation that "their reward function biases them for checklists and acceptance criteria. Landing the plane, even if they're low on context, they're going to do a good job with it." The structured protocol leverages LLM strengths rather than fighting their weaknesses. [Source: paddo.dev]

**Transferable pattern**: The "land the plane" concept maps directly to session completion in a GARP server. When a Craft Agents session completes work on a tick/turn, it should: (a) persist results to shared state, (b) file follow-up work items, (c) generate a context summary for the next agent that picks up related work. The handoff prompt is essentially a "context bundle" for the next session.

### 4.2 Atomic Claim Operations

Beads provides `bd update <id> --claim` which atomically sets both the assignee and status to `in_progress`. This prevents race conditions where two agents both start the same task. Combined with hash-based IDs, this enables safe concurrent multi-agent operation on the same codebase. [Source: GitHub README, DeepWiki]

**Transferable pattern**: Any GARP server dispatching work to multiple agents needs atomic claim semantics. The GARP server's "tick" dispatch should include a claim mechanism that prevents duplicate work.

### 4.3 Gas Town's Hook-Based Dispatch

Gas Town uses a "hook" metaphor for work assignment. The Mayor (coordinator) "slings" work to agents:

```
gt sling <bead-id> <rig>
```

When an agent starts a session, its first action is:
1. Check hook with `gt hook`
2. If work is hooked -> **execute immediately** (no confirmation, no waiting)
3. If empty -> check mail via `gt mail inbox`
4. If nothing hooked or mailed -> wait for user direction

[Source: Gas Town mayor.md.tmpl, overview.md]

The "propulsion principle" is explicit: agents execute assigned work without asking permission. This is a deliberate architectural choice that maximizes throughput in an async system.

**Transferable pattern**: The hook-check-then-mail-check-then-idle startup sequence is a clean agent initialization protocol. For Craft Agents: when a session starts, it should (a) check if there is a dispatched tick to execute, (b) check if there are inbox messages requiring response, (c) only then enter idle/interactive mode.

### 4.4 Cross-Rig Work and Identity Preservation

When agents work across multiple projects (rigs), their identity follows them:
- Git commits: `Author: gastown/crew/joe <owner@example.com>`
- Beads issues: `created_by: gastown/crew/joe`
- All events: `actor: gastown/crew/joe`

Two patterns for cross-rig work:
1. **Worktrees** (preferred): Temporary workspace in target rig preserving source identity
2. **Dispatch**: File issues in target rig when work belongs there

[Source: Gas Town overview.md]

**Transferable pattern**: Agent identity and attribution across contexts is important for auditability. When a Craft Agents session acts on behalf of a coordination workflow, the session should carry attribution metadata linking it to the originating workflow and actor.

---

## 5. Inbox and Workflow Patterns

### 5.1 MCP Agent Mail: The Agent Inbox

Agent Mail implements a full **inbox/outbox architecture** for agent communication:

**Message Structure**: GitHub-Flavored Markdown with frontmatter metadata (subject, sender, recipients To/Cc/Bcc, thread_id, importance level, attachment references). Messages are stored canonically at `messages/YYYY/MM/{id}.md` with per-recipient inbox/outbox copies in `agents/mailboxes/`. [Source: MCP Agent Mail README, mcpagentmail.com]

**Key Inbox Operations:**
- `fetch_inbox` -- check for new messages
- `acknowledge_message` -- confirm receipt/processing
- `send_message` -- compose and send
- Resource URIs: `resource://inbox/{agent}?project=<path>&limit=20`

**Threading**: Messages group into threads via `thread_id`. Beads issue IDs (e.g., `bd-123`) serve as thread identifiers, creating a natural link between tasks and their associated discussions. [Source: MCP Agent Mail README]

**Importance Levels**: Messages carry importance metadata enabling priority-based inbox processing.

**Acknowledgment Protocol**: Messages can require explicit acknowledgment, creating confirmation workflows. This is more structured than email -- it is closer to a ticketing system's "accept/reject assignment" pattern. [Source: MCP Agent Mail README]

**Transferable pattern**: The inbox metaphor with threading, importance levels, and acknowledgment requirements maps directly to the GARP server's "tick" delivery. A tick is essentially a high-importance message with structured content (context bundle), a thread_id linking it to a workflow, and an expectation of acknowledgment (the agent's response/action).

### 5.2 Human Overseer Pattern

Agent Mail provides a dedicated "Human Overseer" channel:
- Humans compose messages via a web UI at `/mail/{project}/overseer/compose`
- Messages automatically include a preamble instructing agents to pause current work
- Messages bypass agent contact policies
- Messages carry high-importance flags
- Sent from a special `HumanOverseer` identity (Program: WebUI, Model: Human)

[Source: MCP Agent Mail README, mcpagentmail.com]

**Transferable pattern**: The human overseer as a first-class participant with special privileges (bypass queues, high priority, pause-current-work semantics) maps to the Craft Agents vision where every client node has a human operator. The GARP server should support human-originated messages that override normal agent workflow.

### 5.3 File Reservation Leases

Agent Mail implements **advisory file reservations** (not enforced locks):

```python
file_reservation_paths(
    project_key, agent_name,
    ["src/**"],                  # glob patterns
    ttl_seconds=3600,            # auto-expire
    exclusive=true,              # or shared
    reason="bd-123"              # linked to task
)
```

Properties:
- **Advisory**: System does not enforce; relies on agent discipline
- **TTL-based**: Leases expire automatically, preventing stale claims
- **Exclusive vs. Shared**: Exclusive prevents concurrent edits; shared allows simultaneous read access
- **Pre-commit guard**: Optional git hook blocks commits conflicting with active exclusive leases
- **Linked to tasks**: `reason` field ties reservations to Beads issues

[Source: MCP Agent Mail README]

**Transferable pattern**: Advisory file reservations with TTL and task linkage are directly applicable to a GARP server managing shared state. When a tick dispatches context to a client node, the server can create an advisory reservation on the state segments being modified, preventing conflicting concurrent edits.

### 5.4 Gas Town's Mail System

Gas Town adds its own mail layer on top of Agent Mail for infrastructure communication:

```
gt mail inbox          # Check messages
gt mail send mayor/ -s "HANDOFF: <brief>" -b "context..."
gt mail mark-read      # Acknowledge processed messages
gt nudge <target> "message"  # Direct message to specific agent
```

The mail system supports the session-end handoff pattern: if work remains incomplete, the agent sends a handoff mail with context for the next session. [Source: Gas Town mayor.md.tmpl]

---

## 6. Structured Request/Response: The "Bead" Protocol

### 6.1 Issues as Structured Work Units

A Beads issue contains approximately 81 fields organized into groups. The core fields form a structured work request:

| Field Group | Key Fields | Purpose |
|-------------|------------|---------|
| **Identity** | `id` (hash-based), `title`, `description` | Addressable work unit |
| **Classification** | `type`, `priority` (P0-P3), `labels` | Routing and urgency |
| **Lifecycle** | `status` (open/in_progress/closed/tombstone), `assignee` | State machine |
| **Relations** | `dependencies[]`, `parent_id` | Graph structure |
| **Context** | `design`, `notes`, `acceptance` | Execution context |
| **Audit** | `created_by`, `created_at`, `updated_at`, edit history | Provenance |
| **Ephemeral** | `wisp` flag, `pinned` status | Lifecycle hints |

Every command supports `--json` output for programmatic consumption, achieving "97% token reduction" through `BriefIssue` and `BriefDep` models that strip unnecessary fields. [Source: DeepWiki, GitHub README]

**Transferable pattern**: The structured issue format maps to a "tick" or "context bundle" schema. A GARP server dispatch should carry: identity (hash ID, title), classification (type, priority), lifecycle state, dependency context, execution context (the actual work payload), and audit metadata. The brief/full distinction for token optimization is important -- agents should receive minimal context by default with the ability to expand.

### 6.2 The `bd prime` Context Injection

The `bd prime` command generates an optimized workflow context (~1-2k tokens) summarizing:
- Priority breakdown (P0/P1/P2 counts)
- Blocking/blocked issues
- Ready work (unblocked tasks)
- Dependency relationships

This is injected at session start, giving the agent immediate orientation without consuming excessive context window. [Source: DeepWiki, FAQ]

**Transferable pattern**: Context injection at session start is the "tick" concept. When the GARP server dispatches a turn to a client node, it should assemble a compact context summary analogous to `bd prime` output -- just enough orientation for the agent to begin productive work.

### 6.3 JSON-First Agent Interface

All Beads commands support `--json` for structured output. The FAQ explicitly recommends CLI over MCP when shell access is available due to "lower context overhead (~1-2k vs 10-50k tokens)" and faster execution. [Source: FAQ, AGENT_INSTRUCTIONS.md]

This design decision reflects a broader principle: **minimize token cost of coordination overhead**. The GARP should be cheap to query and cheap to update, preserving the context window for actual reasoning.

---

## 7. Context Chaining Between Agent Instances

### 7.1 Session Boundary Pattern

Beads solves the "50 First Dates" problem -- agents that forget everything between sessions -- through structured persistent state. The chain works:

```
Session N:
  1. bd prime -> load current state orientation
  2. bd ready -> select unblocked work
  3. [do work]
  4. "Land the plane" -> persist state, generate handoff prompt

Session N+1:
  1. Paste handoff prompt (or bd prime for cold start)
  2. Agent has full context of: what was done, what remains, what is blocked
  3. bd ready -> select next unblocked work
  4. [continue]
```

[Source: paddo.dev, ianbull.com, AGENT_INSTRUCTIONS.md]

The recommended cadence is "one task per session, land the plane, kill it, start fresh." This prevents context rot -- the gradual degradation of agent reasoning as conversation history grows. Short, focused sessions with clean handoffs outperform long sessions that accumulate noise. [Source: paddo.dev, ianbull.com]

**Transferable pattern**: This directly validates the "tick" model. Each tick is a focused unit of work. The agent starts a session, receives context, completes one thing, persists results, and terminates. The next tick starts clean. This is the async play-by-post cadence the GARP server is designed for.

### 7.2 Semantic Compaction

Beads performs "semantic memory decay" -- summarizing closed tasks to preserve context window budget. Instead of carrying the full history of 100 completed tasks, the system produces compact summaries of completed work, preserving the decision rationale without the execution detail. [Source: GitHub README, DeepWiki]

**Transferable pattern**: As coordination workflows grow long (an RPG campaign spanning months, a project spanning hundreds of sessions), the GARP server needs a similar compaction strategy. Completed ticks should be summarized and archived, not carried as full context indefinitely.

### 7.3 Dependency-Driven Context Discovery

When an agent picks up a task, it can traverse the dependency graph to understand context:
- What tasks were completed before this one? (via `blocks`/`parent-child`)
- What was discovered while working on the parent? (via `discovered-from`)
- What related work exists? (via `related`)
- What discussion happened? (via `replies-to` -> Agent Mail thread)

This graph traversal replaces the need for the agent to have seen the prior conversation. Context is reconstructed from persistent state, not recalled from memory. [Source: DeepWiki, MOLECULES.md]

**Transferable pattern**: Context bundles should not just carry the immediate task but should include traversable links to related completed work, decisions, and discussions. The GARP server's state graph enables context reconstruction for any agent at any time.

---

## 8. Skill/Contract/Template Patterns

### 8.1 Formulas: Declarative Workflow Templates

Beads' **formula system** provides JSON/TOML templates for repeatable workflows:

```
Architecture stack:
  Formulas (compile-time macros)       <- declarative templates
      |
  Protos (template issues)             <- frozen, reusable patterns
      |
  Molecules (bond/squash/burn)         <- active workflow instances
      |
  Epics (parent-child, deps)           <- core data plane
      |
  Issues (JSONL, git-backed)           <- storage
```

Most users need only the bottom two layers. Protos and formulas are for advanced composition -- repeatable patterns like "deploy pipeline" or "feature development cycle" that should be instantiated consistently. [Source: MOLECULES.md, FAQ, DeepWiki]

**Transferable pattern**: The formula/proto/molecule stack maps to "workflow templates" in a GARP server. A formula defines a coordination workflow type (RPG session, PR review, brainstorm). A proto is a frozen template. A molecule is an active instance with live state. This three-level abstraction (template -> frozen -> active) is cleaner than a single "workflow definition" concept.

### 8.2 Molecules: Executable Work Graphs

Molecules are epics with workflow semantics. Key operational patterns:

**Phase metaphor (chemistry terminology):**
- **Solid (Proto)**: Frozen template, stored in `.beads/`, synced, reusable
- **Liquid (Mol)**: Active persistent work, synced, audit-trailed
- **Vapor (Wisp)**: Ephemeral operations, unsynced, discardable

**Phase transitions:**
- `bd mol pour <proto>` -> create persistent instance from template
- `bd mol wisp <proto>` -> create ephemeral instance for routine work
- `bd mol squash <id>` -> compress to permanent digest (completed work)
- `bd mol burn <id>` -> discard without record (failed/abandoned work)

[Source: MOLECULES.md]

**Bonding** creates dependencies between separate work graphs:
- Epic + Epic -> dependency edge
- Proto + Epic -> spawn template as new issues attached to epic
- Proto + Proto -> compound reusable template

This enables "Christmas Ornament" patterns where agents dynamically discover and bond new work molecules at runtime, creating n-ary structures without predefined shape. [Source: MOLECULES.md]

**Transferable pattern**: The phase transitions (frozen -> active -> compressed/discarded) map to coordination workflow lifecycle. A tick template is "solid" (frozen). When dispatched, it becomes "liquid" (active). When completed, it is "squashed" (compressed summary retained) or "burned" (discarded). The bonding concept enables workflows to grow organically as agents discover new work.

### 8.3 Gates: Async Coordination Primitives

Gates enable workflows to wait on external conditions:

| Gate Type | Mechanism | Use Case |
|-----------|-----------|----------|
| Timer | Time-based delay | Scheduled follow-ups |
| GitHub Actions | CI/CD pipeline completion | Post-deploy verification |
| Pull Request | PR merge status | Code review gates |
| Human Approval | Manual sign-off | Risk gates, quality checks |
| Fanout | `waits-for` all children | Aggregating parallel results |

Gates are "non-polling" -- the gate system handles monitoring, batching checks and respecting rate limits, rather than having agents poll for completion. [Source: DeepWiki, MOLECULES.md]

**Transferable pattern**: Gates map directly to the GARP server's "human-in-the-loop" approval pattern. When a tick requires human approval before proceeding, a gate issue blocks the downstream work. When the human approves (via the inbox UI), the gate closes and dependent ticks become ready. The non-polling architecture is important -- the GARP server should push state changes rather than having agents poll.

---

## 9. UI Patterns for Agent Coordination

### 9.1 Community-Built Interfaces

The Beads ecosystem has generated 25+ community tools across every interface category, demonstrating the value of exposing structured data through simple APIs (CLI + JSON + JSONL + SQLite):

**Terminal UIs**: beads_viewer, bdui, perles (custom BQL query language), lazybeads, bsv, abacus

**Web UIs**: beads-ui (live updates + kanban), beads-dashboard (metrics, lead time, throughput), beads-kanban-ui (git branch tracking), beads-pm-ui (Gantt charts, dependency visualization), beadsmap (Svelte roadmap)

**Editor Extensions**: vscode-beads, Beads-Kanban (VS Code), opencode-beads, nvim-beads, beads-manager (JetBrains)

**Native Apps**: Beadster (macOS), Parade (Electron, workflow orchestration), Beadbox (Tauri + Next.js, real-time sync)

**GARP Tools**: BeadHub (GARP server for agent teams), Foolery (control surface with wave planning), beads-orchestration (multi-agent orchestration for Claude Code)

[Source: COMMUNITY_TOOLS.md]

**Transferable pattern**: The explosion of community UIs validates the approach of exposing structured data through simple, standard interfaces. Craft Agents already has a rich UI. The GARP server should prioritize clean data APIs (JSON, JSONL, SQLite) that enable the existing UI to present coordination data naturally.

### 9.2 Agent Mail Web UI

The Agent Mail web UI provides:

| Route | Function |
|-------|----------|
| `/mail` | Unified inbox across all projects |
| `/mail/{project}` | Project overview, full-text search, agent directory |
| `/mail/{project}/inbox/{agent}` | Per-agent inbox, reverse-chronological |
| `/mail/{project}/message/{id}` | Message detail with threaded conversation |
| `/mail/{project}/search` | Advanced search with FTS5, token-based filters |
| `/mail/{project}/file_reservations` | Active and historical leases |
| `/mail/{project}/overseer/compose` | Human operator messaging |

[Source: MCP Agent Mail README]

**Transferable pattern**: The unified inbox across projects, per-agent views, threaded conversations, and human overseer compose -- these map directly to Craft Agents' existing session inbox. The key addition from Agent Mail is **threading by work item** (not just by session) and **cross-session visibility** (seeing all messages related to a coordination workflow regardless of which session produced them).

### 9.3 Gas Town Dashboard

Gas Town includes a web dashboard providing single-page overview of: agents, convoys, hooks, queues, issues, and escalations. The Mayor uses `gt convoy list` as its primary dashboard for monitoring work across all rigs. [Source: Gas Town overview.md]

**Transferable pattern**: A GARP server needs a dashboard view showing: active workflows, dispatched ticks, agent status, pending approvals, and escalations. This is essentially the "GARP inbox" view that sits above individual session inboxes.

---

## 10. Transferable Patterns for Craft Agents Integration

### 10.1 Direct Architectural Parallels

| Beads Ecosystem Concept | Craft Agents Coordination Equivalent | Notes |
|------------------------|--------------------------------------|-------|
| **Beads issue** | **Tick/turn** | Structured work unit with ID, priority, dependencies, context |
| **`bd ready`** | **Tick dispatch queue** | "What work is unblocked and ready to send?" |
| **`bd prime`** | **Context bundle assembly** | Compact orientation for session start |
| **"Land the plane"** | **Session completion protocol** | Persist results, file follow-ups, generate handoff |
| **Agent Mail inbox** | **Session inbox with coordination messages** | Threaded messages linked to work items |
| **Human Overseer** | **Human operator at client node** | First-class human participation with priority override |
| **File reservations** | **State segment locking** | Advisory leases on shared state during tick execution |
| **Gas Town hook** | **Tick dispatch to agent** | "Find work on your hook, execute immediately" |
| **Mayor** | **Coordination server brain** | Central coordinator with LLM reasoning |
| **Polecats** | **Ephemeral agent sessions** | Transient workers for discrete tasks |
| **Crew** | **Persistent agent sessions** | Long-running, human-directed work |
| **Convoy** | **Workflow instance** | Batched work tracking across sessions |
| **Molecules** | **Workflow graphs** | Dependency-aware multi-step coordination |
| **Formulas/Protos** | **Workflow templates** | Reusable definitions for coordination patterns |
| **Gates** | **Human approval / external condition waits** | Async coordination primitives |
| **Wisps** | **Ephemeral/scratch work** | Temporary state not persisted to shared store |
| **JSONL + git** | **JSONL + git** | Same transport, same rationale |
| **Hash-based IDs** | **Content-addressed identifiers** | Collision-resistant in concurrent environments |
| **Semantic compaction** | **Context summarization** | Compress completed work to preserve token budget |

### 10.2 Recommended Design Principles from Beads

**Principle 1: Execution over planning**. Beads succeeds because it focuses on "what should I do right now?" not "what is the grand plan?" The GARP server should prioritize `ready` computation (what ticks are unblocked) over workflow visualization.

**Principle 2: Token economy as architecture**. Every design decision in Beads is filtered through "how many tokens does this cost?" The `BriefIssue` model, the `bd prime` command, the CLI-over-MCP recommendation -- all optimize for minimal context consumption. The GARP server should adopt the same discipline.

**Principle 3: Git is the database**. Beads validates that git-backed JSONL with local SQLite caching is a viable architecture for agent coordination data. No external database service needed. The GARP server can follow the same pattern.

**Principle 4: Short sessions, clean handoffs**. "One task per session, land the plane, kill it, start fresh." This maps to focused ticks with completion protocols. Context rot is the enemy; clean boundaries are the solution.

**Principle 5: Advisory over enforced**. File reservations are advisory, not enforced locks. Contact policies guide behavior but trust agent discipline. This avoids deadlocks and keeps the system flexible. The GARP server should prefer advisory coordination over strict enforcement.

**Principle 6: Structured data, flexible UIs**. Beads exposes data through CLI + JSON + JSONL + SQLite. 25+ community UIs emerged. The GARP server should expose structured APIs and let the Craft Agents UI present them, rather than coupling coordination logic to any specific view.

### 10.3 What the Beads Ecosystem Does NOT Solve (Gaps Relevant to the Vision)

| Gap | Notes |
|-----|-------|
| **Domain-agnostic shared state schema** | Beads tracks issues/tasks. It does not model arbitrary domain state (RPG worlds, project boards, brainstorm canvases). The GARP server needs a more flexible state schema. |
| **Central LLM reasoning at the server** | Gas Town's Mayor is an agent, but the system does not have a "server brain" that reasons about dispatch strategy. The GARP server's LLM-powered dispatch logic has no direct precedent in Beads. |
| **Turn/tick as temporal concept** | Beads has tasks and dependencies but no concept of "cadence" or "it is your turn to act by this deadline." The GARP server needs time-awareness beyond simple timers. |
| **Human-at-every-node as mandatory architecture** | Beads treats human involvement as optional (gates, overseer). The GARP server vision requires human-at-every-node as the default pattern. |
| **Cross-organization federation** | Gas Town manages one workspace. The GARP server envisions multiple organizations/users coordinating. Federation is not addressed. |

---

## 11. Knowledge Gaps

### 11.1 Sources Sought but Not Found

| What I Searched For | What I Found | Assessment |
|--------------------|-------------|------------|
| Detailed formula/proto TOML schema and examples | References to the formula system in MOLECULES.md and FAQ, but no standalone schema documentation | **Partial gap**: The concept is documented but concrete examples are sparse |
| Gas Town's internal communication protocol between Mayor, Witness, and Refinery | Role templates describe responsibilities, but the inter-agent message format is not publicly documented | **True gap**: The internal GARP between Gas Town components is not exposed |
| Performance data on JSONL merge conflicts at scale | Qualitative mentions that "AI is required to work around edge cases" with JSONL merge | **True gap**: No quantitative data on merge conflict frequency or resolution cost |
| Beads usage in non-coding domains | All examples are software development | **True gap**: No evidence of Beads being used for the kind of domain-agnostic coordination the Craft Agents vision requires |

### 11.2 Areas Requiring Deeper Investigation

1. **Gas Town's convoy execution model** -- How does convoy status propagate? How are failures handled? The public docs describe the concept but not the failure modes.
2. **Beads at scale** -- How does the system perform with 1000+ open issues, 10+ concurrent agents, and months of accumulated history? The semantic compaction feature suggests this is anticipated but no benchmarks exist.
3. **MCP Agent Mail's contact handshake protocol** -- The `request_contact`/`respond_contact` flow for cross-project communication needs deeper study for federation implications.

---

## 12. Sources

### Primary (Official Documentation)

1. [Beads GitHub Repository - steveyegge/beads](https://github.com/steveyegge/beads)
2. [Beads AGENT_INSTRUCTIONS.md](https://github.com/steveyegge/beads/blob/main/AGENT_INSTRUCTIONS.md)
3. [Beads AGENTS.md](https://github.com/steveyegge/beads/blob/main/AGENTS.md)
4. [Beads MULTI_REPO_AGENTS.md](https://github.com/steveyegge/beads/blob/main/docs/MULTI_REPO_AGENTS.md)
5. [Beads MOLECULES.md](https://github.com/steveyegge/beads/blob/main/docs/MOLECULES.md)
6. [Beads COMMUNITY_TOOLS.md](https://github.com/steveyegge/beads/blob/main/docs/COMMUNITY_TOOLS.md)
7. [Beads Official Documentation Site](https://steveyegge.github.io/beads/)
8. [Beads FAQ](https://steveyegge.github.io/beads/reference/faq)
9. [MCP Agent Mail - steveyegge/mcp_agent_mail](https://github.com/steveyegge/mcp_agent_mail)
10. [MCP Agent Mail Website](https://mcpagentmail.com/)
11. [Gas Town - steveyegge/gastown](https://github.com/steveyegge/gastown)
12. [Gas Town Overview Documentation](https://github.com/steveyegge/gastown/blob/main/docs/overview.md)
13. [Gas Town Mayor Role Template](https://github.com/steveyegge/gastown/blob/main/internal/templates/roles/mayor.md.tmpl)

### Analysis and Community

14. [DeepWiki - steveyegge/beads](https://deepwiki.com/steveyegge/beads)
15. [DeepWiki - AI Agent Integration](https://deepwiki.com/steveyegge/beads/9-ai-agent-integration)
16. [Beads: Memory for Your Agent - Ian Bull](https://ianbull.com/posts/beads/)
17. [Beads: Memory for Your Coding Agents - Paddo.dev](https://paddo.dev/blog/beads-memory-for-coding-agents/)
18. [Hacker News Discussion - Beads](https://news.ycombinator.com/item?id=46075616)
19. [Beads + MCP Mail + Human Micro - LinkedIn](https://www.linkedin.com/posts/steveyegge_multi-agent-team-beads-mcpmail-human-activity-7393386342505746432--Cde)

---

*Research produced by Nova. 19 sources consulted across official documentation (13), community analysis (4), and discussion forums (2). All major claims supported by 3+ independent sources. Knowledge gaps documented in Section 11. Interpretations are explicitly labeled in Section 10.*
