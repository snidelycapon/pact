# Competitive Landscape & Prior Art

**Date**: 2026-02-22
**Status**: Active working document
**Depends on**: `01-positioning-and-identity.md`
**Supersedes**: Competitive sections of `pact-positioning-and-interop.md`

---

## 1. PACT's Niche

PACT occupies the intersection of three domains that no existing tool covers simultaneously:

```
    Human-to-Human          Agent-Native           Typed Contracts
    Collaboration           Interface              + Automation
         |                      |                       |
    Slack, Email,          MCP, A2A,              JSON Schema,
    Jira, Linear          Agent SDKs              Workflow Engines
         |                      |                       |
         +------------ PACT ---+------------------------+
```

---

## 2. Human Collaboration Tools (Adjacent, Not Competitors)

These serve human teams but lack agent-native access and/or typed contracts with automation:

### Slack / Teams / Discord
- **What**: Human async messaging with channels and threads
- **Strengths**: Massive adoption, real-time, rich integrations, app ecosystem
- **Gap vs PACT**: No structured contracts. No typed bundles. Agent integrations feel bolted-on (not native). No declared processing pipelines. Automation lives in separate workflow builders.
- **Interop opportunity**: PACT lifecycle hooks can send notifications to Slack. Slack is the "you have mail" signal; PACT is the structured content.

### Email (SMTP/IMAP)
- **What**: The original async human-to-human protocol. 40+ years of proven patterns.
- **Strengths**: Federated, open standard, universal, offline-capable, proven at scale.
- **Gap vs PACT**: No typed schemas. No team-defined contracts. Not agent-native. No declared processing pipelines (mail rules are receiver-side, not sender-declared).
- **Interop opportunity**: PACT's architecture mirrors email's patterns (envelope/header, store-and-forward, threading). Email notifications as delivery sideband.
- **Key lesson**: Email's longevity comes from simplicity, federation, and open standards. PACT should aspire to the same.

### Linear / Jira / GitHub Issues
- **What**: Structured work requests between humans with typed fields and workflow automation.
- **Strengths**: Strong workflow automation, team adoption, project management context.
- **Gap vs PACT**: Platform-defined schemas (not team-customizable). Not agent-native (API exists but isn't the primary interface). Tightly coupled to the platform. Automation lives in platform settings.
- **Interop opportunity**: PACT request -> creates Linear/Jira issue as side-effect (lifecycle hook). Or vice versa via webhook.

### GitHub Pull Requests
- **What**: Structured collaboration on code with review workflows.
- **Strengths**: The closest existing thing to "structured context bundles on git." Code review is a well-defined request/response pattern.
- **Gap vs PACT**: Fixed to code review workflow. Cannot define custom request types. Not designed for general human-to-human messaging.
- **Interop opportunity**: PACT `code-review` pact could wrap and enrich the PR workflow.

---

## 3. Agent Coordination Tools (Different Category Entirely)

These serve autonomous agents. They are NOT competitors but are interop targets and ecosystem context.

### Google A2A Protocol
- **What**: Wire protocol for agent-to-agent discovery and task delegation. Linux Foundation governance, 50+ partners (Salesforce, SAP, Atlassian). Dominant emerging standard.
- **Transport**: HTTP/JSON-RPC + gRPC + SSE + webhooks
- **Why not a competitor**: A2A is for autonomous agent interop. No human in the loop. No team-defined pacts. No lifecycle hooks.
- **Interop value**: HIGH. PACT can expose itself as an A2A endpoint (pact -> Agent Card, request -> task). See `03-transport-and-interop.md`.
- **Sources**: [a2a-protocol.org](https://a2a-protocol.org), [Google Developers Blog](https://developers.googleblog.com/en/a2a-a-new-era-of-agent-interoperability/)

### MCP Agent Mail
- **What**: Mail-like coordination for coding agents via MCP. Git + SQLite backing. 1.7k GitHub stars.
- **Transport**: HTTP FastMCP + Git + SQLite FTS5
- **Why not a competitor (with nuance)**: Agent Mail's principals are agents, not humans. It's "email for coding agents." PACT's principals are humans who use agents. However, the mechanics overlap significantly (MCP interface, Git backing, inbox model).
- **Key differences**: Agent Mail is freeform email. PACT has typed pacts. Agent Mail has file reservation leases. PACT has lifecycle hooks. Agent Mail has full-text search. PACT has lifecycle semantics (amend/cancel).
- **Interop opportunity**: Medium. Could bridge messages between systems for teams using both.
- **Sources**: [GitHub](https://github.com/Dicklesworthstone/mcp_agent_mail), [mcpagentmail.com](https://mcpagentmail.com)

### Microsoft Agent Framework (AutoGen + Semantic Kernel)
- **What**: Production framework for multi-agent orchestration. Event-driven. Python + .NET.
- **Why not a competitor**: In-process framework. All agents run within a single runtime. Cannot coordinate independent agents across workspaces.
- **Sources**: [learn.microsoft.com/agent-framework](https://learn.microsoft.com/en-us/agent-framework/overview/)

### CrewAI
- **What**: Python framework for role-playing autonomous AI agents. 100k+ developers.
- **Why not a competitor**: Monolithic orchestration. All agents run inside one CrewAI process. Cannot coordinate humans across workspaces.
- **Sources**: [crewai.com](https://www.crewai.com/)

### LangGraph
- **What**: Graph-based orchestration. Agents are nodes with edges defining data flow.
- **Why not a competitor**: Workflow engine, not messaging protocol. All agents are nodes in one graph.
- **Sources**: [langchain.com/langgraph](https://www.langchain.com/langgraph)

### OpenAI Agents SDK
- **What**: Lightweight multi-agent framework. Handoff-based. Provider-agnostic (despite the name).
- **Why not a competitor**: In-process handoffs within a single execution context.
- **Sources**: [openai.github.io/openai-agents-python](https://openai.github.io/openai-agents-python/)

---

## 4. Standards & Protocols

| Standard | Status | Relevance to PACT |
|---|---|---|
| **MCP** (Anthropic / Linux Foundation) | Dominant, 97M monthly SDK downloads | PACT's interface layer. Already native. |
| **A2A** (Google / Linux Foundation) | Dominant for agent-to-agent. v0.3. | Interop target, not replacement. |
| **CloudEvents** (CNCF) | Mature event envelope standard | Not adopting. PACT's envelope has its own semantics. |
| **JSON Schema** | Ubiquitous | Adopt for bundle validation in pacts. |
| **OAuth 2.0 / OIDC** | Universal auth standard | Adopt for HTTP transport auth. |
| **ACP** (IBM) | Merging into A2A (Sep 2025) | Subsumed. Track A2A instead. |
| **ANP** (Agent Network Protocol) | Early stage, DID-based identity | Watch for decentralized identity ideas. |
| **NLIP** (Ecma International) | Ratified Dec 2025. ECMA-430-434. | Different approach (NL-first). Low relevance. |
| **FIPA ACL** | Legacy. IEEE. | Academic. Too heavyweight. |

---

## 5. Prior Art Projects

### public-inbox -- Git as Email Archive
- Stores email archives in git repos. Used by Linux kernel mailing list.
- Validates git as substrate for message storage at scale.
- Does NOT use branch-per-user. Single linear history.
- **Source**: [public-inbox.org](https://public-inbox.org)

### Fossil SCM -- VCS with Built-In Communication
- Bundles VCS, tickets, wiki, forum, chat into one SQLite artifact.
- Validates communication in the same substrate as version control.
- **Lesson**: SQLite for structured queries alongside VCS for history.
- **Source**: [fossil-scm.org](https://fossil-scm.org)

### git-appraise -- Code Review on Git Notes (Google)
- Distributed code review stored as git notes. Separate refs for reviews and discussions.
- `cat_sort_uniq` merge strategy for conflict-free note merging.
- **Lesson**: Git notes provide side-channel structured communication. Poor tooling support.
- **Source**: [GitHub](https://github.com/google/git-appraise)

### GITER -- Git as Declarative Exchange Model (2025)
- Academic: git as declarative exchange using Kubernetes spec/status pattern.
- Publisher writes spec; consumer processes and writes status.
- **Lesson**: The spec/status ownership split maps to PACT's request/response model.
- **Source**: [arXiv 2511.04182v1](https://arxiv.org/html/2511.04182v1)

### Jujutsu (jj) / GitButler / Pijul -- Conflict-Tolerant VCS
- Demonstrate that conflicts can be represented as data rather than errors.
- Jujutsu: stable change-ids independent of commit hash.
- GitButler: virtual branches, rebase-always-succeeds.
- Pijul: category theory, independent patches commute.
- **Lesson**: PACT's append-only JSON files in separate directories already avoid most conflicts. These tools validate the approach.

---

## 6. The Competitive Gap

Nobody is building what PACT is building. The landscape breaks down as:

| Category | Tools | What They Lack |
|---|---|---|
| Human messaging | Slack, Email | Typed contracts, agent-native, declared automation |
| Structured work tracking | Linear, Jira | Agent-native access, team-customizable schemas |
| Agent orchestration | CrewAI, LangGraph, AutoGen | Human principals, cross-workspace, custom contracts |
| Agent messaging | A2A, MCP Agent Mail | Human-in-the-loop, team-defined pacts, lifecycle hooks |
| Workflow automation | Zapier, n8n, GitHub Actions | Not co-located with message schema, not agent-native |

PACT's unique position: **typed message contracts + lifecycle hooks declared in the pact + agent-native interface + human principals**. This specific combination has no existing solution.

---

## 7. Risk Assessment

### Risk: A2A Subsumes the Need
- **Likelihood**: Low for PACT's specific niche. A2A is agent-to-agent, not human-to-human.
- **Mitigation**: Build A2A bridge for interop. Let A2A handle the wire protocol; PACT provides the human layer.

### Risk: MCP Agent Mail Expands Into PACT's Space
- **Likelihood**: Medium. If Agent Mail adds typed contracts and human-focused features.
- **Mitigation**: Move faster on pacts and lifecycle hooks. These are PACT's defensible differentiators.

### Risk: Slack/Linear Add Agent-Native Interfaces
- **Likelihood**: High (they will). Slack already has AI features.
- **Mitigation**: They won't add team-defined pacts or declared lifecycle hooks. Those require a protocol-level rethink that platforms built for manual interaction won't do.

### Risk: The Niche Is Too Small
- **Likelihood**: Low to medium. AI agent adoption is accelerating. The "human teams working through agents" use case is growing.
- **Mitigation**: Make PACT easy to adopt. Transport pluggability and clear documentation lower the barrier.
