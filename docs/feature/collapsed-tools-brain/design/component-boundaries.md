# Component Boundaries: Collapsed Tools + Declarative Brain

**Feature**: collapsed-tools-brain
**Date**: 2026-02-22
**Author**: Morgan (nw-solution-architect)

---

## 1. New Files to Create

### Application Core

| File | Purpose | Dependencies |
|------|---------|-------------|
| `src/pact-loader.ts` | Parse YAML frontmatter from PACT.md files. Returns typed pact metadata including context/response field definitions and optional hooks rules. Replaces `src/pact-parser.ts`. | `FilePort`, `yaml` package |
| `src/action-dispatcher.ts` | Accept an action string and params, validate the action, delegate to the appropriate handler module. Single switch/map dispatch. | All handler modules in `src/tools/` |

### MCP Surface

| File | Purpose | Dependencies |
|------|---------|-------------|
| `src/tools/pact-discover.ts` | Handler for `pact_discover`. Reads pacts directory, parses metadata via pact-loader, reads team config, returns catalog. | `pact-loader.ts`, `ConfigPort`, `FilePort`, `GitPort` |
| `src/tools/pact-do.ts` | Handler for `pact_do`. Receives action + params, delegates to action-dispatcher. Thin wrapper providing adapter context. | `action-dispatcher.ts`, all existing handler modules |

### Pacts (new format)

| File | Purpose | Notes |
|------|---------|-------|
| `pacts/ask/PACT.md` | Ask pact in unified format | YAML frontmatter + markdown body |
| `pacts/code-review/PACT.md` | Code review pact in unified format | YAML frontmatter + markdown body |
| `pacts/design-pact/PACT.md` | Design-pact in unified format | YAML frontmatter + markdown body |
| `pacts/sanity-check/PACT.md` | Sanity check pact in unified format | YAML frontmatter + markdown body |

Note: Pacts move from `examples/pacts/` to `pacts/` in the shared repo. The `examples/` prefix was appropriate when pacts were documentation-only; with the new format they are functional artifacts read by the server.

---

## 2. Files to Modify

### MCP Wiring

| File | Current Lines | Change Description |
|------|--------------|-------------------|
| `src/mcp-server.ts` | 299 | Phase 1: Add `pact_discover` and `pact_do` registrations alongside existing 8. Phase 3: Remove the 8 old registrations, keep only the 2 new ones. Net reduction: ~200 lines. |
| `src/server.ts` | 125 | Phase 3: Update `callTool` dispatch to support `pact_discover` and `pact_do`. Old tool names may be retained as aliases during transition or removed entirely. |

### Tool Handlers (Minor)

| File | Current Lines | Change Description |
|------|--------------|-------------------|
| `src/tools/pact-request.ts` | 118 | Replace `getRequiredContextFields` import from old `pact-parser.ts` with equivalent from new `pact-loader.ts`. Behavioral contract unchanged. |
| `src/tools/pact-inbox.ts` | 193 | Replace `parsePactMetadata` import from old `pact-parser.ts` with equivalent from new `pact-loader.ts`. Behavioral contract unchanged. |

### Test Files

| File | Change Description |
|------|-------------------|
| `tests/acceptance/pact-pacts.test.ts` | Phase 3: Migrate from `pact_pacts` tool calls to `pact_discover` calls. Assertions on response shape will change to match new catalog format. |
| `tests/acceptance/pact-request.test.ts` | Phase 3: Migrate from `pact_request` to `pact_do({ action: "send", ... })`. Handler assertions unchanged. |
| `tests/acceptance/pact-inbox.test.ts` | Phase 3: Migrate from `pact_inbox` to `pact_do({ action: "inbox" })`. Handler assertions unchanged. |
| `tests/unit/pact-parser.test.ts` | Phase 3: Replace entirely with `tests/unit/pact-loader.test.ts`. New tests validate YAML frontmatter parsing. |

### Example Pacts

| File | Change Description |
|------|-------------------|
| `examples/pacts/*/PACT.md` | Convert to YAML frontmatter format OR keep as legacy reference alongside new `pacts/` directory. |

---

## 3. Files to Delete

| File | Current Lines | Reason |
|------|--------------|--------|
| `src/pact-parser.ts` | 291 | Replaced by `src/pact-loader.ts`. Heuristic markdown parsing eliminated. |
| `src/tools/pact-pacts.ts` | 82 | Replaced by `src/tools/pact-discover.ts`. Enumerated pact listing eliminated. |
| `examples/pacts/*/schema.json` | 4 files | Schema content absorbed into PACT.md YAML frontmatter. No longer separate files. |

---

## 4. Dependency Order for Implementation

Implementation should proceed in this order. Each step is independently testable.

### Step 1: Pact Loader (no MCP surface changes)

Create `src/pact-loader.ts`. This module has no dependents yet -- it can be developed and unit-tested in isolation.

- Accepts `FilePort` and pact directory name
- Reads `PACT.md`, extracts YAML frontmatter, parses it
- Returns typed metadata: name, version, description, when_to_use, context_fields, response_fields, hooks
- Returns undefined for missing or malformed PACT.md files (same contract as old parser)
- Target: >90% mutation score

### Step 2: Pacts Migration

Convert the 4 example pacts to the new YAML frontmatter format. Place them in `pacts/` (not `examples/pacts/`).

- Validate that pact-loader correctly parses each converted pact
- Verify round-trip: old parser output matches new loader output for the same pact content

### Step 3: Discovery Handler

Create `src/tools/pact-discover.ts`.

- Uses pact-loader to build the pacts catalog
- Uses ConfigPort to read team members
- Returns the `{ pacts, team }` response shape
- Unit-testable with in-memory FilePort

### Step 4: Action Dispatcher

Create `src/action-dispatcher.ts`.

- Maps action strings to handler functions
- Validates action is known before dispatch
- Returns handler result or throws on unknown action
- Unit-testable with mock handlers

### Step 5: Do Handler

Create `src/tools/pact-do.ts`.

- Extracts `action` from params
- Delegates to action-dispatcher
- Thin wrapper, minimal logic

### Step 6: MCP Registration (Additive)

Modify `src/mcp-server.ts` to register `pact_discover` and `pact_do` alongside existing 8 tools.

- All 10 tools registered
- Existing tests pass
- New acceptance tests pass for collapsed surface

### Step 7: Handler Import Migration

Update `pact-request.ts` and `pact-inbox.ts` to import from `pact-loader.ts` instead of `pact-parser.ts`.

- Behavioral equivalence verified by existing tests
- No test modifications needed at this step

### Step 8: Test Migration

Migrate acceptance tests from old tool names to collapsed tool names.

- `pact_request` calls become `pact_do({ action: "send", ... })`
- `pact_pacts` calls become `pact_discover`
- Handler assertions remain identical

### Step 9: Removal

Delete old files: `pact-parser.ts`, `pact-pacts.ts`, `schema.json` files.

- Remove 8 old tool registrations from `mcp-server.ts`
- Update `server.ts` test factory
- Update ADR-010 and ADR-011 status to Superseded

---

## 5. Module Dependency Graph (Post-Migration)

```
src/mcp-server.ts
  --> src/tools/pact-discover.ts
        --> src/pact-loader.ts --> FilePort
        --> ConfigPort
        --> GitPort
  --> src/tools/pact-do.ts
        --> src/action-dispatcher.ts
              --> src/tools/pact-request.ts --> GitPort, ConfigPort, FilePort, pact-loader
              --> src/tools/pact-inbox.ts --> GitPort, FilePort, pact-loader
              --> src/tools/pact-respond.ts --> GitPort, ConfigPort, FilePort
              --> src/tools/pact-status.ts --> GitPort, FilePort
              --> src/tools/pact-thread.ts --> GitPort, FilePort
              --> src/tools/pact-cancel.ts --> GitPort, FilePort, find-pending-request
              --> src/tools/pact-amend.ts --> GitPort, FilePort, find-pending-request
```

### Preserved Modules (unchanged)

```
src/ports.ts (interfaces)
src/schemas.ts (Zod schemas)
src/adapters/git-adapter.ts
src/adapters/config-adapter.ts
src/adapters/file-adapter.ts
src/request-id.ts
src/logger.ts
src/index.ts
src/tools/find-pending-request.ts
```
