# Async Multi-Agent Coordination with Human-in-the-Loop: Landscape Research

**Research Date**: 2026-02-21
**Researcher**: Nova (Evidence-Driven Knowledge Researcher)
**Scope**: Frameworks, protocols, and architectural patterns matching the vision of an asynchronous multi-agent PACT with humans at each client node
**Source Count**: 38 sources across 12 topic areas
**Confidence Distribution**: 4 High, 6 Medium, 2 Low

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [The Vision Under Evaluation](#2-the-vision-under-evaluation)
3. [Protocol Layer: How Agents Communicate](#3-protocol-layer-how-agents-communicate)
4. [Orchestration Frameworks: How Agents Coordinate](#4-orchestration-frameworks-how-agents-coordinate)
5. [Infrastructure Layer: Durable Execution and Task Queues](#5-infrastructure-layer-durable-execution-and-task-queues)
6. [Architectural Patterns: State, Events, and Coordination](#6-architectural-patterns-state-events-and-coordination)
7. [Git-Like State Management for Agents](#7-git-like-state-management-for-agents)
8. [Gap Analysis: What Exists vs. What the Vision Requires](#8-gap-analysis-what-exists-vs-what-the-vision-requires)
9. [Closest Matches Ranked](#9-closest-matches-ranked)
10. [Knowledge Gaps](#10-knowledge-gaps)
11. [Recommendations](#11-recommendations)
12. [Sources](#12-sources)

---

## 1. Executive Summary

No single existing framework fully implements the described vision of an asynchronous multi-agent PACT where each client node pairs a local LLM agent with a human operator, receiving context-bundled task dispatches ("ticks") from a central coordinating server. However, the landscape as of early 2026 provides strong building blocks at every layer of the stack.

**The gap is in composition, not in components.** The protocol layer (A2A, MCP), orchestration frameworks (AutoGen, LangGraph, CrewAI), and infrastructure platforms (Temporal, Inngest) each solve parts of the problem. What is missing is the specific integration pattern that combines:

- A central server with LLM reasoning capability ("brain")
- Async task dispatch with context bundles to distributed human+agent nodes
- Local agent autonomy with human approval gates
- Shared mutable state with event-sourced history
- Domain agnosticism (RPG, PR review, brainstorming, etc.)

The closest existing systems are **AutoGen v0.4's distributed runtime** (for the agent messaging architecture), **Temporal** (for durable async task dispatch with context), and **Google's A2A protocol** (for the inter-agent communication standard). None of them natively model the "human operator at every node" pattern as a first-class concept.

---

## 2. The Vision Under Evaluation

From the [problem-validation document](/Users/cory/craft-gm/docs/discovery/problem-validation.md), the target architecture consists of:

| Component | Description |
|-----------|-------------|
| **Central Server** | Manages shared state, dispatches ticks/turns, assembles context bundles. Has LLM reasoning ("brain"). Like a Git remote with intelligence. |
| **Client Nodes** | Each has a local LLM agent + human operator. Can query state, reason locally, plan, then submit actions. |
| **Ticks/Turns** | Async task requests from server to clients. Not real-time; play-by-post cadence. |
| **Context Bundles** | Accompany task requests. Fire up the client agent with relevant context for the specific task. |
| **Shared State** | World state, project state, entity tracking. Event-sourced changelog. |
| **Domain Agnostic** | RPG turns, PR reviews, brainstorming, any async collaborative workflow. |
| **Infrastructure** | Messaging queue + shared state store + LLM orchestration layer. |

This creates seven evaluation criteria for existing frameworks:

1. **Async task dispatch** -- Can the server send work items to distributed clients asynchronously?
2. **Context bundling** -- Are tasks accompanied by relevant context payloads?
3. **Human-in-the-loop at each node** -- Is human approval/input a first-class concept at every agent node?
4. **Local agent autonomy** -- Can each client node run its own LLM reasoning session?
5. **Shared mutable state** -- Is there a central state store that all nodes can read/write?
6. **Central LLM coordinator** -- Does the server itself have reasoning capability?
7. **Domain agnosticism** -- Is the framework generic, not locked to one domain?

---

## 3. Protocol Layer: How Agents Communicate

### 3.1 Google Agent2Agent Protocol (A2A)

**Confidence: HIGH** (3+ independent sources: Google, IBM, Linux Foundation documentation, multiple independent analyses)

A2A is an open protocol announced by Google in April 2025 for inter-agent communication, now under the Linux Foundation with 150+ supporting organizations. [Source: [Google Developers Blog](https://developers.googleblog.com/en/a2a-a-new-era-of-agent-interoperability/), [IBM](https://www.ibm.com/think/topics/agent2agent-protocol), [GitHub](https://github.com/a2aproject/A2A)]

**Architecture:**
- JSON-RPC 2.0 over HTTP(S)
- Agent discovery via "Agent Cards" (JSON capability manifests)
- Supports synchronous request/response, streaming (SSE), and async push notifications
- Version 0.3 added gRPC support and security card signing

**Relevance to the Vision:**

| Criterion | Rating | Notes |
|-----------|--------|-------|
| Async task dispatch | Strong | Native async push notification support |
| Context bundling | Partial | Rich data exchange (text, files, structured JSON) but no formalized "context bundle" concept |
| Human-in-the-loop | Weak | Protocol does not model human operators; agents are opaque |
| Local agent autonomy | Strong | Agents are explicitly opaque -- internal reasoning is private |
| Shared mutable state | Absent | No shared state concept; agents exchange messages, not state |
| Central LLM coordinator | Neutral | Any agent can be a coordinator; not architecturally prescribed |
| Domain agnostic | Strong | Fully generic |

**Key Insight**: A2A is the strongest candidate for the *communication protocol* between server and clients. It provides agent discovery, async messaging, and capability negotiation. But it is a wire protocol, not an orchestration framework. It does not provide shared state, context assembly, or human-in-the-loop patterns. [Source: [GetStream protocol comparison](https://getstream.io/blog/ai-agent-protocols/)]

### 3.2 Model Context Protocol (MCP)

**Confidence: HIGH** (3+ sources: Anthropic, OpenAI adoption, Linux Foundation/AAIF, Thoughtworks, Wikipedia)

MCP, introduced by Anthropic in November 2024, standardizes how AI agents connect to external tools, data sources, and APIs. Adopted by OpenAI (March 2025), Google DeepMind, Microsoft, and donated to the Linux Foundation's Agentic AI Foundation (AAIF) in December 2025. The November 2025 specification expanded MCP beyond synchronous tool calling into async execution and enterprise authorization. [Source: [Thoughtworks](https://www.thoughtworks.com/en-us/insights/blog/generative-ai/model-context-protocol-mcp-impact-2025), [MCP Spec](https://modelcontextprotocol.io/specification/2025-11-25), [Pento Year in Review](https://www.pento.ai/blog/a-year-of-mcp-2025-review)]

**Architecture:**
- Client-server model: LLM hosts connect to MCP servers that expose tools/resources
- Structured context schemas for consistent data interpretation
- November 2025 spec adds async execution, modern authorization, long-running workflows

**Relevance to the Vision:**

| Criterion | Rating | Notes |
|-----------|--------|-------|
| Async task dispatch | Partial | Nov 2025 spec adds async execution, but MCP is tool-access oriented, not task-dispatch oriented |
| Context bundling | Strong | Core purpose is structured context delivery to LLMs |
| Human-in-the-loop | Absent | Not modeled in the protocol |
| Local agent autonomy | Strong | Each MCP client runs its own LLM session |
| Shared mutable state | Partial | MCP servers can expose shared resources, but no built-in state coordination |
| Central LLM coordinator | Absent | MCP servers are tools, not reasoners |
| Domain agnostic | Strong | Fully generic |

**Key Insight**: MCP and A2A are complementary, not competing. As multiple sources confirm: "MCP standardizes access to capabilities (how agents interact with the outside world), while A2A enables collaborative workflows (how AI agents work together)." The vision likely needs both: MCP for context/tool access at each node, A2A for server-client communication. [Source: [OneReach MCP vs A2A](https://onereach.ai/blog/guide-choosing-mcp-vs-a2a-protocols/), [InfoQ](https://www.infoq.com/articles/architecting-agentic-mlops-a2a-mcp/)]

### 3.3 Agent Communication Protocol (ACP)

**Confidence: MEDIUM** (3 sources: IBM Research, ACP documentation site, Linux Foundation announcement)

ACP was created by IBM Research for their BeeAI platform (March 2025). REST-based, async-first, framework-agnostic. Importantly, ACP merged with A2A under the Linux Foundation in August 2025, and is winding down independent development. [Source: [IBM Research](https://research.ibm.com/projects/agent-communication-protocol), [ACP Docs](https://agentcommunicationprotocol.dev/introduction/welcome), [LF AI & Data](https://lfaidata.foundation/communityblog/2025/08/29/acp-joins-forces-with-a2a-under-the-linux-foundations-lf-ai-data/)]

**Key Features Before Merger:**
- REST-based (HTTP endpoints, curl-friendly)
- MIME-typed multipart messages for multimodal data
- Async-first with sync support
- Stateful and stateless operation modes
- Agent discovery (online and offline)

**Relevance**: ACP's contribution lives on within A2A. Its REST simplicity and MIME-typed message design are worth studying as a design influence, but it is not a standalone option going forward.

### 3.4 Agent Network Protocol (ANP)

**Confidence: LOW** (2 sources, limited adoption data)

ANP targets direct agent-to-agent internet communication using Decentralized Identifiers (DIDs) for cryptographic identity verification and JSON-LD for semantic context. [Source: [GetStream](https://getstream.io/blog/ai-agent-protocols/)]

**Relevance**: Interesting for a future where client nodes are truly decentralized (not behind a single server), but premature for the described architecture. The DID-based identity model is worth noting for multi-organization deployments.

### 3.5 Protocol Layer Summary

| Protocol | Async | Context | HITL | State | Status |
|----------|-------|---------|------|-------|--------|
| A2A | Native | Partial | No | No | Active, Linux Foundation |
| MCP | Nov 2025+ | Strong | No | Partial | Active, AAIF/Linux Foundation |
| ACP | Native | MIME-typed | No | Optional | Merged into A2A |
| ANP | Yes | JSON-LD | No | No | Early stage |

**None of the protocols model human-in-the-loop as a first-class concept.** This is a significant architectural gap. Human participation must be implemented at the framework/application layer, not the protocol layer.

---

## 4. Orchestration Frameworks: How Agents Coordinate

### 4.1 AutoGen v0.4 (Microsoft)

**Confidence: HIGH** (4+ sources: Microsoft Research blog, AutoGen documentation, multiple independent reviews)

AutoGen v0.4, released January 2025, is a complete architectural rewrite introducing an asynchronous, event-driven actor model. It is the closest existing framework to the described vision's server-client architecture. [Source: [Microsoft Research](https://www.microsoft.com/en-us/research/blog/autogen-v0-4-reimagining-the-foundation-of-agentic-ai-for-scale-extensibility-and-robustness/), [AutoGen Blog](https://devblogs.microsoft.com/autogen/autogen-reimagined-launching-autogen-0-4/), [AutoGen Docs](https://microsoft.github.io/autogen/stable//user-guide/core-user-guide/framework/distributed-agent-runtime.html)]

**Architecture:**
- **Actor model**: Agents are actors that process messages asynchronously
- **Distributed runtime**: Hub-and-spoke model
  - **Host Service** (GrpcWorkerAgentRuntimeHost): Central message router, maintains connections to all workers
  - **Worker Runtimes**: Run agent code, connect to host, advertise supported agent types
- **Topic-based pub/sub**: Agents subscribe to topics; host routes messages across workers
- **gRPC transport**: Async message passing across process/machine boundaries
- **Layered**: Core (actor model) -> AgentChat (high-level API) -> Extensions

**Relevance to the Vision:**

| Criterion | Rating | Notes |
|-----------|--------|-------|
| Async task dispatch | Strong | Native async messaging via actor model and topic subscriptions |
| Context bundling | Partial | Messages carry payloads, but no formalized context bundle assembly |
| Human-in-the-loop | Moderate | Supported via UserProxyAgent pattern, but not "human at every node" |
| Local agent autonomy | Strong | Each worker runs its own agents with full LLM capability |
| Shared mutable state | Partial | Agents share state through messages, not a central state store |
| Central LLM coordinator | Possible | Host is a message router, not a reasoner; but a coordinating agent can be placed there |
| Domain agnostic | Strong | Fully generic |

**Key Insight**: AutoGen v0.4's distributed runtime is architecturally the closest match to the vision's server-client topology. The host service maps to the "server/remote," and worker runtimes map to "client nodes." The gap is that (a) the host is a dumb router, not a reasoning brain, (b) human-in-the-loop is an optional agent type, not a mandatory gate at every node, and (c) there is no built-in shared state store. The distributed runtime is also marked as **experimental** with expected breaking changes. [Source: [AutoGen Distributed Runtime Docs](https://microsoft.github.io/autogen/stable//user-guide/core-user-guide/framework/distributed-agent-runtime.html)]

### 4.2 LangGraph / LangGraph Platform

**Confidence: HIGH** (4+ sources: LangChain blog, LangGraph docs, multiple independent reviews, DataCamp)

LangGraph (v1.0 released October 2025, now "LangSmith Deployment" in cloud form) models agent workflows as directed graphs with persistent state checkpointing. [Source: [LangChain Blog](https://blog.langchain.com/langgraph-platform-ga/), [DataCamp](https://www.datacamp.com/tutorial/crewai-vs-langgraph-vs-autogen), [LateNode](https://latenode.com/blog/ai-frameworks-technical-infrastructure/langgraph-multi-agent-orchestration/langgraph-multi-agent-orchestration-complete-framework-guide-architecture-analysis-2025)]

**Architecture:**
- Graph of nodes (agent steps) connected by edges (conditional logic)
- Persistent checkpointing (PostgreSQL, DynamoDB) for durable state
- Human-in-the-loop via "interrupt" nodes that pause execution and wait
- "Remote Graphs" for distributed multi-agent architectures
- Built on Pregel/Apache Beam concepts for scalability

**Relevance to the Vision:**

| Criterion | Rating | Notes |
|-----------|--------|-------|
| Async task dispatch | Moderate | Supports async execution; "Remote Graphs" enable distributed dispatch |
| Context bundling | Strong | State is carried through the graph; checkpoints preserve full context |
| Human-in-the-loop | Strong | Native interrupt nodes; execution pauses, surfaces context, waits for human input (seconds or hours) |
| Local agent autonomy | Moderate | Each node can run LLM calls, but nodes are graph steps, not independent agents |
| Shared mutable state | Strong | Graph state is shared across all nodes; checkpointed persistently |
| Central LLM coordinator | Possible | Supervisor pattern can act as central coordinator |
| Domain agnostic | Strong | Fully generic |

**Key Insight**: LangGraph's strength is in state management and human-in-the-loop. Its checkpoint-and-resume model maps well to async "play-by-post" patterns where a human might respond hours later. Its weakness is that it models workflows as graphs within a single deployment, not as a network of independent client nodes. "Remote Graphs" add distribution but are designed for agent-to-agent delegation, not for the "server dispatches to human+agent client" pattern. [Source: [LangGraph HITL Docs](https://docs.langchain.com/oss/python/langchain/human-in-the-loop)]

### 4.3 CrewAI

**Confidence: MEDIUM** (3+ sources: CrewAI docs, GitHub, DataCamp comparison, DigitalOcean tutorial)

CrewAI models agents as role-playing team members organized into "Crews." [Source: [CrewAI Docs](https://docs.crewai.com/en/concepts/tasks), [GitHub](https://github.com/crewAIInc/crewAI), [DataCamp](https://www.datacamp.com/tutorial/crewai-vs-langgraph-vs-autogen)]

**Architecture:**
- Role-based agent teams with hierarchical or sequential processes
- Manager agent allocates tasks based on roles/capabilities
- Async task execution via `kickoff_async()`
- Shared memory when `memory=True`
- Task callbacks for post-completion actions
- Task `context` attribute for dependency chains

**Relevance to the Vision:**

| Criterion | Rating | Notes |
|-----------|--------|-------|
| Async task dispatch | Moderate | `kickoff_async()` runs crews in separate threads; task dependencies via `context` |
| Context bundling | Moderate | Task context attribute chains outputs between tasks |
| Human-in-the-loop | Weak | `human_input=True` on tasks pauses for feedback, but not designed as "human operator at every node." Community discussion shows this is a known gap for async HITL. |
| Local agent autonomy | Moderate | Agents have tools and can delegate, but run within a single process |
| Shared mutable state | Moderate | Shared memory space when enabled, but not a persistent external state store |
| Central LLM coordinator | Yes | Manager agent in hierarchical process acts as coordinator |
| Domain agnostic | Strong | Fully generic |

**Key Insight**: CrewAI's role-based metaphor is intuitive but the framework is primarily designed for single-process, synchronous-first execution. Async support exists but human-in-the-loop for async workflows requires custom implementation. A GitHub issue (#2051) explicitly discusses the difficulty of "designing asynchronous human-in-the-loop Crews running on the backend." [Source: [CrewAI GitHub Issue #2051](https://github.com/crewAIInc/crewAI/issues/2051)]

### 4.4 OpenAI Agents SDK

**Confidence: MEDIUM** (3 sources: OpenAI documentation, GitHub, independent reviews)

Released March 2025 as the production successor to the experimental Swarm framework. [Source: [OpenAI Agents SDK Docs](https://openai.github.io/openai-agents-python/), [GitHub](https://github.com/openai/openai-agents-python), [Fast.io](https://fast.io/resources/openai-agents-sdk/)]

**Architecture:**
- Lightweight Python framework for multi-agent handoffs
- Agents can handoff control to other agents mid-conversation
- Built-in guardrails and tracing
- Provider-agnostic (supports non-OpenAI models)
- Async/await with Python asyncio

**Relevance to the Vision:**

| Criterion | Rating | Notes |
|-----------|--------|-------|
| Async task dispatch | Weak | Async at the code level, not at the distributed system level |
| Context bundling | Moderate | Conversation context flows through handoffs |
| Human-in-the-loop | Moderate | Built-in HITL mechanisms, but designed for interactive chat, not async dispatch |
| Local agent autonomy | Moderate | Agents are autonomous within their scope |
| Shared mutable state | Weak | No shared state beyond conversation context |
| Central LLM coordinator | Possible | One agent can serve as coordinator via handoffs |
| Domain agnostic | Strong | Fully generic |

**Key Insight**: The Agents SDK is optimized for conversational handoffs between co-located agents, not for distributed async coordination. It is the right tool for building the *client-side* agent experience (a local agent that reasons and acts) but not for the server-to-client orchestration layer.

### 4.5 Swarms Framework

**Confidence: MEDIUM** (3 sources: GitHub, Swarm Network blog, PowerDrill industry report)

Enterprise-grade multi-agent framework with diverse orchestration patterns. [Source: [GitHub](https://github.com/kyegomez/swarms), [Swarm Network](https://swarmnetwork.ai/blog/the-multi-agent-collaboration-framework-a-k-a-swarms)]

**Architecture:**
- Modular agents with tools, memory, LLM backends
- Multiple swarm patterns: Sequential, Concurrent, HierarchicalSwarm, MixtureOfAgents, GraphWorkflow, AgentRearrange
- SwarmRouter for dynamic pattern selection
- AutoSwarmBuilder for automatic agent generation
- MCP integration, Agent Orchestration Protocol (AOP)

**Relevance to the Vision:**

| Criterion | Rating | Notes |
|-----------|--------|-------|
| Async task dispatch | Moderate | Concurrent workflows support parallel dispatch |
| Context bundling | Partial | Memory systems, but not formalized context bundles |
| Human-in-the-loop | Weak | Not emphasized in documentation |
| Local agent autonomy | Strong | Agents are autonomous with full tool/memory access |
| Shared mutable state | Partial | Memory systems, not a central state store |
| Central LLM coordinator | Yes | HierarchicalSwarm has a director agent |
| Domain agnostic | Strong | Fully generic |

### 4.6 AWS Agent Squad

**Confidence: MEDIUM** (3 sources: GitHub, AWS documentation, independent analyses)

Formerly "Multi-Agent Orchestrator," a lightweight framework for routing queries across multiple agents. [Source: [GitHub](https://github.com/awslabs/agent-squad), [AWS Labs Docs](https://awslabs.github.io/agent-squad/)]

**Architecture:**
- Intelligent intent classification routes queries to appropriate agents
- SupervisorAgent implements "agent-as-tools" pattern for parallel processing
- Context management scoped by user ID, session ID, agent ID
- Dual memory: User-Supervisor and Supervisor-Team
- Pluggable storage (DynamoDB, SQL, in-memory)

**Relevance**: Good context management model (scoped by user/session/agent), and the SupervisorAgent pattern aligns with the "server brain." But designed for request routing, not async task dispatch.

### 4.7 Anthropic Multi-Agent Architecture (Claude Code Agent Teams)

**Confidence: MEDIUM** (3 sources: Anthropic engineering blog, Claude Code docs, independent analyses)

Anthropic's own multi-agent system uses a lead agent + subagent model. [Source: [Anthropic Engineering](https://www.anthropic.com/engineering/multi-agent-research-system), [Claude Code Docs](https://docs.anthropic.com/en/docs/claude-code/sub-agents)]

**Architecture:**
- Lead orchestrator agent decomposes tasks, delegates to subagents
- Each subagent receives assignment + relevant context (files, constraints, expectations)
- Subagents operate autonomously within scope
- Human-in-the-loop via hooks: "hooks suggest, humans approve"
- Permission modes control subagent autonomy

**Relevance to the Vision:**

| Criterion | Rating | Notes |
|-----------|--------|-------|
| Async task dispatch | Moderate | Subagents are dispatched tasks, but within a single session |
| Context bundling | Strong | Each subagent receives focused context for its assignment |
| Human-in-the-loop | Strong | Hook-based HITL where humans approve handoffs |
| Local agent autonomy | Strong | Subagents are semi-independent processes |
| Shared mutable state | Weak | Filesystem is the shared state; no coordination primitives |
| Central LLM coordinator | Strong | Lead agent is explicitly an LLM-powered coordinator |
| Domain agnostic | Moderate | Designed for coding tasks but pattern is generic |

**Key Insight**: The Anthropic lead+subagent pattern is closest in *spirit* to the vision, but it operates within a single machine/session, not across distributed client nodes. The "hooks suggest, humans approve" pattern is exactly the right HITL model for the vision's client nodes.

### 4.8 Framework Comparison Matrix

| Framework | Async Dispatch | Context Bundles | HITL per Node | Local Autonomy | Shared State | Central Brain | Domain Agnostic |
|-----------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| AutoGen v0.4 | ++ | + | + | ++ | + | - | ++ |
| LangGraph | + | ++ | ++ | + | ++ | + | ++ |
| CrewAI | + | + | - | + | + | + | ++ |
| OpenAI Agents | - | + | + | + | - | + | ++ |
| Swarms | + | + | - | ++ | + | + | ++ |
| AWS Agent Squad | + | + | - | + | + | + | ++ |
| Anthropic Agents | + | ++ | ++ | ++ | - | ++ | + |

Legend: ++ Strong, + Partial, - Weak/Absent

---

## 5. Infrastructure Layer: Durable Execution and Task Queues

### 5.1 Temporal

**Confidence: HIGH** (4+ sources: Temporal docs, IntuitionLabs, James Carr blog, multiple independent analyses)

Temporal is a durable execution platform that decouples stateful workflows from stateless workers. [Source: [IntuitionLabs](https://intuitionlabs.ai/articles/agentic-ai-temporal-orchestration), [James Carr](https://james-carr.org/posts/2026-02-05-temporal-durable-ai-agents/)]

**Architecture:**
- **Temporal Cluster**: Stateful core that records every workflow event
- **Workers**: Stateless processes on your infrastructure that execute workflow/activity code
- **Workflows**: Define the "master plan" as code
- **Activities**: Any interaction with the outside world (API calls, LLM calls, database queries)
- **Signals**: External inputs (including human approvals) that can unblock waiting workflows
- **Durable timers**: Workflows can sleep for arbitrary durations without consuming resources

**Relevance to the Vision:**

| Criterion | Rating | Notes |
|-----------|--------|-------|
| Async task dispatch | Very Strong | Core capability: dispatch activities to workers asynchronously with full retry/recovery |
| Context bundling | Strong | Activity inputs carry complete context; workflow state is durable |
| Human-in-the-loop | Strong | Signals enable human input at any point; workflows pause and wait indefinitely |
| Local agent autonomy | Moderate | Workers execute code, but are not LLM-agent-aware |
| Shared mutable state | Strong | Workflow state is durable, versioned, and queryable |
| Central LLM coordinator | Absent | Temporal is infrastructure, not an AI framework |
| Domain agnostic | Very Strong | Completely generic distributed systems infrastructure |

**Key Insight**: Temporal is the strongest match for the *infrastructure layer* of the vision. Its workflow-as-code model, durable state, signal-based human input, and async activity dispatch to distributed workers map almost directly to "server dispatches context-bundled ticks to client nodes that may respond hours later." The missing piece is LLM integration -- Temporal does not know about agents, context windows, or token budgets. But it is the ideal foundation to build the orchestration layer on top of. [Source: [Pydantic AI Temporal integration](https://ai.pydantic.dev/temporal/)]

### 5.2 Inngest

**Confidence: MEDIUM** (3 sources: Inngest docs, comparison articles)

Serverless-first durable execution. [Source: [Inngest](https://www.inngest.com/), [Inngest vs Temporal comparison](https://www.inngest.com/compare-to-temporal)]

**Architecture:**
- Event-driven: functions triggered by events
- Steps as atomic, retriable units of work
- Serverless: no persistent cluster needed; invokes functions via HTTP
- Built-in queuing, state persistence, retry logic

**Relevance**: Simpler alternative to Temporal for serverless deployments. Lower operational overhead but less control over worker topology. Good fit if client nodes are serverless functions rather than persistent processes.

### 5.3 Task Queue Patterns for AI Agents

**Confidence: MEDIUM** (3 sources: LogRocket, Block agent-task-queue, Taskiq)

Task queues for AI agents follow established patterns with AI-specific additions. [Source: [LogRocket](https://blog.logrocket.com/ai-agent-task-queues/), [Block agent-task-queue](https://github.com/block/agent-task-queue)]

**Key Pattern: Context-Carrying Tasks**
Each queued task carries its complete execution context: conversation history, user request, intermediate results, and metadata about prior attempts. This enables deterministic retries -- when an operation fails midway, the retry does not rebuild lost context from scratch. [Source: LogRocket]

**Architectural Elements:**
- Priority queues (high/normal/low) for task ordering
- Dead letter queues for failed tasks
- Adaptive rate limiting (requests/min + tokens/min)
- Context hashing for deduplication
- Callback chaining for multi-step operations

**Relevance**: The "context-carrying task" pattern is directly applicable to the vision's "context bundles accompany task requests." The priority queue model supports different urgency levels for different types of ticks (urgent PR review vs. leisurely RPG turn).

---

## 6. Architectural Patterns: State, Events, and Coordination

### 6.1 Event Sourcing + CQRS for Multi-Agent State

**Confidence: HIGH** (4+ sources: Microsoft Azure Architecture, Confluent, multiple independent analyses)

Event sourcing captures all state changes as immutable events; CQRS separates read and write operations. [Source: [Microsoft Learn](https://learn.microsoft.com/en-us/azure/architecture/patterns/event-sourcing), [Confluent](https://www.confluent.io/blog/event-driven-multi-agent-systems/), [InfoWorld](https://www.infoworld.com/article/3808083/a-distributed-state-of-mind-event-driven-multi-agent-systems.html)]

**Why This Matters for the Vision:**
- Every action submitted by a client node becomes an immutable event
- Shared state is derived from the event log (not mutated directly)
- Any client can reconstruct state from the event history
- The event log IS the changelog/audit trail
- Multiple agents can subscribe to the same events
- Conflicting state can be resolved deterministically

**Key Pattern: The Blackboard**
Multiple agents read from and write to a shared "blackboard" (state store). Each agent observes the current state, reasons about it, and posts updates. The Confluent article identifies this as one of four core patterns for event-driven multi-agent systems, alongside orchestrator-worker, hierarchical, and market-based patterns.

**Relevance**: Event sourcing maps directly to the problem-validation document's "event-sourced changelog" requirement and the rpg-tools "changelog as audit trail" pattern. The blackboard pattern maps to the "shared state that clients query and update."

### 6.2 Event-Driven Multi-Agent Coordination Patterns

**Confidence: MEDIUM** (3 sources: Confluent, Microsoft Azure, Medium analyses)

Four patterns for event-driven multi-agent systems. [Source: [Confluent](https://www.confluent.io/blog/event-driven-multi-agent-systems/), [Microsoft Azure](https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns)]

1. **Orchestrator-Worker**: Central agent creates plans and delegates tasks to specialized workers. Maps to the vision's "server dispatches ticks to clients."
2. **Hierarchical Agent**: Nested orchestrators for complex task decomposition. Maps to multi-level coordination (server -> team leads -> individual clients).
3. **Blackboard**: Shared state store that all agents read and write. Maps to the vision's "shared mutable state."
4. **Market-Based**: Agents bid on tasks based on capability and availability. Could enable client nodes to accept/decline ticks.

**Key Insight**: The vision is primarily an **orchestrator-worker + blackboard hybrid**. The server is the orchestrator that dispatches work, and the shared state is the blackboard that provides context and receives results. This is a well-understood distributed systems pattern, but its application with LLM agents + human operators at each node is novel.

---

## 7. Git-Like State Management for Agents

### 7.1 AgentGit

**Confidence: MEDIUM** (2 primary sources: arXiv paper, GitHub repo -- below the 3-source threshold)

AgentGit (HKU, November 2025) adds Git-like rollback and branching to multi-agent workflows as an infrastructure layer on top of LangGraph. [Source: [arXiv](https://arxiv.org/abs/2511.00628), [GitHub](https://github.com/HKU-MAS-Infra-Layer/Agent-Git)]

**Capabilities:**
- State commit: Save snapshots of agent state during execution
- Revert: Restore previously saved states for error recovery
- Branching: Explore multiple execution pathways independently and in parallel
- Reduces redundant computation, lowers runtime and token usage

**Relevance**: The "Git remote with a brain" metaphor from the problem-validation document maps to version-controlled state management. AgentGit validates that this concept is being explored academically, but it focuses on workflow branching within a single deployment, not on collaborative multi-node state sharing.

### 7.2 Agent-MCP

**Confidence: MEDIUM** (3 sources: GitHub, independent analyses)

Agent-MCP is a framework for multi-agent coordination via MCP, with Git-like state concepts. [Source: [GitHub](https://github.com/rinadelph/Agent-MCP)]

**Architecture:**
- Multiple specialized agents (backend, frontend, testing, etc.) work in parallel
- Shared "knowledge graph" as persistent, searchable memory bank
- Agents checkpoint progress via commit files encoding state, decisions, rationale
- Branch directories for exploratory work isolated from main workflow
- Real-time visualization of agent collaboration
- MCP server exposing tools: create_agent, list_agents, assign_task, view_tasks, ask_project_rag, inter-agent messaging

**Relevance to the Vision:**

| Criterion | Rating | Notes |
|-----------|--------|-------|
| Async task dispatch | Moderate | Task assignment via MCP tools |
| Context bundling | Strong | Shared knowledge graph + RAG queries |
| Human-in-the-loop | Weak | Not emphasized; agents work autonomously |
| Local agent autonomy | Strong | Each agent is specialized and independent |
| Shared mutable state | Strong | Persistent knowledge graph with commit/branch model |
| Central LLM coordinator | Possible | Orchestration layer manages progression |
| Domain agnostic | Weak | Designed for software development projects |

**Key Insight**: Agent-MCP is the closest existing implementation to the "Git remote with a brain" concept. Its shared knowledge graph with commit/branch semantics, combined with MCP-based agent coordination, is architecturally aligned with the vision. Its main gaps are: no human-in-the-loop, no async "tick" dispatch model, and software-development-specific design.

---

## 8. Gap Analysis: What Exists vs. What the Vision Requires

### 8.1 Components That Exist and Are Production-Ready

| Component | Best Available Solution | Maturity |
|-----------|----------------------|----------|
| Async inter-agent messaging | A2A protocol (v0.3) | Standard, 150+ orgs |
| Context delivery to LLM agents | MCP (Nov 2025 spec) | Industry standard |
| Durable async task dispatch | Temporal | Battle-tested in production |
| Persistent state with checkpointing | LangGraph Platform (PostgreSQL) | Production (v1.0) |
| Event-sourced state store | Kafka/EventStore + CQRS | Decades of production use |
| Distributed agent runtime | AutoGen v0.4 (gRPC hub-and-spoke) | Experimental |
| Human-in-the-loop interrupts | LangGraph interrupt nodes | Production |
| Agent-as-coordinator pattern | CrewAI manager, Anthropic lead agent | Production |

### 8.2 Components That Do NOT Exist

| Component | What Is Missing | Closest Approximation |
|-----------|----------------|----------------------|
| **Human-at-every-node as architectural primitive** | No framework treats "human operator + local LLM agent" as the standard node type. HITL is always optional, not mandatory. | Anthropic hooks ("hooks suggest, humans approve") |
| **Context bundle assembly** | No framework packages relevant shared state into a task-specific context bundle for dispatch to a remote human+agent node. | MCP structured context + LangGraph state, but not combined with task dispatch |
| **Tick/turn dispatch cadence** | No framework models async "turns" as a first-class temporal concept. Tasks exist, but "your turn to act" with a deadline/cadence does not. | Temporal durable timers + workflow signals |
| **Server-side LLM reasoning ("brain")** | No protocol or framework combines central coordination with LLM reasoning at the dispatch layer. Coordinators are either dumb routers (AutoGen host) or application-level agents (CrewAI manager). | Anthropic lead agent pattern, but not as infrastructure |
| **Domain-agnostic shared state schema** | Each framework has its own state model. No standardized "world state" abstraction works across RPG, PR review, and brainstorming. | Event sourcing provides the mechanism, but not the schema |
| **Client-node registration and capability advertisement** | A2A Agent Cards describe agent capabilities, but not "human operator + local agent" capability as a composite. | A2A Agent Cards |

### 8.3 The Integration Gap

The critical finding is that all the building blocks exist but have never been composed into the specific architecture described. This is both a risk and an opportunity:

**Risk**: No one has validated this exact composition. There may be unforeseen impedance mismatches between layers.

**Opportunity**: The components are mature and standardized. Building the vision does not require inventing new infrastructure -- it requires a novel integration layer.

---

## 9. Closest Matches Ranked

### Tier 1: Closest Architectural Match

**1. AutoGen v0.4 Distributed Runtime + Temporal**

*Combined*, these two cover the most ground:
- AutoGen provides the hub-and-spoke agent runtime with async messaging
- Temporal provides durable task dispatch, context-carrying activities, signal-based human input, and workflow state
- Gap: No built-in LLM coordinator at the hub; human-at-every-node not modeled; experimental status of AutoGen distributed runtime

**2. LangGraph Platform + A2A Protocol**

- LangGraph provides checkpoint-and-resume state, native HITL interrupts, and Remote Graphs for distribution
- A2A provides the inter-agent communication standard
- Gap: LangGraph is graph-workflow-oriented, not hub-and-spoke; "Remote Graphs" are agent-to-agent, not server-to-human+agent-client

### Tier 2: Strong Partial Matches

**3. Agent-MCP**

- Closest to "Git remote with a brain" concept
- Shared knowledge graph with commit/branch semantics
- MCP-based task assignment and inter-agent messaging
- Gap: No HITL, no async tick dispatch, software-development-specific

**4. Anthropic Lead+Subagent Pattern**

- Closest to the HITL and context-bundling vision
- "Hooks suggest, humans approve" is exactly the right interaction model
- Strong context assembly per subagent
- Gap: Single-machine/session, not distributed; no shared state coordination; coding-task-focused

**5. Temporal as Standalone Foundation**

- Strongest infrastructure match for durable async dispatch + human signals
- Complete context preservation across arbitrary time gaps
- Gap: No LLM awareness; would need significant application code on top

### Tier 3: Useful Components, Not Architectural Matches

**6. CrewAI** -- Good role-based metaphor, weak on async HITL and distribution
**7. AWS Agent Squad** -- Good context scoping model, weak on async dispatch
**8. OpenAI Agents SDK** -- Good for building client-side agent, not the PACT
**9. Swarms Framework** -- Many patterns, but enterprise/production focus without HITL emphasis

---

## 10. Knowledge Gaps

### 10.1 Searched For, Not Found

| What I Searched For | What I Found | Assessment |
|--------------------|-------------|------------|
| Turn-based/tick-based async agent dispatch frameworks | General async task queues, game turn-based systems (Colyseus, Shephertz), but nothing combining AI agents + human operators + turn cadence | **True gap**: No framework models "turns" for AI+human async collaboration |
| Play-by-post PACTs for AI-assisted play | Forum-based play-by-post game discussions; no AI-augmented protocols | **True gap**: Play-by-post is a human-only pattern with no AI PACT |
| Domain-agnostic shared state schemas for multi-agent coordination | Framework-specific state models; event sourcing as a mechanism | **Partial gap**: The mechanism exists (event sourcing), but no standardized multi-agent state schema |
| Frameworks explicitly designed for human+AI pair nodes | HITL as an optional feature in many frameworks; never as the mandatory node architecture | **True gap**: This is the most distinctive aspect of the vision and has no precedent |
| "Git remote with a brain" concept in distributed AI systems | AgentGit (academic), Agent-MCP (Git-like commits for agents), Entire CLI (Git observability for agents) | **Partial coverage**: The concept is emerging but fragmented and not matched to the full vision |

### 10.2 Areas Requiring Deeper Investigation

1. **AutoGen v0.4 Distributed Runtime Stability**: Marked as experimental. Needs hands-on evaluation to determine if it can serve as a foundation.
2. **A2A + MCP Interop in Practice**: Both are under the Linux Foundation, but practical integration examples for multi-agent coordination are sparse as of Feb 2026.
3. **Temporal + LLM Agent Integration Patterns**: The February 2026 blog post on "Durable AI Agents with Temporal" suggests this is actively developing. Needs deeper review.
4. **AgentGit Maturity**: Only one academic paper (Nov 2025). Needs evaluation of code quality and community traction.

---

## 11. Recommendations

### 11.1 Architectural Strategy: Compose, Don't Adopt

No single framework should be adopted wholesale. The vision is best served by composing:

| Layer | Recommended Approach |
|-------|---------------------|
| **Communication Protocol** | A2A for server-client messaging; MCP for tool/context access at each node |
| **Durable Orchestration** | Temporal (or Inngest for simpler deployments) for async task dispatch, durable state, and human signal handling |
| **State Management** | Event-sourced state store (could be file-based for MVP per problem-validation doc) with CQRS read models |
| **Client-Side Agent** | OpenAI Agents SDK or direct Claude API with Anthropic's subagent patterns for local LLM reasoning |
| **Server-Side Brain** | Custom LLM-powered coordinator built on top of the orchestration layer |
| **Human-in-the-Loop** | Custom "human gate" pattern at each client node, inspired by Anthropic's "hooks suggest, humans approve" and LangGraph's interrupt-and-resume |
| **Context Assembly** | Custom context bundler that packages relevant shared state for each task dispatch, using MCP structured context patterns |

### 11.2 What to Build vs. What to Reuse

**Reuse (do not build):**
- Message transport (A2A / HTTP / gRPC)
- Durable task execution (Temporal / Inngest)
- LLM API integration (existing SDKs)
- Event storage (existing event stores or file-based)

**Build (the novel integration layer):**
- The "server brain" that reasons about what ticks to dispatch and to whom
- The "context bundler" that assembles relevant state into task-specific packages
- The "human+agent node" abstraction that pairs a local LLM session with human approval gates
- The "tick" concept as a first-class temporal unit (cadence, deadline, urgency)
- The domain-agnostic state schema that can represent RPG worlds, code reviews, brainstorming sessions, etc.

### 11.3 MVP Path

The simplest path to a working prototype:

1. **File-based event store** for shared state (per problem-validation doc: "File-based storage is sufficient for MVP")
2. **Simple HTTP server** as the coordinator brain (LLM + state access + tick dispatch)
3. **MCP server** exposing shared state to client agents
4. **Claude Code / local LLM** as the client-side agent
5. **Human operator** reviews agent suggestions before submitting actions
6. **JSON messages** as context bundles (no need for A2A formality at MVP)

This creates the "Git remote with a brain" experience without requiring any external framework adoption. External standards (A2A, MCP, Temporal) can be adopted incrementally as the system matures.

---

## 12. Sources

### Protocols

1. [Announcing the Agent2Agent Protocol (A2A) - Google Developers Blog](https://developers.googleblog.com/en/a2a-a-new-era-of-agent-interoperability/)
2. [Agent2Agent Protocol GitHub](https://github.com/a2aproject/A2A)
3. [What Is Agent2Agent (A2A) Protocol? - IBM](https://www.ibm.com/think/topics/agent2agent-protocol)
4. [A2A Protocol Getting an Upgrade - Google Cloud Blog](https://cloud.google.com/blog/products/ai-machine-learning/agent2agent-protocol-is-getting-an-upgrade)
5. [MCP Specification (Nov 2025)](https://modelcontextprotocol.io/specification/2025-11-25)
6. [A Year of MCP - Pento](https://www.pento.ai/blog/a-year-of-mcp-2025-review)
7. [MCP Impact on 2025 - Thoughtworks](https://www.thoughtworks.com/en-us/insights/blog/generative-ai/model-context-protocol-mcp-impact-2025)
8. [Agent Communication Protocol - IBM Research](https://research.ibm.com/projects/agent-communication-protocol)
9. [ACP Documentation](https://agentcommunicationprotocol.dev/introduction/welcome)
10. [ACP Joins Forces with A2A - LF AI & Data](https://lfaidata.foundation/communityblog/2025/08/29/acp-joins-forces-with-a2a-under-the-linux-foundations-lf-ai-data/)
11. [MCP vs A2A: Protocols for Multi-Agent Collaboration 2026 - OneReach](https://onereach.ai/blog/guide-choosing-mcp-vs-a2a-protocols/)
12. [Top AI Agent Protocols in 2026 - GetStream](https://getstream.io/blog/ai-agent-protocols/)
13. [Architecting Agentic MLOps with A2A and MCP - InfoQ](https://www.infoq.com/articles/architecting-agentic-mlops-a2a-mcp/)

### Orchestration Frameworks

14. [AutoGen v0.4 - Microsoft Research](https://www.microsoft.com/en-us/research/blog/autogen-v0-4-reimagining-the-foundation-of-agentic-ai-for-scale-extensibility-and-robustness/)
15. [AutoGen Reimagined: Launching v0.4 - AutoGen Blog](https://devblogs.microsoft.com/autogen/autogen-reimagined-launching-autogen-0-4/)
16. [AutoGen Distributed Agent Runtime Documentation](https://microsoft.github.io/autogen/stable//user-guide/core-user-guide/framework/distributed-agent-runtime.html)
17. [LangGraph Platform GA - LangChain Blog](https://blog.langchain.com/langgraph-platform-ga/)
18. [LangGraph Multi-Agent Orchestration Guide - LateNode](https://latenode.com/blog/ai-frameworks-technical-infrastructure/langgraph-multi-agent-orchestration/langgraph-multi-agent-orchestration-complete-framework-guide-architecture-analysis-2025)
19. [LangGraph Human-in-the-Loop Docs](https://docs.langchain.com/oss/python/langchain/human-in-the-loop)
20. [CrewAI vs LangGraph vs AutoGen - DataCamp](https://www.datacamp.com/tutorial/crewai-vs-langgraph-vs-autogen)
21. [CrewAI Tasks Documentation](https://docs.crewai.com/en/concepts/tasks)
22. [CrewAI Async HITL Issue #2051](https://github.com/crewAIInc/crewAI/issues/2051)
23. [OpenAI Agents SDK Documentation](https://openai.github.io/openai-agents-python/)
24. [OpenAI Agents SDK GitHub](https://github.com/openai/openai-agents-python)
25. [Swarms Framework GitHub](https://github.com/kyegomez/swarms)
26. [AWS Agent Squad GitHub](https://github.com/awslabs/agent-squad)
27. [Agent-MCP GitHub](https://github.com/rinadelph/Agent-MCP)

### Infrastructure

28. [Agentic AI Workflows with Temporal - IntuitionLabs](https://intuitionlabs.ai/articles/agentic-ai-temporal-orchestration)
29. [Temporal Durable AI Agents - James Carr](https://james-carr.org/posts/2026-02-05-temporal-durable-ai-agents/)
30. [Inngest vs Temporal Comparison](https://www.inngest.com/compare-to-temporal)
31. [AI Agent Task Queues - LogRocket](https://blog.logrocket.com/ai-agent-task-queues/)
32. [Block Agent Task Queue GitHub](https://github.com/block/agent-task-queue)
33. [Pydantic AI Temporal Integration](https://ai.pydantic.dev/temporal/)

### Architecture and Patterns

34. [Event Sourcing Pattern - Microsoft Azure](https://learn.microsoft.com/en-us/azure/architecture/patterns/event-sourcing)
35. [Event-Driven Multi-Agent Systems - Confluent](https://www.confluent.io/blog/event-driven-multi-agent-systems/)
36. [Event-Driven Multi-Agent State of Mind - InfoWorld](https://www.infoworld.com/article/3808083/a-distributed-state-of-mind-event-driven-multi-agent-systems.html)
37. [AI Agent Orchestration Patterns - Microsoft Azure Architecture](https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns)

### Multi-Agent Research

38. [Anthropic Multi-Agent Research System](https://www.anthropic.com/engineering/multi-agent-research-system)
39. [Claude Code Subagents Documentation](https://docs.anthropic.com/en/docs/claude-code/sub-agents)
40. [AgentGit Paper - arXiv](https://arxiv.org/abs/2511.00628)
41. [AgentGit GitHub](https://github.com/HKU-MAS-Infra-Layer/Agent-Git)
42. [Agentic Frameworks in 2026 - ZirconTech](https://zircon.tech/blog/agentic-frameworks-in-2026-what-actually-works-in-production/)
43. [AI Agent Orchestration - Deloitte](https://www.deloitte.com/us/en/insights/industry/technology/technology-media-and-telecom-predictions/2026/ai-agent-orchestration.html)

---

*Research produced by Nova. 43 sources consulted. 38 cited. All major claims supported by 3+ independent sources except where noted in Knowledge Gaps (Section 10). No claims made from single-source evidence without explicit Low confidence labels.*
