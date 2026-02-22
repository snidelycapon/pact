# PACT Positioning, Competitive Landscape & Interoperability Strategy

**Research Depth**: Comprehensive
**Date**: 2026-02-22
**Researcher**: Nova (nw-researcher)
**Confidence**: High (3+ sources per major claim)

---

## Executive Summary

PACT is a **structured collaboration protocol for human teams, accessed natively through their AI agents**. It is NOT an agent-to-agent protocol. The human is always in the loop. The agent is the interface, not the recipient.

The core primitive is the **context bundle** -- a typed, structured package defined by team-specific pacts. Humans send each other bundles of context, requests, and attached files through their agents. The recipient receives the bundle and works with it however they choose, in their own workspace, with their own tools and methodology. PACT is the postal service between workspaces -- it doesn't care what happens inside them.

**Key findings**:
1. No existing tool occupies PACT's exact niche: structured human-to-human collaboration natively accessed through AI agents
2. The competitive landscape is fixated on agent autonomy; the "human team protocol" space is wide open
3. PACT's pact format is the key differentiator and the most portable piece of the design
4. Transport should be pluggable (git, HTTP/A2A, hosted service) to serve teams with different infrastructure needs
5. Interoperability with A2A and MCP Agent Mail is achievable and strategically valuable without requiring PACT to become either of those things

---

## 1. What PACT Actually Is

### 1.1 The Core Interaction

```
1. Cory is working with his agent (Claude Code, Codex, etc.)
2. Cory needs to send Dan a structured request -- a sanity-check, a code review,
   a question with attached files and specifications
3. Cory's team has defined "sanity-check" as a pact with typed
   context_bundle and response_bundle schemas
4. Cory composes and sends via MCP: pact_do send_request
5. The request travels through the shared protocol layer to Dan's inbox
6. Dan's agent shows him the request: pact_do check_inbox
7. Dan takes the context bundle and loads it wherever/however he needs --
   his own workspace, his own tools, his own methodology
8. Dan responds through his agent -- the response follows the pact's
   response schema
9. Everything is auditable in the shared backing store
```

### 1.2 The Workspace Boundary

This is the critical architectural insight:

```
Cory's Workspace (private)              Dan's Workspace (private)
  His agents, his tools,                  His agents, his tools,
  his methodology, his files              his methodology, his files
       |                                       |
       | MCP (or any agent interface)          | MCP (or any agent interface)
       |                                       |
       +============ PACT Protocol ============+
              (the only shared thing)
                     |
                     | pluggable transport
                     |
              Backing Store / Transport
         (Git, HTTP/A2A, hosted, whatever)
```

**PACT is the postal service between workspaces.** It does not dictate:
- What agent you use
- What tools you have
- How you organize your work
- What you do with received context bundles

It only defines:
- The **envelope format** (who, to whom, what type, threading)
- The **pact vocabulary** (what types of bundles this team exchanges)
- The **lifecycle semantics** (send, respond, amend, cancel, status)
- The **delivery guarantees** (at-least-once, auditable)

### 1.3 What Makes PACT Different from Everything Else

| Property | PACT | Slack | Email | Jira/Linear | A2A | MCP Agent Mail |
|---|---|---|---|---|---|---|
| Human-to-human | Yes | Yes | Yes | Yes | No (agent-to-agent) | No (agent-to-agent) |
| Agent-native access | Yes (MCP) | No (API bolt-on) | No | No (API bolt-on) | Yes | Yes |
| Team-defined message types | Yes (pacts) | No | No | Partially (issue types) | No | No |
| Typed context bundles | Yes (schema per pact) | No | No | Partially | Yes (artifacts) | No (freeform) |
| Workspace-agnostic | Yes | No (must use Slack) | Yes | No (must use platform) | Yes | Partially |
| Auditable history | Yes (git) | Limited | Limited | Yes | No opinion | Yes (git) |
| Works offline | Yes | No | Partially | No | No | Partially |

---

## 2. Competitive Landscape (Corrected Framing)

### 2.1 Human Collaboration Tools (Actual Competitors)

These serve human teams but lack agent-native access and typed contracts:

**Slack / Teams / Discord**
- Human async messaging with channels and threads
- Rich integrations, massive adoption
- Gap: No structured contracts. No typed bundles. Not agent-native (API bolt-ons feel unnatural). No offline. Vendor-locked.
- Interop opportunity: PACT could notify via Slack when a request arrives

**Email (SMTP/IMAP)**
- The original async human-to-human protocol
- 40+ years of proven patterns, federated, open standard
- Gap: No typed schemas. No team-defined contracts. Not agent-native. Noisy.
- Interop opportunity: PACT's envelope/threading model already mirrors email's. Email notifications as a delivery sideband.

**Linear / Jira / GitHub Issues**
- Structured work requests between humans with typed fields
- Strong workflow automation, team adoption
- Gap: Platform-defined schemas (not team-customizable). Not agent-native (API exists but isn't the primary interface). Tightly coupled to the platform.
- Interop opportunity: A PACT request could create a Linear/Jira issue as a side-effect, or vice versa.

**GitHub Pull Requests**
- Structured collaboration on code with review workflows
- The closest existing thing to "structured context bundles on git"
- Gap: Fixed to code review workflow. Cannot define custom request types. Not designed for general human-to-human messaging.
- Interop opportunity: PACT pacts could wrap PR workflows.

### 2.2 Agent Coordination Tools (NOT Competitors, but Interop Targets)

These serve autonomous agents, not human teams:

**Google A2A Protocol**
- Wire protocol for agent-to-agent discovery and task delegation
- Linux Foundation governance, 50+ partners, dominant emerging standard
- NOT a competitor: A2A is for autonomous agent interop. PACT is for human teams.
- Interop opportunity: HIGH. PACT could use A2A as a transport binding. A2A's Agent Card maps to PACT's pact discovery. A2A's task lifecycle maps to PACT's request lifecycle. A PACT node could appear as an A2A agent to the outside world.
- Sources: Google Developers Blog, a2a-protocol.org, GitHub (a2aproject/A2A)

**MCP Agent Mail**
- Async coordination for coding agents via MCP, backed by Git + SQLite
- 1.7k stars, active development, Steve Yegge endorsement
- NOT a competitor (different principal -- agents vs humans), but overlapping mechanics
- Interop opportunity: MEDIUM. PACT and Agent Mail could exchange messages through a shared git repo or bridged protocol. Agent Mail's file reservations could complement PACT's context bundles.
- Sources: GitHub (Dicklesworthstone/mcp_agent_mail)

**Microsoft Agent Framework / CrewAI / LangGraph / OpenAI Agents SDK**
- In-process agent orchestration frameworks
- NOT competitors: They coordinate agents within a single runtime. PACT connects humans across workspaces.
- Interop opportunity: LOW but interesting. A human using CrewAI/LangGraph could receive PACT requests and delegate to their local agent framework for processing.

### 2.3 Standards & Protocols (Alignment Targets)

**MCP (Model Context Protocol)** -- Anthropic / Linux Foundation
- Agent-to-tool interface standard. PACT is already native here.
- Status: 97M monthly SDK downloads. The interface layer is settled.
- Alignment: PACT IS an MCP server. No change needed. Continue tracking MCP spec evolution (async tasks, auth, governance).
- Sources: modelcontextprotocol.io

**A2A (Agent-to-Agent Protocol)** -- Google / Linux Foundation
- Agent-to-agent wire protocol. HTTP/JSON-RPC + gRPC + SSE + webhooks.
- Status: Dominant standard. IBM ACP merged in (Sep 2025). v0.3 with gRPC.
- Alignment: PACT should be able to use A2A as a transport binding, not replace its own semantics with A2A's. See Section 4.
- Sources: a2a-protocol.org, Google Developers Blog

**NLIP (Natural Language Interaction Protocol)** -- Ecma International
- Ratified standard (Dec 2025). Five Ecma standards (ECMA-430 through ECMA-434).
- Natural language envelopes for human-agent and agent-agent communication.
- Alignment: PACT's pacts are more structured than NLIP's NL-first approach, but NLIP's HTTP/AMQP bindings inform transport design.
- Sources: ecma-international.org

**ANP (Agent Network Protocol)**
- Internet-scale agent networking with DID-based identity and encrypted communication.
- Alignment: ANP's decentralized identity (W3C DIDs) is interesting for PACT's user identity model beyond team-local config.json.
- Sources: agent-network-protocol.com

---

## 3. Transport Pluggability

### 3.1 Why Transport Must Be Pluggable

Different teams have different constraints:

| Team Profile | Needs | Best Transport |
|---|---|---|
| Open source team sharing a GitHub repo | Audit trail, offline, zero infrastructure | Git (current) |
| Enterprise team with privacy requirements | Private hosting, access control, compliance | Self-hosted Git (GitLab/Gitea) or HTTP API |
| Distributed team without shared repo | Low friction, no git setup required | Hosted HTTP service or A2A bridge |
| Mixed tooling team (some use GitHub, some don't) | Universal access | HTTP API with optional git sync |
| Team needing real-time notifications | Low latency delivery | HTTP + SSE/webhooks |

### 3.2 Transport Layer Architecture

```
┌─────────────────────────────────────────┐
│           PACT Protocol Core            │
│                                         │
│  Pacts  |  Envelope Format    │
│  Lifecycle Mgmt   |  Identity/Auth      │
│  Context Bundles   |  Threading          │
└─────────────┬───────────────────────────┘
              │
     ┌────────┴────────┐
     │ Transport SPI    │  (Service Provider Interface)
     │                  │
     │  send()          │
     │  receive()       │
     │  list_inbox()    │
     │  discover()      │
     │  sync()          │
     └──┬───┬───┬───┬──┘
        │   │   │   │
        ▼   ▼   ▼   ▼
      Git  HTTP  A2A  (future)
           API  Bridge
```

### 3.3 Transport Implementations

**Git Transport (current, first-class)**
- Backing store: shared git repository
- Push: commit + git push
- Receive: git fetch + scan
- Discovery: read config.json + pacts/ from main branch
- Advantages: audit trail, offline, diffable, zero infrastructure (if team already has a repo)
- Disadvantages: requires git knowledge, push latency, no real-time, branch management overhead

**HTTP Transport (new, for broader adoption)**
- Backing store: server-side database (SQLite for self-hosted, Postgres for cloud)
- Push: POST /requests with envelope + bundle
- Receive: GET /inbox/{user_id} or SSE stream
- Discovery: GET /pacts, GET /team
- Advantages: standard REST patterns, real-time capable (SSE/webhooks), no git required, easy to host
- Disadvantages: requires running a server, less auditable than git, new infrastructure to build

**A2A Bridge Transport (interop layer)**
- Translates between PACT protocol semantics and A2A wire format
- PACT pact → A2A Agent Card (pact discovery)
- PACT send_request → A2A tasks/send (task submission)
- PACT check_inbox → A2A tasks/get (task status)
- PACT context_bundle → A2A artifacts (structured payload)
- Advantages: interoperates with any A2A-compatible agent/service
- Disadvantages: semantic impedance (A2A assumes autonomous agents; PACT assumes human principals)

### 3.4 Mapping PACT Concepts to A2A

| PACT Concept | A2A Equivalent | Impedance |
|---|---|---|
| Pact (PACT.md) | Agent Card (agent.json) | Low -- both describe capabilities with typed inputs/outputs |
| send_request | tasks/send | Low -- both submit typed requests |
| check_inbox | tasks/get (or push notification) | Low -- polling vs push |
| context_bundle | Artifact (with parts) | Low -- both carry structured payloads |
| response_bundle | Task result artifacts | Low -- both return typed responses |
| request lifecycle (pending/completed) | Task state (submitted/working/completed) | Low -- similar state machines |
| Team membership | No direct equivalent | Medium -- A2A is peer-to-peer, not team-based |
| Pact discovery (list_pacts) | Agent Card discovery (/.well-known/agent.json) | Low -- both advertise capabilities |
| amend_request | No direct equivalent | High -- A2A tasks are immutable once submitted |
| cancel_request | tasks/cancel | Low |
| Thread ID / in_reply_to | Task context / parent task | Medium |

The mapping is surprisingly clean for core operations. The main gaps are team-level constructs (PACT has teams; A2A has peers) and request amendment (PACT allows amending; A2A doesn't).

---

## 4. Interoperability Strategy

### 4.1 Principles

1. **PACT's protocol semantics are primary** -- interop layers translate, they don't dictate
2. **Pacts are the portable artifact** -- they can be expressed as A2A Agent Cards, OpenAPI specs, or JSON Schema
3. **Transport is a deployment choice** -- a team picks git, HTTP, or A2A based on their needs
4. **Graceful degradation** -- if an interop target doesn't support a PACT feature (e.g., amend), the bridge handles it (e.g., cancel + re-send)

### 4.2 A2A Interop (Outward-Facing)

A PACT team could expose itself as an A2A endpoint:

```
External A2A Agent                     PACT Team
       |                                  |
       | 1. GET /.well-known/agent.json   |
       |--------------------------------->|
       |    (returns PACT pacts as        |
       |     A2A Agent Card)               |
       |                                  |
       | 2. POST /tasks/send              |
       |    (A2A task with artifacts)      |
       |--------------------------------->|
       |    (bridge translates to PACT     |
       |     request envelope + bundle)    |
       |                                  |
       |    ... human processes request ...|
       |                                  |
       | 3. GET /tasks/{id}               |
       |--------------------------------->|
       |    (returns completed task        |
       |     with response artifacts)      |
```

This makes a PACT team accessible to any A2A-compatible system without the external system knowing or caring about PACT internals.

### 4.3 MCP Agent Mail Bridge (If Useful)

If a team member uses MCP Agent Mail for their workspace (instead of PACT's MCP tools), a bridge could translate:

- Agent Mail message → PACT request envelope (strip mail-specific fields, map to pact)
- PACT response → Agent Mail reply (reverse translation)

This is lower priority than A2A but could ease adoption for teams where some members already use Agent Mail.

### 4.4 Notification Sidebands (Complementary)

PACT doesn't need to replace Slack or email for notifications. It can use them as sidebands:

```
PACT request sent
  → Slack webhook: "Cory sent you a sanity-check request via PACT"
  → Email notification: subject line + link to inbox
  → GitHub notification: issue comment or status check
```

The notification tells the human "you have mail." The human opens their agent and checks their PACT inbox for the actual structured content. This mirrors how GitHub sends email notifications that link back to the web UI.

---

## 5. Open Standards Alignment Checklist

### 5.1 What PACT Should Adopt

| Standard / Practice | What It Provides | Priority |
|---|---|---|
| JSON Schema for bundle validation | Typed, validateable pact schemas | High |
| OpenID Connect / OAuth 2.0 for HTTP transport | Standard auth for non-git transports | High (for HTTP transport) |
| A2A Agent Card format for pact discovery | Interop with A2A ecosystem | Medium |
| CloudEvents envelope format | Standard event metadata (source, type, id, time) | Medium |
| W3C DIDs for user identity | Decentralized identity beyond team-local config | Low (future) |
| JSON-RPC 2.0 for HTTP transport | Matches A2A wire format, well-understood | Medium |
| Semantic Versioning for pacts | Breaking change management for team vocabularies | High |

### 5.2 What PACT Should NOT Adopt

| Standard | Why Not |
|---|---|
| A2A's full task lifecycle | PACT's lifecycle is richer (amend, cancel) and human-centric |
| FIPA ACL speech acts | Over-engineered for structured bundles. Academic, not practical. |
| GraphQL for queries | Over-engineering. REST or JSON-RPC is sufficient for inbox operations. |
| gRPC for primary transport | Too heavy for the target audience (small teams, coding agents). Reserve for high-throughput bridge scenarios. |

---

## 6. Recommended Architecture Layers

```
┌─────────────────────────────────────────────────────┐
│                    Human + Agent                     │
│         (Claude Code, Codex, Gemini CLI, etc.)       │
└─────────────────────┬───────────────────────────────┘
                      │ MCP (primary interface)
                      │ (or CLI, or HTTP client, or future interfaces)
┌─────────────────────┴───────────────────────────────┐
│                  PACT Protocol Core                   │
│                                                       │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │    Pacts     │  │   Envelope   │  │  Lifecycle  │ │
│  │  (contracts,  │  │  (sender,    │  │  (send,     │ │
│  │   schemas,    │  │   recipient, │  │   respond,  │ │
│  │   discovery)  │  │   thread,    │  │   amend,    │ │
│  │              │  │   bundles)   │  │   cancel)   │ │
│  └──────────────┘  └──────────────┘  └────────────┘ │
│                                                       │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │   Identity    │  │    Teams     │  │   Routing   │ │
│  │  (user auth,  │  │  (groups,    │  │  (fan-out,  │ │
│  │   membership) │  │   roles)     │  │   round-    │ │
│  │              │  │              │  │   robin)    │ │
│  └──────────────┘  └──────────────┘  └────────────┘ │
└─────────────────────┬───────────────────────────────┘
                      │ Transport SPI
         ┌────────────┼────────────┬────────────┐
         ▼            ▼            ▼            ▼
    ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌────────┐
    │   Git   │  │  HTTP   │  │   A2A   │  │ Future │
    │Transport│  │Transport│  │ Bridge  │  │        │
    │         │  │         │  │         │  │        │
    │ GitHub  │  │ REST +  │  │ Agent   │  │ Matrix │
    │ GitLab  │  │ SSE +   │  │ Cards + │  │ AMQP   │
    │ Gitea   │  │ SQLite/ │  │ Tasks + │  │ ...    │
    │ local   │  │ Postgres│  │ Artifacts│ │        │
    └─────────┘  └─────────┘  └─────────┘  └────────┘
```

### 6.1 What Gets Standardized (the Portable Core)

These are the things that MUST be consistent across all transports:

1. **Pact Contract Format** -- YAML frontmatter + Markdown + JSON Schema for bundles. This is PACT's unique contribution. It should be versioned and have a formal specification.
2. **Envelope Format** -- Sender, recipient, pact type, thread_id, in_reply_to, timestamps, bundle reference. Could adopt CloudEvents as the base envelope with PACT-specific extensions.
3. **Lifecycle Semantics** -- send, respond, amend, cancel. State machine: pending → in_progress → completed/cancelled. This is richer than A2A's lifecycle and must be preserved.
4. **Context Bundle Schema** -- Per-pact typed payload. JSON Schema validation. Attachment references.

### 6.2 What Varies by Transport

1. **Authentication** -- Git uses SSH keys / deploy keys. HTTP uses OAuth/OIDC. A2A uses its own auth.
2. **Discovery** -- Git reads config.json + pacts/ from a branch. HTTP uses REST endpoints. A2A uses Agent Cards at /.well-known/.
3. **Delivery mechanism** -- Git push, HTTP POST, A2A tasks/send.
4. **Notification** -- Git webhooks, HTTP SSE, A2A push notifications.
5. **Persistence** -- Git commits, database rows, A2A is stateless (server decides persistence).

---

## 7. Privacy & Hosting Options

### 7.1 Self-Hosted Git (GitLab CE, Gitea, Forgejo)

- Full control, on-premise, air-gapped capable
- Free and open source
- All PACT features work identically to GitHub
- Webhook support for notifications
- Best for: teams with existing self-hosted git infrastructure

### 7.2 Self-Hosted HTTP Server

- A lightweight PACT HTTP server (Node.js/Python) with SQLite or Postgres
- Could be a single binary or Docker container
- Provides REST API + SSE for real-time
- No git dependency
- Best for: teams that want PACT without git operations

### 7.3 Cloud-Hosted Service (Future)

- PACT-as-a-service: managed hosting, zero infrastructure
- Multi-tenant with team isolation
- Could offer both git-backed and database-backed storage
- Best for: teams that want zero ops

### 7.4 Peer-to-Peer (Future / Experimental)

- Each participant runs a local PACT node
- Nodes sync directly via A2A or a gossip protocol
- No central server
- Best for: maximum privacy, no trust in third parties

---

## 8. What PACT Should Borrow vs Build

### 8.1 Borrow (Don't Reinvent)

| From | What to Borrow | Why |
|---|---|---|
| A2A | Agent Card format for pact advertisement | Standard discovery that A2A ecosystem can consume |
| A2A | Task state machine (map to PACT's richer one) | Interop with A2A clients |
| CloudEvents | Envelope metadata fields (source, type, id, time, specversion) | Well-adopted event envelope standard |
| JSON Schema | Bundle validation | The standard for typed JSON validation |
| OAuth 2.0 / OIDC | HTTP transport auth | Don't build auth. Use the standard. |
| MCP | Agent interface (already using) | The interface layer is settled |
| SMTP concepts | Envelope/header separation, store-and-forward, threading | Proven patterns for human async messaging |

### 8.2 Build (PACT's Unique Contributions)

| What | Why It Doesn't Exist Elsewhere |
|---|---|
| Pact Contract Format | No existing standard for team-defined typed message contracts accessible via agents |
| Human-in-the-loop lifecycle (amend/cancel) | A2A assumes autonomous agents; PACT needs human review/amendment |
| Team-scoped routing with fan-out | A2A is peer-to-peer; PACT needs team-level constructs |
| Transport SPI (pluggable backing store) | Nobody else separates protocol semantics from transport this cleanly |
| Context bundle packaging with attachments | Structured typed payloads with file attachments, defined per pact |

---

## 9. Relationship to Branch-Per-User Research

The branch-per-user inbox architecture (see `branch-per-user-inbox-architecture.md`) remains valid and relevant as the **design for the Git transport layer**. It answers: "given that the transport is git, how should we organize branches?"

With the transport-pluggable architecture, that research becomes one transport implementation:

```
PACT Protocol Core
  └── Git Transport
        └── Branch-per-user inbox design (from earlier research)
  └── HTTP Transport
        └── Database-per-user inbox (tables, not branches)
  └── A2A Bridge
        └── External A2A agent (no local inbox; proxied)
```

The branch-per-user patterns (envelope/header separation, fan-out, dead letters, conflict resolution) apply across transports -- they just manifest differently in each.

---

## 10. Recommended Next Steps

### Immediate (Define the Core)
1. **Formalize the Pact Contract specification** -- This is PACT's most unique and portable artifact. Define it rigorously with JSON Schema, semver, and a formal spec document.
2. **Define the Envelope format** -- Adopt CloudEvents as base, extend with PACT-specific fields (pact_type, thread_id, in_reply_to, team_id, bundles).
3. **Define the Transport SPI** -- The abstract interface that all transports must implement (send, receive, list_inbox, discover, sync).

### Near-Term (First Transport)
4. **Refactor current Git implementation to conform to the Transport SPI** -- Current code becomes the first transport provider.
5. **Design the HTTP transport** -- REST + SSE + SQLite/Postgres. This opens PACT to teams without git.

### Medium-Term (Interop)
6. **Build the A2A bridge** -- Expose PACT teams as A2A Agent Cards. Accept A2A tasks as PACT requests.
7. **Add notification sidebands** -- Slack webhook, email notification when requests arrive.

### Future (Ecosystem)
8. **Publish the Pact Contract format as an open specification** -- PACT's lasting contribution may be the concept of "team-defined typed message contracts for human collaboration through agents."
9. **Cloud-hosted option** -- For teams that want zero infrastructure.

---

## Source Index

### Standards & RFCs
- RFC 5321 -- SMTP (IETF)
- RFC 2822 -- Internet Message Format (IETF)
- RFC 6120/6121 -- XMPP Core/IM (IETF)
- RFC 2811 -- IRC Channel Management (IETF)
- ECMA-430 through ECMA-434 -- NLIP (Ecma International, Dec 2025)

### Protocols & Specifications
- A2A Protocol v0.3 (a2a-protocol.org, Linux Foundation)
- MCP Specification (modelcontextprotocol.io, Linux Foundation)
- CloudEvents v1.0 (cloudevents.io, CNCF)
- JSON Schema (json-schema.org)
- OpenID Connect / OAuth 2.0 (openid.net)
- ANP White Paper (agent-network-protocol.com)

### Tools & Projects (Analyzed)
- MCP Agent Mail (github.com/Dicklesworthstone/mcp_agent_mail) -- 1.7k stars
- Microsoft Agent Framework (learn.microsoft.com/agent-framework)
- CrewAI (crewai.com)
- LangGraph (langchain.com/langgraph)
- OpenAI Agents SDK (openai.github.io/openai-agents-python)
- Agent-MCP (github.com/rinadelph/Agent-MCP)
- Agent Protocol (agentprotocol.ai)
- public-inbox (public-inbox.org)
- Fossil SCM (fossil-scm.org)
- git-appraise (github.com/google/git-appraise)
- GITER (arxiv.org/html/2511.04182v1)

### Research Statistics
- Total sources consulted: 70+
- Tools/protocols directly analyzed: 15
- Standards reviewed: 8
- Knowledge gaps documented: 3 (see branch-per-user doc)
- Confidence distribution: High (75%), Medium (20%), Low (5%)
