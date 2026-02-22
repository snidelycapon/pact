# PACT Positioning & Identity

**Date**: 2026-02-22
**Status**: Active working document
**Supersedes**: Parts of `pact-positioning-and-interop.md` (positioning sections)

---

## 1. What PACT Is

PACT is a **structured collaboration protocol for human teams, accessed natively through their AI agents**.

It is NOT:
- An agent-to-agent protocol (like A2A)
- An agent orchestration framework (like CrewAI, LangGraph)
- A chatbot or conversational AI tool
- A project management tool (like Linear, Jira)
- A service, product, or platform -- it's a protocol

It IS:
- The concept of structured mail between human workspaces
- A team-defined vocabulary of structured message types
- A lifecycle with declared hook points for team-defined processing
- An agent-native interface for human async collaboration

**The key distinction**: PACT is not a postal service. It's not the mail carrier, the sorting facility, or the delivery truck. PACT is the **concept of mail** -- the envelope format, the addressing scheme, the lifecycle states, the declaration that "this type of mail can be processed in these ways at these stages." What processing actually happens, and what infrastructure executes it, is the team's responsibility.

### 1.1 The Core Interaction

```
1. Cory is working with his agent (Claude Code, Codex, whatever)
2. Cory needs to send Dan a structured request -- a sanity-check, a code review,
   a question with attached files and specs
3. Their team has defined "sanity-check" as a pact:
   - What fields are required (typed context bundle)
   - What response is expected (typed response bundle)
   - What lifecycle hooks are declared (team-defined processing at each stage)
4. Cory's agent reads the pact's on_compose hooks and acts on them
   (validation, enrichment, recipient suggestions -- whatever the team declared)
5. Cory composes and sends via MCP without leaving his agent session
6. The pact's on_send hooks fire in whatever executor the sender has
   configured (the agent itself, a local daemon, nothing at all)
7. The message reaches the transport layer, which fires on_route hooks if
   a routing executor exists (fan-out, team distribution, etc.)
8. Dan's agent shows him the request in his inbox with full structured context
9. Dan takes that context bundle and loads it wherever/however he needs --
   his own workspace, his own tools, his own methodology
10. Dan responds through his agent -- the response follows the pact schema
11. The on_respond hooks fire in Dan's executor
12. Everything is auditable in the shared backing store
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
       |     (the only shared thing)           |
       |                                       |
       |  +------------------------------+     |
       |  | Pacts (vocabulary)           |     |
       |  | Lifecycle Hooks (declared)   |     |
       |  | Team Config (membership)     |     |
       |  | Message History (audit)      |     |
       |  +------------------------------+     |
       |                                       |
       +============ Transport Layer ==========+
              (Git, HTTP, A2A bridge, etc.)
```

**PACT does not dictate:**
- What agent you use
- What tools you have in your workspace
- How you organize your work
- What you do with received context bundles
- What LLM provider you use
- What infrastructure executes lifecycle hooks
- What specific actions hooks perform

**PACT defines:**
- The **pact schema** (the shape of team-defined message contracts)
- The **envelope format** (who, to whom, what type, threading)
- The **lifecycle stages** (compose, send, route, deliver, read, respond, amend, cancel)
- The **hook declaration schema** (extension points at each lifecycle stage for team-defined processing)
- The **lifecycle semantics** (state transitions, who can trigger what)
- The **delivery guarantees** (at-least-once, auditable)

### 1.3 The Postal Analogy (Refined)

PACT is not a postal service. PACT is the **concept of mail itself** -- the set of standards that makes postal services possible:

| Concept of Mail | PACT Equivalent |
|---|---|
| Letter format standards | Pact schemas (typed bundles) |
| Addressing conventions | Envelope format (sender, recipient, threading) |
| Mail types (registered, express, certified) | Pact types (code-review, sanity-check, etc.) |
| "This type of mail gets inspected at customs" | Lifecycle hooks declared in the pact |
| Delivery lifecycle (sent, in transit, delivered) | Request lifecycle (pending, responded, completed) |
| The idea that mail can be forwarded, returned, amended | Lifecycle semantics (respond, amend, cancel) |

A team *implements* a postal service on top of PACT -- choosing their transport (Git, HTTP), configuring their hook executors (local daemon, CI runner, nothing), and deciding what processing happens at each lifecycle stage. Different teams can build very different postal services from the same protocol.

### 1.4 Why "Through Their Agents" Matters

The agent-native access is not incidental. It's the core UX proposition:

| Without agent-native access | With agent-native access (PACT) |
|---|---|
| Alt-tab to Slack, type message, alt-tab back | "Send Dan a sanity-check with this context" |
| Copy context from editor, paste into Jira | Agent reads your current context, packages it |
| Look up the PR URL, paste it, add description | Agent pulls PR metadata, attaches it |
| Go to Zapier to check what automation runs | Lifecycle hooks are visible in the pact |
| Open email to see if someone responded | "Check my inbox" shows structured responses |

The friction reduction is not just "fewer clicks." It's that the agent can **compose rich, structured context bundles** from the human's current working state -- something no manual tool can do efficiently.

---

## 2. The Three Pillars

### Pillar 1: Pacts (The Vocabulary)

Team-defined, typed message contracts that declare:
- What can be sent (context_bundle schema)
- What is expected back (response_bundle schema)
- What lifecycle hooks exist (team-defined processing declarations at each stage)
- When to use this message type (guidance for agents and humans)

This is PACT's most unique and portable artifact. No other tool or protocol has team-defined typed message contracts with declared lifecycle hooks.

### Pillar 2: Lifecycle Hooks (The Extension Points)

The pact can declare hooks at each lifecycle stage:
- on_compose: validation, enrichment suggestions, recipient guidance
- on_send: enrichment, flagging, notifications
- on_route: fan-out, team distribution, intelligent routing
- on_deliver: inbox preview generation, priority assessment
- on_read: read receipts, sender notification
- on_respond: status updates, notifications, follow-up triggers
- on_amend: re-validation, recipient notification
- on_cancel: cleanup, notification

PACT defines the lifecycle stages and the hook declaration schema. The team defines what hooks exist for each pact. The team's infrastructure executes them. PACT does not prescribe what actions hooks perform, what tools they use, or what infrastructure runs them.

A deployment with no hook executors configured is perfectly valid -- messages flow through the lifecycle with no automated processing. A deployment with a sophisticated local daemon firing LLM-powered enrichment on every send is also valid. PACT doesn't care.

### Pillar 3: Transport Agnosticism (The Reach)

The protocol works over any backing store:
- Git (for teams sharing a repo -- audit trail, offline, zero infrastructure)
- HTTP (for teams without git -- standard REST, real-time capable)
- A2A bridge (for ecosystem interop -- appear as an A2A agent to the outside world)

The pacts and lifecycle hooks are identical across all transports.

---

## 3. Who PACT Is For

### Primary: Software Teams Using AI Agents

- 2-20 people collaborating on software projects
- Each person uses their own AI coding agent (Claude Code, Codex, Gemini CLI, Cursor)
- Need to send structured requests, reviews, questions, context between each other
- Want the option of automation triggered by message lifecycle events
- Already share a git repo (or willing to set up a shared backing store)

### Secondary: Any Knowledge Work Team Using AI Assistants

- The protocol is not code-specific -- pacts can define any message type
- Design review requests, document review, approval workflows, handoffs
- The constraint is that team members use AI agents as their primary interface

### Not For (Today):

- Teams that don't use AI agents/assistants
- Autonomous agent-to-agent coordination (use A2A)
- Real-time chat (use Slack/Teams)
- Project management (use Linear/Jira, but PACT can integrate)

---

## 4. The Value Proposition (One Sentence)

**PACT lets human teams define their own structured collaboration vocabulary -- typed message contracts with lifecycle hook points for team-defined processing -- and use it natively from their AI agents, without leaving their workspace.**

---

## 5. Open Questions

### Team Size Limits
- At what team size does the "everyone sees everything" model break down?
- When do you need per-team isolation vs. whole-team visibility?

### Resolved Questions

**Q: Identity & Naming**
A: Resolved. PACT: Protocol for Agent Context Transfer. See `naming-conventions.md`.

**Q: Where does PACT stop and the workspace begin?**
A: PACT defines the protocol: envelope format, pact schema, lifecycle stages, hook declaration schema. What specific processing hooks perform, what tools they use, and what infrastructure runs them is the team's/workspace's concern. PACT provides the mechanism for lifecycle hooks. The team provides the implementation. This is analogous to how HTTP defines request/response semantics but doesn't dictate what your server does when it receives a request.

**Q: Should PACT have opinions about how context bundles are displayed/loaded?**
A: No. PACT defines the schema of what's in the bundle. The recipient's workspace decides how to present it.
