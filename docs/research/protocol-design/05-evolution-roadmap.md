# Evolution Roadmap: From Current State to Full Vision

**Date**: 2026-02-22
**Status**: Active working document
**Depends on**: All prior documents in this series

---

## 1. Current State Assessment

### 1.1 What Exists and Maps Perfectly

The current codebase (22 source files, 28 test files, all passing) implements the core protocol loop:

| Component | File(s) | Status | Alignment with Vision |
|---|---|---|---|
| **Pacts** | `pact-loader.ts`, `examples/pacts/*/PACT.md` | Working | Core differentiator. Formalize into spec. |
| **Request envelope** | `schemas.ts` (RequestEnvelopeSchema) | Working | Keep. Formalize PACT-native envelope spec. |
| **Response envelope** | `schemas.ts` (ResponseEnvelopeSchema) | Working | Keep. |
| **Send request** | `pact-request.ts` | Working | Keep, add lifecycle hook point. |
| **Respond** | `pact-respond.ts` | Working | Keep, add on_respond hook point. |
| **Check inbox** | `pact-inbox.ts` | Working | Keep. |
| **Amend request** | `pact-amend.ts` | Working | Differentiator. Keep. |
| **Cancel request** | `pact-cancel.ts` | Working | Keep. |
| **Check status** | `pact-status.ts` | Working | Keep. |
| **View thread** | `pact-thread.ts` | Working | Keep. |
| **Action dispatcher** | `action-dispatcher.ts` | Working | Keep. |
| **2 collapsed MCP tools** | `mcp-server.ts`, `pact-discover.ts`, `pact-do.ts` | Working | Keep. |
| **Ports & Adapters** | `ports.ts`, `adapters/` | Working | Foundation for Transport SPI. |
| **Team config** | `config-adapter.ts` | Working | Extend with teams/groups. |
| **Request ID generation** | `request-id.ts` | Working | Keep. |
| **Structured logging** | `logger.ts` | Working | Keep. |

### 1.2 What Needs Refactoring

| What | Why | Scope |
|---|---|---|
| Handlers call git/file primitives directly | Need Transport SPI abstraction | Medium refactor (all 7 handlers) |
| Config has flat members only | Need teams/groups/routing | Additive (non-breaking) |
| No lifecycle hook points | Need extension points at lifecycle stages (on_send, on_respond, etc.) | Medium (add hook points to handlers) |
| Pact format is informal | Need formal spec with JSON Schema | Documentation + validation code |
| Envelope is custom but undocumented | Need formal PACT envelope spec | Documentation + schema formalization |

### 1.3 What's New Work

| What | Why | Scope |
|---|---|---|
| Transport SPI interface | Decouples protocol from transport | New interface + GitTransport wrapper |
| Lifecycle hooks schema | Defines hook declaration format in pacts | Spec + schema + parsing in pact-loader |
| Hook points in handlers | Extension points where executors can fire hooks | Additions to send/respond/amend/cancel handlers |
| HTTP Transport | Adoption unlock | New transport implementation |
| A2A Bridge | Ecosystem interop | New transport implementation |

### 1.4 What Shifts Priority

| What | Old Priority | New Priority | Why |
|---|---|---|---|
| Lifecycle hooks | Deprioritized | **P1** (core differentiator) | It's what makes PACT more than a message pipe |
| Transport SPI | Not planned | **P0** (architectural foundation) | Unblocks everything |
| Branch-per-user | High | **P3** (git transport enhancement) | Important but transport-specific |
| HTTP Transport | Not planned | **P2** (adoption) | Opens PACT to non-git teams |
| A2A Bridge | Not planned | **P3** (interop) | After HTTP exists |

---

## 2. Phased Roadmap

### Phase 0: Formalize the Protocol (Spec Work)

**Goal**: Write down what PACT IS before building more of it.

**Deliverables**:
- [ ] Pact Specification (formal YAML frontmatter schema, JSON Schema for bundles, hooks declaration schema, semver policy)
- [ ] Envelope Specification (PACT-native format: sender, recipient, pact, threading, lifecycle, flags)
- [ ] Lifecycle State Machine (formal stages, transitions, who can trigger what, where hooks fire)
- [ ] Hook Declaration Schema (required fields: id + description; recommended optional fields: condition, failure, etc.; open for team-defined fields)

**Why first**: These specs are the portable, publishable artifacts. They exist independently of any transport or implementation. Getting them right shapes everything that follows.

**Does NOT require code changes.** This is documentation and schema design.

**Estimated scope**: Spec documents + JSON Schema files for validation.

---

### Phase 1: Transport SPI Extraction (Architectural Refactor)

**Goal**: Decouple protocol logic from git operations. All existing tests pass unchanged.

**Deliverables**:
- [ ] `TransportSPI` interface (abstract: send, receive, listInbox, discover, sync, etc.)
- [ ] `GitTransport` implementation (wraps existing GitAdapter + FileAdapter + ConfigAdapter)
- [ ] Refactor all 7 handlers to call TransportSPI instead of git/file primitives
- [ ] Transport selection via config or environment variable
- [ ] All 27+ acceptance tests pass with GitTransport (zero behavior change)

**Key constraint**: This is a **refactoring**, not a rewrite. The logic inside each handler stays the same. The abstraction layer moves up from git/file primitives to transport operations.

**Risk**: Handler logic is currently interleaved with git operations (e.g., `pact-respond.ts` does readJSON -> update status -> writeJSON -> git mv -> add -> commit -> push as sequential steps). Extracting this into a single `transport.moveToCompleted(requestId, responseEnvelope)` call requires careful refactoring.

**Estimated scope**: Moderate. ~1-2 sessions of focused refactoring work.

---

### Phase 2: Lifecycle Hooks (Core Differentiator)

**Goal**: Pacts can declare hooks at lifecycle stages. The protocol provides the schema, the hook points in handlers, and a reference executor implementation.

**Deliverables**:
- [ ] Hook declaration schema (parsed from pact YAML frontmatter)
- [ ] Hook points in handlers: `pact-request.ts` (on_send), `pact-respond.ts` (on_respond), `pact-amend.ts` (on_amend), `pact-cancel.ts` (on_cancel)
- [ ] Hook execution interface (how an executor is invoked at a hook point)
- [ ] Hook execution report (returned to human showing what hooks fired and what happened)
- [ ] Dry-run mode (preview what hooks would fire without sending)
- [ ] `pact-loader.ts` extended to parse `hooks:` from YAML frontmatter
- [ ] `schemas.ts` extended with HookDeclaration schema
- [ ] Reference executor: a minimal implementation that demonstrates firing hooks (e.g., logging, simple template-based notifications)

**What Phase 2 does NOT include**:
- PACT-defined action types (enrich, route, flag, etc.) -- these are team-defined, not protocol-defined
- An LLM-powered executor -- that's an infrastructure choice, not a protocol feature
- MCP tool integration for hooks -- the executor uses whatever tools it has access to

**Implementation approach**:
1. Define the hook declaration schema and add parsing to pact-loader
2. Add hook points to handlers (extension points where executors can be called)
3. Build a minimal reference executor that demonstrates the pattern
4. Dry-run mode and execution reports

**Estimated scope**: Medium. The protocol changes are well-scoped. Sophisticated executors are team infrastructure, not PACT code.

---

### Phase 3: Team Routing (First New Feature)

**Goal**: Requests can be addressed to teams, with configurable distribution.

**Deliverables**:
- [ ] Extended config.json schema (teams, groups, roles, routing strategies)
- [ ] Fan-out routing (one request -> multiple inbox entries for team members)
- [ ] Round-robin routing (one request -> one member, rotating)
- [ ] First-available routing (one request -> first member who claims it)
- [ ] Role-based routing (e.g., "send to whoever has role: security-lead")
- [ ] Routing as a lifecycle stage where hooks can fire (on_route)

**Depends on**: Phase 1 (Transport SPI, for clean routing abstraction). Phase 2 is helpful (hooks at on_route stage) but not strictly required -- routing can work without hooks.

**Estimated scope**: Medium. Config extension + routing logic + acceptance tests.

---

### Phase 4: HTTP Transport (Adoption Unlock)

**Goal**: Teams without a shared git repo can use PACT.

**Deliverables**:
- [ ] `HttpTransport` implementing TransportSPI
- [ ] REST API surface (see `03-transport-and-interop.md` for endpoints)
- [ ] SSE for real-time inbox updates
- [ ] SQLite backing store (self-hosted) / Postgres (cloud)
- [ ] OAuth 2.0 / OIDC authentication
- [ ] Docker container for self-hosted deployment
- [ ] Same pacts, envelopes, lifecycle, hooks -- different wire

**Depends on**: Phase 1 (Transport SPI must exist for HTTP to implement it).

**Estimated scope**: Large. New server, new persistence, new auth. But the protocol core is already defined.

---

### Phase 5: Interop & Ecosystem (Reach)

**Goal**: PACT teams can interact with the broader agent ecosystem.

**Deliverables**:
- [ ] A2A Bridge transport (PACT <-> A2A translation)
- [ ] Publish Pact spec as an open standard
- [ ] Cloud-hosted PACT option (managed, zero-ops)

**Depends on**: Phase 4 (HTTP transport, since A2A is HTTP-based).

**Estimated scope**: Large. Multiple independent workstreams.

---

## 3. What Can Run In Parallel

```
Phase 0 (Spec) ------------------------------------------+
                                                          |
Phase 1 (Transport SPI) ---------+                       |
                                  +-- Phase 3 (Teams)     |
Phase 2 (Lifecycle Hooks) -------+                       |
                                                          |
Phase 4 (HTTP Transport) <- depends on Phase 1            |
                                                          |
Phase 5 (Interop) <- depends on Phase 4                   |
                                                          |
All phases reference Phase 0 specs -----------------------+
```

- **Phase 0 and Phase 1** can run in parallel (spec is docs; SPI is code)
- **Phase 2** can start as soon as Phase 1 creates hook points in handlers
- **Phase 3** depends on Phase 1; benefits from Phase 2 but doesn't strictly require it
- **Phase 4** depends on Phase 1
- **Phase 5** depends on Phase 4

---

## 4. Codebase Impact Map

### Files That Stay Unchanged
- `logger.ts` -- logging is transport-agnostic
- `request-id.ts` -- ID generation is transport-agnostic
- `action-dispatcher.ts` -- action routing is transport-agnostic
- `mcp-server.ts` -- MCP registration (may add transport config param)
- Most test infrastructure (helpers, GWT)

### Files That Get Refactored (Phase 1)
- `ports.ts` -> add TransportSPI interface
- `pact-request.ts` -> call transport.sendRequest() instead of git/file primitives
- `pact-respond.ts` -> call transport.sendResponse() + transport.moveToCompleted()
- `pact-inbox.ts` -> call transport.listInbox()
- `pact-status.ts` -> call transport.getRequest()
- `pact-cancel.ts` -> call transport.cancelRequest()
- `pact-amend.ts` -> call transport.amendRequest()
- `pact-thread.ts` -> call transport.getThread()
- `pact-discover.ts` -> call transport.discoverPacts() + transport.discoverTeam()

### Files That Get Extended (Phase 2)
- `pact-request.ts` -> add lifecycle hook point after validation, before send
- `pact-respond.ts` -> add lifecycle hook point after response composition
- `pact-amend.ts` -> add lifecycle hook point after amendment
- `pact-cancel.ts` -> add lifecycle hook point after cancellation
- `pact-loader.ts` -> parse `hooks:` from YAML frontmatter
- `schemas.ts` -> add HookDeclaration schema

### New Files
- `src/transport.ts` -> TransportSPI interface
- `src/transports/git-transport.ts` -> GitTransport (wraps existing adapters)
- `src/transports/http-transport.ts` -> HttpTransport (Phase 4)
- `src/transports/a2a-bridge.ts` -> A2ABridge (Phase 5)
- `src/hooks/hook-runner.ts` -> Hook execution interface (calls executor at hook points)
- `src/hooks/reference-executor.ts` -> Reference executor implementation

---

## 5. Definition of Done (Per Phase)

### Phase 0: Formalize
- [ ] Spec documents written and reviewed
- [ ] JSON Schema files for pact validation (including hooks declaration)
- [ ] JSON Schema for PACT envelope format
- [ ] At least one example pact fully specced with hooks

### Phase 1: Transport SPI
- [ ] TransportSPI interface defined
- [ ] GitTransport passes ALL existing acceptance tests
- [ ] No handler directly imports git-adapter, file-adapter, or config-adapter
- [ ] Transport selection is configurable (env var or config)

### Phase 2: Lifecycle Hooks
- [ ] Hook declaration schema defined and parsed from pacts
- [ ] Hook points exist in all lifecycle handlers (send, respond, amend, cancel)
- [ ] Hook execution report visible in send/respond output
- [ ] Dry-run mode functional
- [ ] Reference executor demonstrates the pattern
- [ ] Example pact with hooks demonstrates the feature

### Phase 3: Team Routing
- [ ] config.json supports teams with routing strategies
- [ ] Fan-out routing working (request -> N inbox entries)
- [ ] on_route hook point exists for routing-stage hooks

### Phase 4: HTTP Transport
- [ ] HttpTransport passes same acceptance tests as GitTransport
- [ ] REST API documented
- [ ] Docker container available for self-hosted
- [ ] OAuth working

### Phase 5: Interop
- [ ] A2A Agent Card generated from pacts
- [ ] External A2A agent can send task to PACT
- [ ] Pact spec published as open standard

---

## 6. Open Questions for Roadmap

### Sequencing
- Should Phase 2 (hooks) start before Phase 1 (transport SPI) is fully complete? Hooks are the "why" of PACT; waiting for transport refactoring feels like it delays the value proposition.
- Counter-argument: hooks need clean extension points in handlers, which Phase 1 creates.
- Possible compromise: start Phase 2 schema/spec work alongside Phase 1 implementation.

### Scope Control
- Phase 2 is well-scoped because PACT only defines the hook schema and hook points -- not action types, not executors, not the LLM integration. The risk of unbounded complexity shifts from the protocol to the team's executor implementation, which is intentional.

### Backwards Compatibility
- When envelope format changes (Phase 0 spec), do we need migration for existing repos?
- Proposal: Version the envelope format. Support reading v1 (current) and writing v2 (formalized).

### Resolved Questions

**Q: Who pays for hook execution?**
A: Each executor pays for what it executes. The sender's executor pays for on_send hooks. The routing layer pays for on_route hooks. The recipient's executor pays for on_respond hooks. There is no shared cost pool unless the team explicitly creates one.

**Q: How does the executor access MCP tools?**
A: PACT doesn't define an executor. The executor is team infrastructure. A local daemon uses whatever tools, APIs, and credentials the user has configured. The agent-as-executor uses its own MCP tools. PACT doesn't need to know.

**Q: Naming?**
A: Resolved. PACT: Protocol for Agent Context Transfer. See `naming-conventions.md`.
