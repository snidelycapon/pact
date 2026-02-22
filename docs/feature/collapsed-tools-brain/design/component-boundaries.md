# Component Boundaries: Collapsed Tools + Declarative Brain

**Feature**: collapsed-tools-brain
**Date**: 2026-02-22
**Author**: Morgan (nw-solution-architect)

---

## 1. New Files to Create

### Application Core

| File | Purpose | Dependencies |
|------|---------|-------------|
| `src/skill-loader.ts` | Parse YAML frontmatter from SKILL.md files. Returns typed skill metadata including context/response field definitions and optional brain_processing rules. Replaces `src/skill-parser.ts`. | `FilePort`, `yaml` package |
| `src/action-dispatcher.ts` | Accept an action string and params, validate the action, delegate to the appropriate handler module. Single switch/map dispatch. | All handler modules in `src/tools/` |

### MCP Surface

| File | Purpose | Dependencies |
|------|---------|-------------|
| `src/tools/garp-discover.ts` | Handler for `garp_discover`. Reads skills directory, parses metadata via skill-loader, reads team config, returns catalog. | `skill-loader.ts`, `ConfigPort`, `FilePort`, `GitPort` |
| `src/tools/garp-do.ts` | Handler for `garp_do`. Receives action + params, delegates to action-dispatcher. Thin wrapper providing adapter context. | `action-dispatcher.ts`, all existing handler modules |

### Skill Contracts (new format)

| File | Purpose | Notes |
|------|---------|-------|
| `skills/ask/SKILL.md` | Ask skill in unified format | YAML frontmatter + markdown body |
| `skills/code-review/SKILL.md` | Code review skill in unified format | YAML frontmatter + markdown body |
| `skills/design-skill/SKILL.md` | Design-skill in unified format | YAML frontmatter + markdown body |
| `skills/sanity-check/SKILL.md` | Sanity check skill in unified format | YAML frontmatter + markdown body |

Note: Skills move from `examples/skills/` to `skills/` in the shared repo. The `examples/` prefix was appropriate when skills were documentation-only; with the new format they are functional artifacts read by the server.

---

## 2. Files to Modify

### MCP Wiring

| File | Current Lines | Change Description |
|------|--------------|-------------------|
| `src/mcp-server.ts` | 299 | Phase 1: Add `garp_discover` and `garp_do` registrations alongside existing 8. Phase 3: Remove the 8 old registrations, keep only the 2 new ones. Net reduction: ~200 lines. |
| `src/server.ts` | 125 | Phase 3: Update `callTool` dispatch to support `garp_discover` and `garp_do`. Old tool names may be retained as aliases during transition or removed entirely. |

### Tool Handlers (Minor)

| File | Current Lines | Change Description |
|------|--------------|-------------------|
| `src/tools/garp-request.ts` | 118 | Replace `getRequiredContextFields` import from old `skill-parser.ts` with equivalent from new `skill-loader.ts`. Behavioral contract unchanged. |
| `src/tools/garp-inbox.ts` | 193 | Replace `parseSkillMetadata` import from old `skill-parser.ts` with equivalent from new `skill-loader.ts`. Behavioral contract unchanged. |

### Test Files

| File | Change Description |
|------|-------------------|
| `tests/acceptance/garp-skills.test.ts` | Phase 3: Migrate from `garp_skills` tool calls to `garp_discover` calls. Assertions on response shape will change to match new catalog format. |
| `tests/acceptance/garp-request.test.ts` | Phase 3: Migrate from `garp_request` to `garp_do({ action: "send", ... })`. Handler assertions unchanged. |
| `tests/acceptance/garp-inbox.test.ts` | Phase 3: Migrate from `garp_inbox` to `garp_do({ action: "inbox" })`. Handler assertions unchanged. |
| `tests/unit/skill-parser.test.ts` | Phase 3: Replace entirely with `tests/unit/skill-loader.test.ts`. New tests validate YAML frontmatter parsing. |

### Example Skills

| File | Change Description |
|------|-------------------|
| `examples/skills/*/SKILL.md` | Convert to YAML frontmatter format OR keep as legacy reference alongside new `skills/` directory. |

---

## 3. Files to Delete

| File | Current Lines | Reason |
|------|--------------|--------|
| `src/skill-parser.ts` | 291 | Replaced by `src/skill-loader.ts`. Heuristic markdown parsing eliminated. |
| `src/tools/garp-skills.ts` | 82 | Replaced by `src/tools/garp-discover.ts`. Enumerated skill listing eliminated. |
| `examples/skills/*/schema.json` | 4 files | Schema content absorbed into SKILL.md YAML frontmatter. No longer separate files. |

---

## 4. Dependency Order for Implementation

Implementation should proceed in this order. Each step is independently testable.

### Step 1: Skill Loader (no MCP surface changes)

Create `src/skill-loader.ts`. This module has no dependents yet -- it can be developed and unit-tested in isolation.

- Accepts `FilePort` and skill directory name
- Reads `SKILL.md`, extracts YAML frontmatter, parses it
- Returns typed metadata: name, version, description, when_to_use, context_fields, response_fields, brain_processing
- Returns undefined for missing or malformed SKILL.md files (same contract as old parser)
- Target: >90% mutation score

### Step 2: Skill Contracts Migration

Convert the 4 example skills to the new YAML frontmatter format. Place them in `skills/` (not `examples/skills/`).

- Validate that skill-loader correctly parses each converted skill
- Verify round-trip: old parser output matches new loader output for the same skill content

### Step 3: Discovery Handler

Create `src/tools/garp-discover.ts`.

- Uses skill-loader to build the skills catalog
- Uses ConfigPort to read team members
- Returns the `{ skills, team }` response shape
- Unit-testable with in-memory FilePort

### Step 4: Action Dispatcher

Create `src/action-dispatcher.ts`.

- Maps action strings to handler functions
- Validates action is known before dispatch
- Returns handler result or throws on unknown action
- Unit-testable with mock handlers

### Step 5: Do Handler

Create `src/tools/garp-do.ts`.

- Extracts `action` from params
- Delegates to action-dispatcher
- Thin wrapper, minimal logic

### Step 6: MCP Registration (Additive)

Modify `src/mcp-server.ts` to register `garp_discover` and `garp_do` alongside existing 8 tools.

- All 10 tools registered
- Existing tests pass
- New acceptance tests pass for collapsed surface

### Step 7: Handler Import Migration

Update `garp-request.ts` and `garp-inbox.ts` to import from `skill-loader.ts` instead of `skill-parser.ts`.

- Behavioral equivalence verified by existing tests
- No test modifications needed at this step

### Step 8: Test Migration

Migrate acceptance tests from old tool names to collapsed tool names.

- `garp_request` calls become `garp_do({ action: "send", ... })`
- `garp_skills` calls become `garp_discover`
- Handler assertions remain identical

### Step 9: Removal

Delete old files: `skill-parser.ts`, `garp-skills.ts`, `schema.json` files.

- Remove 8 old tool registrations from `mcp-server.ts`
- Update `server.ts` test factory
- Update ADR-010 and ADR-011 status to Superseded

---

## 5. Module Dependency Graph (Post-Migration)

```
src/mcp-server.ts
  --> src/tools/garp-discover.ts
        --> src/skill-loader.ts --> FilePort
        --> ConfigPort
        --> GitPort
  --> src/tools/garp-do.ts
        --> src/action-dispatcher.ts
              --> src/tools/garp-request.ts --> GitPort, ConfigPort, FilePort, skill-loader
              --> src/tools/garp-inbox.ts --> GitPort, FilePort, skill-loader
              --> src/tools/garp-respond.ts --> GitPort, ConfigPort, FilePort
              --> src/tools/garp-status.ts --> GitPort, FilePort
              --> src/tools/garp-thread.ts --> GitPort, FilePort
              --> src/tools/garp-cancel.ts --> GitPort, FilePort, find-pending-request
              --> src/tools/garp-amend.ts --> GitPort, FilePort, find-pending-request
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
