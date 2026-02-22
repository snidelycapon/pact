# Design Wave Context: Collapsed Tools + Declarative Brain

**Date**: 2026-02-22
**Purpose**: Contextual handoff for a unified design wave that merges the best of Phase A/B learnings with the Tier 2 brain research into a single coherent architecture.
**Status**: Ready for `/design`

---

## What We're Building

A unified GARP architecture where:

1. **Collapsed tool surface** — Instead of N enumerated MCP tools (currently 8, projected 30+), agents discover capabilities through a small API surface and compose requests against it. Token cost stays O(1) regardless of skill count.

2. **Declarative brain processing** — SKILL.md contracts include optional `brain_processing` sections that define validation, enrichment, routing, and auto-response rules. Serverless functions triggered by git events execute these rules. No daemon, no persistent state.

3. **Skills directory as the single source of truth** — Both client-side discovery and server-side brain processing are driven by the same skill contracts. The brain doesn't need a separate config layer; it reads the same SKILL.md that agents and humans use.

---

## What We Know (Validated)

### From Original Discovery (6 rounds of Mom Test questioning)

- **Problem validated from daily lived experience**: Manual context assembly for tech support handoffs is painful, interruptive, and non-agent-native.
- **Git as transport works**: Zero infrastructure cost, free audit trail, append-only design avoids conflicts.
- **Skill contract pattern works**: Rigid envelope + flexible payload, with SKILL.md defining per-type behavior.
- **Two users confirmed**: Cory + Dan completed real round-trips with zero failures.

### From Code Mode Discovery (Phase A)

- **Context pressure grows O(tools + skills)**: At 7 tools + 4 skills = ~2,840 tokens (fine). At 30 tools + 100 skills = ~40,000 tokens = 20% of context (not fine).
- **No discovery mechanism exists**: Agents must know skill names upfront. Works at 4 skills, breaks at 20+.
- **Skills are human-readable only**: SKILL.md content is never parsed by the server beyond checking file existence.
- **Validation as WARN not REJECT** was the right call: Dumb router stays dumb, agents keep autonomy.

### From Beads Evolution Research (Tier 2)

- **Daemon pattern fails at scale**: Beads deleted ~16,000 lines of daemon/sync/dual-backend complexity. Don't build state-management layers on top of git.
- **Brain should be stateless serverless functions**: Triggered by git events, execute declarative rules from SKILL.md, write results back to git, terminate.
- **Git remains canonical**: No separate database, no sync layer, no dual-backend.
- **Skill-specific, not global**: Each skill defines its own brain processing (or none). New behavior = new skill, zero infra code changes.

### From MVP Build Experience

- **Ports-and-adapters architecture is clean**: 3 ports (Git, Config, File), 3 adapters, 8 tool handlers. Easy to test, extend, replace.
- **Test infrastructure is solid**: 179 tests, all using real git repos (no mocks at acceptance level). 519 assertions.
- **Request lifecycle is 3-state**: pending → completed, pending → cancelled, with append-only amendments.
- **Thread grouping works**: Auto thread_id assignment, inbox groups by thread.

---

## What Exists Today (Source Map)

### Core Infrastructure (Keep)

| File | Lines | Purpose |
|------|-------|---------|
| `src/ports.ts` | 48 | GitPort, ConfigPort, FilePort interfaces |
| `src/schemas.ts` | 96 | Zod schemas: RequestEnvelope, ResponseEnvelope, AmendmentEntry, TeamConfig |
| `src/adapters/git-adapter.ts` | 55 | simple-git wrapper with push-retry |
| `src/adapters/config-adapter.ts` | 30 | Team config reader |
| `src/adapters/file-adapter.ts` | 64 | JSON/text file I/O |
| `src/request-id.ts` | 31 | Chronologically-sortable ID generator |
| `src/logger.ts` | 34 | Structured JSON logger to stderr |
| `src/index.ts` | 59 | Production entry point (env vars, stdio transport) |

### Tool Handlers (Evaluate — may collapse)

| File | Lines | Purpose |
|------|-------|---------|
| `src/tools/garp-request.ts` | 118 | Submit request: validate, build envelope, write to pending/, commit, push |
| `src/tools/garp-inbox.ts` | 193 | Read pending/: filter by recipient, thread grouping, skill enrichment |
| `src/tools/garp-respond.ts` | 98 | Respond: write response, mv pending→completed, commit, push |
| `src/tools/garp-status.ts` | 126 | Read: search all dirs for request, return status + envelope |
| `src/tools/garp-thread.ts` | 161 | Read: scan all dirs for thread_id, pair with responses |
| `src/tools/garp-cancel.ts` | 58 | Cancel: validate sender, mv pending→cancelled, commit, push |
| `src/tools/garp-amend.ts` | 76 | Amend: validate sender, append amendment, rewrite, commit, push |
| `src/tools/find-pending-request.ts` | 59 | Shared helper for cancel/amend (find + validate ownership) |

### MCP Wiring (Will change with collapsed surface)

| File | Lines | Purpose |
|------|-------|---------|
| `src/mcp-server.ts` | 299 | 8 MCP tool registrations with Zod input schemas, lazy adapter init |
| `src/server.ts` | 125 | Test-facing factory: `createGarpServer` → `callTool` dispatch |

### Phase A Additions (Disposable — to be rethought)

| File | Lines | Purpose | Disposition |
|------|-------|---------|-------------|
| `src/skill-parser.ts` | 291 | SKILL.md + schema.json parsing (57 surviving mutants, 63% mutation score) | **Rip out and redesign** |
| `src/tools/garp-skills.ts` | 82 | MCP tool: list/search skills with metadata | **Rip out — replaced by collapsed discovery** |

### Phase A Modifications to Existing Files (Review)

| File | What Changed | Disposition |
|------|-------------|-------------|
| `garp-request.ts` | Schema validation via skill-parser → `validation_warnings` | **Keep the WARN pattern, rethink implementation** |
| `garp-inbox.ts` | Skill enrichment: `skill_description`, `response_fields`, per-invocation cache | **Remove enrichment coupling to old parser** |
| `mcp-server.ts` | Registered `garp_skills` as 8th tool | **Will be rewritten for collapsed surface** |
| `src/ports.ts` | Added `readText(path)` and `fileExists(path)` to FilePort | **Keep — these fix a prior port violation** |
| `src/adapters/file-adapter.ts` | Implemented `readText` and `fileExists` | **Keep** |

### Skill Contracts (Redesign format)

| File | Purpose | Disposition |
|------|---------|-------------|
| `examples/skills/ask/SKILL.md` | Simple Q&A skill | **Rewrite for new format** |
| `examples/skills/design-skill/SKILL.md` | Multi-round design workflow | **Rewrite for new format** |
| `examples/skills/sanity-check/SKILL.md` | Tech support handoff | **Rewrite for new format** |
| `examples/skills/code-review/SKILL.md` | Code review with attachments | **Rewrite for new format** |
| `examples/skills/*/schema.json` | JSON Schema companions (Phase A) | **Evaluate — may merge into SKILL.md format** |

---

## What's Disposable vs Durable

### Durable (Carry Forward)

- **Ports-and-adapters architecture** — GitPort, ConfigPort, FilePort interfaces and their implementations
- **Protocol schemas** — RequestEnvelope, ResponseEnvelope, AmendmentEntry (Zod)
- **Request lifecycle** — pending/completed/cancelled directories, append-only amendments
- **Git transport** — pull-rebase-retry, atomic commits, `[garp]` commit tags
- **WARN not REJECT** — validation warnings are advisory, requests always submit
- **`additionalProperties: true`** — schemas enforce minimum contracts, creative extension allowed
- **Thread grouping** — auto thread_id, grouping by thread in reads
- **FilePort extensions** — `readText()` and `fileExists()` (ADR-012)
- **Test infrastructure** — real git repos, no mocks at acceptance level
- **179 passing tests** — behavioral contracts for all existing tools

### Disposable (Phase A artifacts to rethink)

- **skill-parser.ts** — Heuristic markdown parsing. 63% mutation score. Replace with structured format parsing.
- **garp-skills.ts** — Enumerated skill listing tool. Replace with collapsed discovery API.
- **schema.json as separate files** — May merge into a structured SKILL.md format (YAML frontmatter).
- **Inbox skill enrichment** — Coupled to old parser. Rethink as part of collapsed tool response.
- **8-tool MCP surface** — The specific tool enumeration. The underlying handlers contain reusable logic.

---

## Design Direction

### Collapsed Tool Surface

The core insight from the Cloudflare code mode research: instead of registering N tools that each consume context tokens, expose a small discovery API that agents query to understand capabilities, then compose structured requests.

**Current**: 8 MCP tools × ~200 tokens each = ~1,600 tokens at startup. At 30 tools = ~6,000 tokens.

**Target**: 2-3 meta-tools with fixed token cost regardless of skill/capability count.

Candidates:
- **`garp_discover`** — "What can I do?" Query skills, team members, threads. Returns just enough for the agent to compose a request.
- **`garp_do`** — "Do this." Accepts a structured action (send request, respond, cancel, amend, check status, view thread) and dispatches to the right handler.
- Or a different split that emerges from design.

**Key constraint**: The existing handler logic (validation, git cycles, lifecycle transitions) is solid and should be preserved internally. The collapse is at the MCP registration surface, not at the handler level.

### Declarative Brain in SKILL.md

Each skill contract optionally includes brain processing rules:

```
brain_processing:
  validation:    [...rules...]
  enrichment:    [...rules...]
  routing:       [...rules...]
  auto_response: { enabled, template }
```

The brain is a serverless function (GitHub Actions or Lambda) that:
1. Triggers on git push to `requests/pending/`
2. Loads the skill contract for the request type
3. Executes the declared rules (validation, enrichment, routing)
4. Writes results back to git (amend request, auto-respond, notify)
5. Terminates. No persistent state.

**Key constraint**: The brain uses the same skill contract format as client agents. No separate brain config.

### Unified Skill Format

The current split (SKILL.md for humans + schema.json for machines + brain_processing for server) should converge into a single structured format that serves all three consumers:

- **Agents** discover capabilities and compose requests
- **Humans** read the contract and understand the workflow
- **Brain functions** parse processing rules and execute them

**Open question for design**: What format? Options include:
- YAML frontmatter + markdown body
- Pure YAML/JSON with embedded markdown descriptions
- Something else

---

## Open Questions for the Design Wave

### Architecture

1. **How many meta-tools?** 2 (discover + do)? 3 (discover + write + read)? Different split?
2. **What's the discovery response shape?** Enough for agents to compose requests, compact enough for token budget.
3. **How does the collapsed surface handle the existing 8 operations?** Internal dispatch? Action parameter? Separate operations under one tool?

### Skill Format

4. **What replaces SKILL.md + schema.json?** Single structured file? YAML frontmatter + markdown?
5. **How does brain_processing integrate?** Same file? Separate file in the skill directory?
6. **How is the skill format parsed?** YAML parser (deterministic) vs heuristic markdown parsing (what we're nuking)?

### Brain Processing

7. **Validation → Enrichment → Routing → Auto-response pipeline**: Is this the right stage model?
8. **Condition evaluation**: Simple key-value matching? JavaScript expressions? Something else?
9. **Enrichment data storage**: Amend request JSON inline? Separate file?
10. **Error handling**: Comment on request + notify skill author? Something else?

### Migration

11. **Test strategy**: Rewrite tests for collapsed surface? Adapter layer from old tests?
12. **Do existing 179 tests survive?** The handler logic is preserved; the calling surface changes.

---

## Existing ADRs (For Reference)

| ADR | Decision | Status |
|-----|----------|--------|
| ADR-010 | Skill metadata at application core, not a new port | **Superseded** — skill-parser being replaced |
| ADR-011 | Key-presence-only validation, no ajv | **Principle survives** — WARN not REJECT. Implementation changes. |
| ADR-012 | FilePort `readText` + `fileExists` | **Durable** — ports stay |

New ADRs will be needed for:
- Collapsed tool surface design
- Unified skill format
- Brain processing architecture
- Condition evaluation strategy

---

## Riskiest Assumptions (Still Untested)

From the Phase 2 feature plan, these remain the highest-risk items:

| Rank | Assumption | Risk | Status |
|------|-----------|------|--------|
| 1 | Rich context bundles are better than Slack for real handoffs | HIGH | **NOT TESTED** |
| 2 | Complex skill contracts produce consistent agent behavior | MED | **NOT TESTED** at scale |
| 3 | Collapsed tool surface actually saves tokens vs current approach | MED | **HYPOTHESIS** |
| 4 | Declarative brain rules are expressive enough for real workflows | MED | **HYPOTHESIS** |
| 5 | SKILL.md format can serve agents, humans, and brain simultaneously | MED | **HYPOTHESIS** |

---

## Summary for the Design Agent

**You are designing a unified architecture that:**

1. Collapses GARP's 8 MCP tools into 2-3 meta-tools for O(1) context cost
2. Replaces the heuristic skill-parser with a structured, deterministic skill format
3. Makes that skill format serve three consumers: agents (discovery), humans (readability), brain (processing rules)
4. Defines the declarative brain processing model natively in the collapsed paradigm (not retrofitted onto old tools)
5. Preserves the proven infrastructure: ports-and-adapters, git transport, protocol schemas, request lifecycle, 179 passing tests

**You are NOT:**
- Maintaining backward compatibility with Phase A's skill-parser or garp_skills tool
- Building a stateful daemon or sync layer
- Adding runtime dependencies
- Changing the git transport or protocol envelope schemas
- Building the brain implementation (that's a later deliver wave)

**The codebase is**: ~2,100 lines of TypeScript, solo experimental project, no external consumers, everything is on the table.
