# DESIGN Wave Handoff — PACT Phase 2 Polish

## Quick Start

Paste this into a fresh context window:

```
/nw:design PACT Phase 2 Polish — design the architecture for 10 enhancement stories (US-009 through US-018) extending the existing PACT MCP server. Read the handoff below, then start with the key files.
```

---

## What Is PACT

Protocol for Agent Context Transfer. A git-backed MCP server for async human+agent coordination. Agents submit structured requests through a shared git repo; recipients pull and respond. The repo IS the server.

- **4 MCP tools**: pact_request, pact_inbox, pact_respond, pact_status
- **Transport**: Shared git repo (zero infrastructure)
- **Architecture**: Ports-and-adapters, TypeScript, ~1,260 lines
- **Tests**: 88 passing (unit + integration + acceptance)
- **Build**: esbuild, runtime Node.js 20+, deps: MCP SDK, simple-git, Zod 4

## What's Being Designed

Phase 2 adds 3 new tools, modifies 4 existing tools, adds 2 pacts, and 1 convention document.

### The 10 Stories (all DoR-validated, all have BDD scenarios)

| ID | Title | Type | Priority | Size |
|----|-------|------|----------|------|
| **US-010** | Auto-assign thread_id on pact_request | Modify existing | P1 | 1 day |
| **US-009** | pact_thread tool (view thread history) | New tool | P1 | 1-2 days |
| **US-011** | Thread-aware inbox (group by thread) | Modify existing | P1 | 1-2 days |
| **US-012** | Attachment details in inbox + paths in status | Modify existing | P3 | 1 day |
| **US-013** | pact_cancel tool | New tool | P4 | 1-2 days |
| **US-014** | pact_amend tool | New tool | P4 | 1-2 days |
| **US-015** | Status field consistency fix | Modify existing | P4 | 0.5 days |
| **US-016** | Inbox auto-poll convention | Docs only | P5 | 0.5 days |
| **US-017** | Sanity-check pact | New PACT.md | P6 | 0.5 days |
| **US-018** | Code-review pact | New PACT.md | P6 | 0.5 days |

### Dependency Graph

```
US-010 (Auto thread_id)
  |
  +---> US-009 (pact_thread)
  +---> US-011 (Thread-aware inbox)

US-013 (pact_cancel) --+
US-014 (pact_amend)  --+--> US-015 (Status consistency)

US-012 (Attachment inbox+status) ---> US-018 (Code-review pact)

US-016, US-017 — standalone, no dependencies
```

### Implementation Waves

- **Wave 1** (Thread Foundation): US-010 → US-009 + US-011
- **Wave 2** (Lifecycle + Attachments): US-013 + US-014 → US-015, US-012
- **Wave 3** (Pacts + Convention): US-017, US-018, US-016

## Key Files to Read

### Architecture & Requirements
| File | What It Contains |
|------|-----------------|
| `docs/requirements/backlog-phase2-polish.md` | Story map, dependency graph, DoR, design decisions needed |
| `docs/requirements/us-009-pact-thread-tool.md` | pact_thread tool story + BDD |
| `docs/requirements/us-010-auto-thread-id.md` | Auto thread_id story + BDD |
| `docs/requirements/us-011-thread-aware-inbox.md` | Thread-aware inbox story + BDD |
| `docs/requirements/us-012-attachment-inbox-paths.md` | Attachment surfacing story + BDD |
| `docs/requirements/us-013-pact-cancel-tool.md` | pact_cancel story + BDD |
| `docs/requirements/us-014-pact-amend-tool.md` | pact_amend story + BDD |
| `docs/requirements/us-015-status-field-consistency.md` | Status fix story + BDD |
| `docs/requirements/us-016-inbox-autopoll-convention.md` | Auto-poll convention story |
| `docs/requirements/us-017-sanity-check-pact.md` | Sanity-check pact story |
| `docs/requirements/us-018-code-review-pact.md` | Code-review pact story |
| `docs/architecture/architecture.md` | Existing C4 architecture diagrams |
| `docs/adrs/` | 6 ADRs (git transport, single PACT.md, stdio MCP, etc.) |

### Implementation (Current Code)
| File | What It Contains |
|------|-----------------|
| `src/schemas.ts` | Zod schemas: RequestEnvelope, ResponseEnvelope, TeamConfig, Attachment |
| `src/ports.ts` | Port interfaces: GitPort, ConfigPort, FilePort |
| `src/tools/pact-request.ts` | Request handler (thread_id + attachments already implemented) |
| `src/tools/pact-inbox.ts` | Inbox handler (short_id, thread_id, attachment_count already implemented) |
| `src/tools/pact-respond.ts` | Respond handler (moves pending → completed) |
| `src/tools/pact-status.ts` | Status handler (searches pending/active/completed) |
| `src/mcp-server.ts` | MCP tool registration with Zod parameter schemas |
| `src/server.ts` | Server factory (lazy adapter creation, callTool dispatch) |
| `src/request-id.ts` | Request ID generation: req-{date}-{time}-{userId}-{hex} |

### UX Journeys (From DISCUSS Wave)
| File | What It Contains |
|------|-----------------|
| `docs/ux/phase2-polish/journey-thread-management-visual.md` | Thread management flow |
| `docs/ux/phase2-polish/journey-thread-management.feature` | 8 Gherkin scenarios |
| `docs/ux/phase2-polish/journey-attachment-consumer-visual.md` | Attachment consumer flow |
| `docs/ux/phase2-polish/journey-attachment-consumer.feature` | 5 Gherkin scenarios |
| `docs/ux/phase2-polish/journey-request-lifecycle-visual.md` | Cancel + amend flow |
| `docs/ux/phase2-polish/journey-request-lifecycle.feature` | 10 Gherkin scenarios |

## Design Decisions Needed

These are explicitly called out in the backlog as needing resolution during DESIGN:

1. **Thread grouping algorithm** — threads where both parties send requests (e.g., design-pact rounds)
2. **Amendment visibility** — should inbox show an "amended" indicator?
3. **pact_thread output format** — full envelopes vs summary fields per entry
4. **Cancelled directory initialization** — .gitkeep in pact-init.sh or create on first cancel
5. **pact_cancel and pact_amend parameter schemas** — exact Zod definitions for MCP tool registration
6. **Cancelled status in PactStatusResult** — add "cancelled" to the type union

## What Is Already Decided (Do Not Re-Open)

- 3 new MCP tools: pact_thread, pact_cancel, pact_amend
- Append-only amendment design (amendments array, never overwrite context_bundle)
- Sender-only gate for cancel and amend
- Pending-only gate for cancel and amend
- New directory: requests/cancelled/
- thread_id auto-assignment: thread_id = request_id when not provided
- Every new request always has a thread_id after US-010
- Attachment metadata in envelope (filename + description, not content)

## Previous Wave Artifacts

| Wave | Status | Key Output |
|------|--------|------------|
| DISCOVER | Complete | Problem validation, opportunity tree, lean canvas, solution testing |
| DISCUSS | Complete | 10 user stories (US-009–018), 5 journey maps, backlog with DoR |
| **DESIGN** | **Starting** | Architecture for Phase 2 enhancement batch |
