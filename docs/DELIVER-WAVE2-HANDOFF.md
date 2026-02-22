# DELIVER Wave 2 Handoff — GARP Phase 2 Polish

## Quick Start

Paste this into a fresh context window:

```
Implement GARP Phase 2 Polish Wave 2 (Lifecycle + Attachments) and Wave 3 (Skills + Convention). Read the handoff below, then start with the key files. @docs/DELIVER-WAVE2-HANDOFF.md
```

---

## What Is GARP

Git-based Agent Request Protocol. A git-backed MCP server for async human+agent coordination. Agents submit structured requests through a shared git repo; recipients pull and respond. The repo IS the server.

- **7 MCP tools**: garp_request, garp_inbox, garp_respond, garp_status, garp_thread (new), + 2 more coming
- **Transport**: Shared git repo (zero infrastructure)
- **Architecture**: Ports-and-adapters, TypeScript, ~1,400 lines
- **Tests**: 96 passing (unit + integration + acceptance)
- **Build**: esbuild, runtime Node.js 20+, deps: MCP SDK, simple-git, Zod 4

## Wave 1 Completed (Thread Foundation)

All 3 stories implemented and passing:

| Story | What Changed | Tests Added |
|-------|-------------|-------------|
| **US-010** Auto thread_id | `garp-request.ts`: `thread_id: params.thread_id ?? requestId`, added thread_id to return value | 2 new, 1 updated |
| **US-009** garp_thread | New `src/tools/garp-thread.ts`: scans pending/completed/cancelled dirs for thread_id matches, pairs with responses, returns chronological history with summary. Wired into `server.ts` + `mcp-server.ts` | 4 new |
| **US-011** Thread-aware inbox | `garp-inbox.ts`: added `InboxThreadGroup` type, groups pending requests by thread_id (2+ = group, 1 = standalone), backward-compatible with missing thread_id | 3 new |

**Test count**: 88 → 96. All passing.

---

## What Remains: Wave 2 + Wave 3

### Wave 2: Lifecycle + Attachments (Steps 4-7)

| Step | Story | Description | New/Modified Files |
|------|-------|-------------|-------------------|
| 4 | **US-013 + US-015 partial** | garp_cancel tool + status="cancelled" update; add cancelled/ to init script; scan cancelled/ in garp_status | `garp-cancel.ts` (new), `garp-status.ts`, `server.ts`, `mcp-server.ts`, `garp-init.sh`, `schemas.ts` |
| 5 | **US-014 + US-015 partial** | garp_amend tool + AmendmentEntry schema; add amendment_count to inbox | `garp-amend.ts` (new), `schemas.ts`, `garp-inbox.ts`, `server.ts`, `mcp-server.ts` |
| 6 | **US-015 remainder** | garp_respond status field consistency (set status="completed" in JSON before git mv) | `garp-respond.ts` |
| 7 | **US-012** | Attachment metadata in inbox entries, absolute attachment paths in garp_status | `garp-inbox.ts`, `garp-status.ts` |

### Wave 3: Skills + Convention (Steps 8-10)

| Step | Story | Description | New Files |
|------|-------|-------------|-----------|
| 8 | **US-017** | Sanity-check SKILL.md | `examples/skills/sanity-check/SKILL.md` |
| 9 | **US-018** | Code-review SKILL.md | `examples/skills/code-review/SKILL.md` |
| 10 | **US-016** | Inbox auto-poll convention doc | `docs/conventions/inbox-autopoll.md` |

---

## Key Files to Read

### Architecture & Design Decisions
| File | What It Contains |
|------|-----------------|
| `docs/feature/phase2-polish/design/architecture-design.md` | All 6 design decisions resolved, C4 diagrams, lifecycle state diagram, 10-step roadmap |
| `docs/feature/phase2-polish/design/data-models.md` | AmendmentEntrySchema, all tool input/output schemas, example JSON envelopes |
| `docs/feature/phase2-polish/design/component-boundaries.md` | New/modified files, dependency order |
| `docs/adrs/adr-008-amendment-data-model.md` | Append-only amendments array design |
| `docs/adrs/adr-009-cancelled-directory-lifecycle.md` | Pre-created cancelled/ with .gitkeep |

### Story Requirements (Wave 2)
| File | What It Contains |
|------|-----------------|
| `docs/requirements/us-013-garp-cancel-tool.md` | garp_cancel story + 5 BDD scenarios |
| `docs/requirements/us-014-garp-amend-tool.md` | garp_amend story + 5 BDD scenarios |
| `docs/requirements/us-015-status-field-consistency.md` | Status consistency fix + 3 BDD scenarios |
| `docs/requirements/us-012-attachment-inbox-paths.md` | Attachment surfacing story + 4 BDD scenarios |

### Story Requirements (Wave 3)
| File | What It Contains |
|------|-----------------|
| `docs/requirements/us-017-sanity-check-skill.md` | Sanity-check skill story + 5 scenarios |
| `docs/requirements/us-018-code-review-skill.md` | Code-review skill story + 5 scenarios |
| `docs/requirements/us-016-inbox-autopoll-convention.md` | Auto-poll convention story + 3 scenarios |

### Implementation (Current Code — Read These First)
| File | What It Contains |
|------|-----------------|
| `src/schemas.ts` | Zod schemas: RequestEnvelope, ResponseEnvelope, TeamConfig, Attachment |
| `src/ports.ts` | Port interfaces: GitPort, ConfigPort, FilePort |
| `src/tools/garp-request.ts` | Request handler (thread_id auto-assign done in Wave 1) |
| `src/tools/garp-inbox.ts` | Inbox handler (thread grouping done in Wave 1) |
| `src/tools/garp-respond.ts` | Respond handler (needs US-015 status update) |
| `src/tools/garp-status.ts` | Status handler (needs cancelled/ scan + attachment paths) |
| `src/tools/garp-thread.ts` | Thread handler (new in Wave 1, read-only tool) |
| `src/server.ts` | Server factory (5 tools wired, needs 2 more) |
| `src/mcp-server.ts` | MCP tool registration (5 tools registered, needs 2 more) |

### Test Patterns (Follow These)
| File | What It Contains |
|------|-----------------|
| `tests/acceptance/garp-respond.test.ts` | Pattern for garp_cancel (similar: validate, move, commit) |
| `tests/acceptance/garp-request.test.ts` | Pattern for testing envelope writes |
| `tests/acceptance/helpers/setup-test-repos.ts` | Test repo setup: bare remote + alice/bob clones |
| `tests/acceptance/helpers/gwt.ts` | Given-When-Then test helpers |

---

## Design Decisions Already Resolved (Do NOT Re-Open)

All 6 open decisions from the DESIGN wave have been resolved:

### DD-1: Thread Grouping (Implemented in Wave 1)
Group within pending/ only. Thread groups emitted when 2+ pending requests share a thread_id. Pre-Phase-2 requests without thread_id treated as standalone.

### DD-2: Amendment Visibility in Inbox
Add `amendment_count: number` to InboxEntry (default 0). Follows the `attachment_count` pattern. Agent calls garp_status for amendment details.

### DD-3: garp_thread Format (Implemented in Wave 1)
Full envelopes + full responses. Thread summary as sibling object. Status derived from directory location, not JSON field.

### DD-4: Cancelled Directory Initialization
Add `.gitkeep` to `requests/cancelled/` in `garp-init.sh`. Matches existing convention. **Note**: Also add cancelled/ to `createTestRepos()` in test helpers so tests work.

### DD-5: Cancel and Amend Parameter Schemas
- **garp_cancel**: `request_id: z.string()`, `reason: z.string().optional()`
- **garp_amend**: `request_id: z.string()`, `fields: z.record(z.string(), z.any())`, `note: z.string().optional()`

### DD-6: Cancelled Status in GarpStatusResult
Add `"cancelled"` to status union: `"pending" | "active" | "completed" | "cancelled"`. Scan order: pending → active → completed → cancelled. Cancelled requests return `{ status: "cancelled", request: <envelope> }` with no response field.

---

## Schema Changes Needed for Wave 2

### Add to `src/schemas.ts`:

```typescript
// New schema
const AmendmentEntrySchema = z.object({
  amended_at: z.string(),
  amended_by: z.string(),
  fields: z.record(z.string(), z.unknown()),
  note: z.string().optional(),
});

// Add to RequestEnvelopeSchema:
amendments: z.array(AmendmentEntrySchema).optional(),
cancel_reason: z.string().optional(),
```

### Update GarpStatusResult type in `garp-status.ts`:
```typescript
status: "pending" | "active" | "completed" | "cancelled"
// Add optional field:
attachment_paths?: Array<{ filename: string; description: string; path: string }>
```

### Update InboxEntry in `garp-inbox.ts`:
```typescript
// Add to InboxEntry:
amendment_count: number
attachments?: Array<{ filename: string; description: string }>

// Add to InboxThreadGroup:
amendment_count: number
```

---

## Implementation Patterns to Follow

### New Tool Pattern (garp_cancel, garp_amend)
Follow `garp-respond.ts` as the template:
1. Validate required fields
2. `git pull`
3. Find request in pending/ (check completed/ and cancelled/ for error messages)
4. Read envelope, validate caller (sender for cancel/amend, recipient for respond)
5. Modify envelope (update status / append amendment)
6. Write updated envelope
7. `git mv` (cancel only — amend stays in pending/)
8. `git add` + `git commit` + `git push`
9. Return structured result

### Commit message conventions:
- `[garp] cancelled: {request_id}`
- `[garp] amended: {request_id}`

### Test setup pattern:
Use `createTestRepos()` for bare remote + alice/bob clones. Use `seedRequest()` helper from `garp-inbox.test.ts` for pre-populating requests. Use `given/when/thenAssert` from `gwt.ts`.

---

## What Is Already Decided (Do Not Re-Open)

Everything from the DESIGN wave handoff, plus:
- garp_thread implemented (scans pending/completed/cancelled, derives status from directory)
- Thread grouping in inbox implemented (pending-only grouping)
- Auto thread_id on garp_request implemented
- Existing architecture: ports-and-adapters, TypeScript, simple-git, Zod, MCP SDK
- No new dependencies for any remaining story

## Previous Wave Artifacts

| Wave | Status | Key Output |
|------|--------|------------|
| DISCOVER | Complete | Problem validation, opportunity tree, lean canvas |
| DISCUSS | Complete | 10 user stories (US-009–018), 5 journey maps, backlog with DoR |
| DESIGN | Complete | Architecture design, 3 ADRs, component boundaries, data models |
| **DELIVER Wave 1** | **Complete** | US-010 + US-009 + US-011 implemented, 96 tests passing |
| **DELIVER Wave 2** | **Starting** | US-013, US-014, US-015, US-012 |
| DELIVER Wave 3 | Pending | US-017, US-018, US-016 |
