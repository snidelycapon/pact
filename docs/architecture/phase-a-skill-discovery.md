# Architecture Design -- GARP Phase A: Skill Discovery and Typed Contracts

## Scope

Phase A adds progressive skill discovery and machine-readable contracts to GARP. Three user stories: US-021 (schema.json convention), US-019 (garp_skills tool), US-020 (inbox skill enrichment). This document extends the base architecture (`docs/architecture/architecture.md`) without replacing it.

**Net change**: 1 new application module, 1 new MCP tool, 2 modified tools, 2 extended interfaces, 4 schema.json files.

---

## C4 System Context (Level 1) -- Phase A

No change to system context. Phase A adds internal capabilities; the external system boundaries remain identical. Refer to the base architecture document for the L1 diagram.

---

## C4 Container (Level 2) -- Phase A

```mermaid
C4Container
    title Container Diagram -- GARP Phase A

    Person(user, "User", "Human operator paired with LLM agent")

    System_Boundary(client, "Client Machine") {
        Container(craft, "Craft Agents", "Electron + React", "Desktop agent platform with session management")
        Container(mcp, "GARP MCP Server", "TypeScript / Node.js, stdio", "8 tools: +garp_skills. Schema validation on garp_request. Skill enrichment on garp_inbox.")
        Container(localrepo, "Local Repo Clone", "Git working directory", "JSON files + SKILL.md files + schema.json files")
    }

    System_Ext(remote, "Git Remote", "GitHub/GitLab private repo")

    Rel(user, craft, "Interacts via chat UI")
    Rel(craft, mcp, "Starts as subprocess, sends JSON-RPC via stdio")
    Rel(mcp, localrepo, "Reads/writes JSON files, reads SKILL.md + schema.json, runs git commands")
    Rel(localrepo, remote, "Syncs via git push/pull over SSH or HTTPS")
```

### Container Changes from Base Architecture

| Container | Change | Detail |
|-----------|--------|--------|
| GARP MCP Server | 7 tools becomes 8 tools | `garp_skills` added |
| GARP MCP Server | garp_request gains validation | Warns on missing required fields when schema.json present |
| GARP MCP Server | garp_inbox gains enrichment | Adds skill_description and response_fields to entries |
| Local Repo Clone | New file convention | `skills/{type}/schema.json` alongside existing SKILL.md |

---

## C4 Component (Level 3) -- MCP Server Internal

The MCP server is growing from ~675 to ~850 estimated production lines. The addition of a shared skill-parser module and a new tool warrants a component diagram.

```mermaid
C4Component
    title Component Diagram -- GARP MCP Server (Phase A)

    Container_Boundary(mcp, "GARP MCP Server") {
        Component(entry, "MCP Entry Point", "index.ts", "Reads env vars, creates server, connects stdio transport")
        Component(factory, "Server Factory", "mcp-server.ts", "Creates McpServer, registers 8 tools, wires adapters")

        Component(skills_tool, "garp_skills handler", "tools/garp-skills.ts", "Lists/searches skill catalog with metadata")
        Component(request_tool, "garp_request handler", "tools/garp-request.ts", "Submits request with optional schema validation")
        Component(inbox_tool, "garp_inbox handler", "tools/garp-inbox.ts", "Lists pending requests with skill enrichment")
        Component(respond_tool, "garp_respond handler", "tools/garp-respond.ts", "Responds to pending request")
        Component(status_tool, "garp_status handler", "tools/garp-status.ts", "Checks request status")
        Component(thread_tool, "garp_thread handler", "tools/garp-thread.ts", "Views thread history")
        Component(amend_tool, "garp_amend handler", "tools/garp-amend.ts", "Amends pending request")
        Component(cancel_tool, "garp_cancel handler", "tools/garp-cancel.ts", "Cancels pending request")

        Component(skill_parser, "Skill Metadata Parser", "skill-parser.ts", "Extracts metadata from SKILL.md and schema.json. Pure functions with FilePort dependency.")
        Component(schemas, "Protocol Schemas", "schemas.ts", "Zod schemas for envelopes and config")
        Component(ports, "Port Interfaces", "ports.ts", "GitPort, ConfigPort, FilePort definitions")

        Component(git_adapter, "Git Adapter", "adapters/git-adapter.ts", "simple-git wrapper")
        Component(config_adapter, "Config Adapter", "adapters/config-adapter.ts", "config.json reader")
        Component(file_adapter, "File Adapter", "adapters/file-adapter.ts", "JSON + text file I/O + directory listing")
    }

    Rel(entry, factory, "Creates server")
    Rel(factory, skills_tool, "Registers as garp_skills")
    Rel(factory, request_tool, "Registers as garp_request")
    Rel(factory, inbox_tool, "Registers as garp_inbox")

    Rel(skills_tool, skill_parser, "Calls to extract skill metadata")
    Rel(inbox_tool, skill_parser, "Calls to enrich inbox entries")
    Rel(request_tool, skill_parser, "Calls to validate context_bundle against schema")

    Rel(skill_parser, ports, "Depends on FilePort interface")
    Rel(skills_tool, ports, "Depends on GitPort, FilePort")
    Rel(request_tool, ports, "Depends on GitPort, ConfigPort, FilePort")
    Rel(inbox_tool, ports, "Depends on GitPort, FilePort")

    Rel(git_adapter, ports, "Implements GitPort")
    Rel(config_adapter, ports, "Implements ConfigPort")
    Rel(file_adapter, ports, "Implements FilePort")
```

---

## Design Decision Resolutions

### D1: Where does shared skill parsing logic live?

**Decision**: New module `src/skill-parser.ts` at application core level.

**Rationale**: Skill parsing is application logic (interpreting markdown structure and JSON schema), not infrastructure. It consumes FilePort for I/O but belongs alongside `schemas.ts` and `ports.ts`, not behind a new port. This follows the existing pattern where tool handlers are application logic that depends on port interfaces.

**ADR**: ADR-010 (Skill Metadata Module)

**Behavioral contract**:
- Accepts FilePort + repoPath + skillName
- Returns structured metadata or undefined (never throws on missing/malformed files)
- Prefers schema.json for field extraction when available
- Falls back to SKILL.md markdown parsing when schema.json absent
- Pure functions, no side effects beyond file reads

### D2: How is schema.json loaded and validated?

**Decision**: Via FilePort.readJSON and FilePort.fileExists. No new port.

**Rationale**: schema.json is a JSON file in the repo. FilePort already handles JSON reads. The skill-parser module calls `fileExists` to check for schema.json, then `readJSON` to load it. If schema.json is malformed or missing, the module returns undefined for schema-derived fields and falls back to SKILL.md.

**ADR**: ADR-012 (FilePort readText and fileExists Extensions)

**FilePort extensions required**:
- `readText(path): Promise<string>` -- for reading SKILL.md as markdown
- `fileExists(path): Promise<boolean>` -- for checking schema.json presence without throwing

### D3: How do validation warnings work in garp_request?

**Decision**: Add optional `validation_warnings: string[]` to the return type. Warnings are additive; existing return fields unchanged.

**Current return type**: `{ request_id, thread_id, status, message }`

**Phase A return type**: `{ request_id, thread_id, status, message, validation_warnings? }`

**Validation flow**:
1. After skill existence check (line 46-49 in garp-request.ts), call skill-parser to check for schema.json
2. If schema.json exists, extract `context_bundle.required` array
3. Compare required keys against submitted `context_bundle` keys
4. Missing keys become warning strings
5. Warnings array included in return only when non-empty
6. Request submits regardless of warnings

**Breaking change risk**: None. The return type gains an optional field. Existing consumers (agents parsing the JSON response) will not break -- they simply will not see `validation_warnings` when no warnings exist, which is indistinguishable from the current behavior.

**ADR**: ADR-011 (Schema Validation Strategy)

### D4: What does the garp_skills tool look like?

**Decision**: New file at `src/tools/garp-skills.ts` following the exact pattern of existing tool handlers.

**MCP registration**:
- Tool name: `garp_skills`
- Description: "List available request types with descriptions and field information"
- Parameters: `{ query?: string }` -- optional keyword filter

**Handler signature**: `handleGarpSkills(params, ctx) -> Promise<SkillsResult>`

**Context type**: `{ repoPath, git: GitPort, file: FilePort }` -- no ConfigPort needed (skills are repo-level, not user-specific)

**Return shape**:
```
{
  skills: [
    {
      name: string,
      description: string,
      when_to_use: string,
      context_fields: string[],
      response_fields: string[],
      skill_path: string,
      has_schema: boolean
    }
  ],
  warning?: string
}
```

**Behavioral rules**:
- Runs git pull before scanning (with fallback to local on failure, sets warning)
- Lists `skills/` directory via FilePort
- For each subdirectory, calls skill-parser to extract metadata
- If `query` provided, filters by case-insensitive substring match against name + description + when_to_use
- Returns empty `skills: []` array (not error) when no matches
- Skills with missing or unreadable SKILL.md are silently skipped

### D5: How does garp_inbox cache skill metadata?

**Decision**: In-memory `Map<string, SkillMetadata>` scoped to a single `handleGarpInbox` invocation.

**Rationale**: The inbox scan iterates over pending requests. Multiple requests may share the same `request_type`. Parsing the same SKILL.md (and schema.json) for each duplicate type is wasteful. A per-invocation Map keyed by `request_type` eliminates redundant file reads.

**Scope**: The Map is a local variable inside `handleGarpInbox`. It is created at function entry and garbage-collected when the function returns. No persistent state between tool calls. This preserves GARP's stateless-between-calls guarantee.

**Cache miss flow**: Call skill-parser, store result in Map, use result for enrichment.
**Cache hit flow**: Retrieve from Map, use for enrichment.
**Cache error flow**: If skill-parser returns undefined (missing skill), store `undefined` in Map. Subsequent requests of the same type skip enrichment without re-reading.

### D6: How does SKILL.md parsing work?

**Decision**: Line-by-line parsing with section detection. Not regex-heavy.

**Parsing strategy**:

1. **Title**: First line starting with `# ` (H1). Strip the `# ` prefix.
2. **Description**: Content between H1 and first H2, excluding blank lines. Join into single string.
3. **When To Use**: Content under `## When To Use` section until next H2. Strip list markers (`- `).
4. **Context fields**: Content under `## Context Bundle Fields` section. Find markdown table rows (lines containing `|`). Extract first column after header separator (`|---|`). Strip whitespace.
5. **Response fields**: Same algorithm applied to `## Response Structure` section.

**Error tolerance**:
- Missing sections return empty string or empty array (not error)
- Malformed tables return empty field arrays
- Files that cannot be read return undefined for the entire metadata object
- Extra sections (Worked Example, How Rounds Work) are ignored

**Validation against existing skills**: The 4 existing SKILL.md files (ask, sanity-check, code-review, design-skill) all follow this structure consistently. The parsing algorithm is designed against these concrete examples.

### D7: schema.json validation scope

**Decision**: Key-presence-only validation for Phase A. No type checking, no nested validation.

**ADR**: ADR-011 (Schema Validation Strategy)

**What is validated**: Are all keys listed in `context_bundle.required` present as keys in the submitted `context_bundle`?

**What is NOT validated**: Field value types, nested object structure, array item schemas, pattern matching, conditional requirements.

**Rationale**: The requirements specify key-presence-only. Full JSON Schema validation (via ajv) would add a runtime dependency for marginal Phase A benefit. Phase B can upgrade if type validation proves necessary.

---

## Data Flow Diagrams

### Flow 1: garp_skills (US-019)

```
Agent                    garp_skills handler        skill-parser          FilePort        GitPort
  |                            |                        |                    |               |
  |-- garp_skills(query?) ---->|                        |                    |               |
  |                            |-- pull() ------------->|                    |               |
  |                            |                        |                    |          pull remote
  |                            |-- listDirectory("skills/") --------------->|               |
  |                            |<-- ["ask","code-review","sanity-check",...] |               |
  |                            |                        |                    |               |
  |                            |  for each skill:       |                    |               |
  |                            |-- parseSkillMetadata -->|                    |               |
  |                            |                        |-- fileExists(schema.json) ------->|
  |                            |                        |<-- true/false -----|               |
  |                            |                        |-- readJSON or readText ---------->|
  |                            |                        |<-- file content ---|               |
  |                            |                        |-- (parse content)  |               |
  |                            |<-- SkillMetadata ------|                    |               |
  |                            |                        |                    |               |
  |                            |  if query: filter by substring match       |               |
  |                            |                        |                    |               |
  |<-- { skills: [...] } ------|                        |                    |               |
```

### Flow 2: garp_request with schema validation (US-021)

```
Agent                    garp_request handler       skill-parser          FilePort        GitPort
  |                            |                        |                    |               |
  |-- garp_request(params) --->|                        |                    |               |
  |                            |  validate params       |                    |               |
  |                            |  check skill exists    |                    |               |
  |                            |  validate recipient    |                    |               |
  |                            |                        |                    |               |
  |                            |-- loadSchemaValidation(type) ------------->|               |
  |                            |                        |-- fileExists(schema.json) ------->|
  |                            |                        |<-- true ----------|               |
  |                            |                        |-- readJSON(schema.json) --------->|
  |                            |                        |<-- schema object --|               |
  |                            |<-- required fields ----|                    |               |
  |                            |                        |                    |               |
  |                            |  compare required vs context_bundle keys   |               |
  |                            |  missing = warnings    |                    |               |
  |                            |                        |                    |               |
  |                            |  build envelope        |                    |               |
  |                            |  write + commit + push |                    |               |
  |                            |                        |                    |               |
  |<-- { request_id, ...,      |                        |                    |               |
  |      validation_warnings } |                        |                    |               |
```

### Flow 3: garp_inbox with skill enrichment (US-020)

```
Agent                    garp_inbox handler         skill-parser          FilePort        GitPort
  |                            |                        |                    |               |
  |-- garp_inbox() ----------->|                        |                    |               |
  |                            |-- pull() ------------->|                    |          pull remote
  |                            |-- listDirectory("requests/pending") ------>|               |
  |                            |<-- [file1, file2, ...] |                    |               |
  |                            |                        |                    |               |
  |                            |  for each file:        |                    |               |
  |                            |    read + parse envelope                    |               |
  |                            |    filter by recipient                      |               |
  |                            |    build InboxEntry                         |               |
  |                            |                        |                    |               |
  |                            |  skill metadata cache = Map<string, SkillMetadata?>        |
  |                            |                        |                    |               |
  |                            |  for each entry:       |                    |               |
  |                            |    if cache miss:      |                    |               |
  |                            |-- parseSkillMetadata -->|                    |               |
  |                            |                        |-- (read files) --->|               |
  |                            |<-- metadata or undef --|                    |               |
  |                            |    store in cache      |                    |               |
  |                            |    if metadata:        |                    |               |
  |                            |      entry.skill_description = metadata.description        |
  |                            |      entry.response_fields = metadata.responseFields       |
  |                            |                        |                    |               |
  |                            |  group by thread_id (existing logic)        |               |
  |                            |  sort by created_at    |                    |               |
  |                            |                        |                    |               |
  |<-- { requests: [...] } ----|                        |                    |               |
```

---

## Interface Definitions

### FilePort Extensions (ADR-012)

Current FilePort gains two methods:

```
FilePort:
  readJSON<T>(path) -> Promise<T>         # existing
  writeJSON(path, data) -> Promise<void>   # existing
  writeText(path, content) -> Promise<void># existing
  readText(path) -> Promise<string>        # NEW -- reads file as UTF-8 text
  listDirectory(path) -> Promise<string[]> # existing
  moveFile(from, to) -> Promise<void>      # existing
  fileExists(path) -> Promise<boolean>     # NEW -- checks file existence
```

### Skill Metadata Types

The skill-parser module works with these data shapes:

```
SkillMetadata:
  name: string                    # directory name (e.g., "sanity-check")
  description: string             # first paragraph from SKILL.md
  when_to_use: string             # content of "When To Use" section
  context_fields: string[]        # field names from Context Bundle Fields table or schema.json
  response_fields: string[]       # field names from Response Structure table or schema.json
  has_schema: boolean             # whether schema.json exists for this skill
  skill_path: string              # absolute path to SKILL.md

SkillSchema:                      # parsed from schema.json
  skill_name: string
  skill_version: string
  context_bundle:
    required: string[]
    properties: Record<string, { type, description }>
  response_bundle:
    required: string[]
    properties: Record<string, { type, description }>
```

### InboxEntry Extensions (US-020)

```
InboxEntry:
  request_id: string              # existing
  short_id: string                # existing
  thread_id?: string              # existing
  request_type: string            # existing
  sender: string                  # existing
  created_at: string              # existing
  summary: string                 # existing
  skill_path: string              # existing
  attachment_count: number        # existing
  amendment_count: number         # existing
  attachments?: [...]             # existing
  skill_description?: string      # NEW -- from skill-parser, omitted if skill missing
  response_fields?: string[]      # NEW -- from skill-parser, omitted if skill missing

InboxThreadGroup:
  # all existing fields...
  skill_description?: string      # NEW -- from latest entry's skill
  response_fields?: string[]      # NEW -- from latest entry's skill
```

### garp_request Return Type Extension (US-021)

```
GarpRequestResult:
  request_id: string              # existing
  thread_id: string               # existing
  status: string                  # existing
  message: string                 # existing
  validation_warnings?: string[]  # NEW -- present only when warnings exist
```

---

## schema.json Convention

### File Location

`skills/{type}/schema.json` -- alongside SKILL.md in the same directory.

### File Format

JSON Schema draft 2020-12 with GARP-specific top-level fields:

```
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "skill_name": "{type}",
  "skill_version": "1.0.0",
  "context_bundle": {
    "type": "object",
    "required": [...],
    "properties": { ... },
    "additionalProperties": true
  },
  "response_bundle": {
    "type": "object",
    "required": [...],
    "properties": { ... },
    "additionalProperties": true
  }
}
```

### Critical Design Properties

- `additionalProperties: true` on both bundles -- required fields enforced, creative extension allowed
- `required` array defines the minimum contract; properties beyond required are documented but not enforced
- schema.json is optional -- skills without it work identically to today
- SKILL.md remains the authoritative human-readable documentation; schema.json is the machine-readable companion

### Skills to Receive schema.json

All 4 existing skills: ask, code-review, sanity-check, design-skill. Authored manually to match their SKILL.md field tables.

---

## Technology Stack -- Phase A Additions

| Component | Technology | License | Rationale |
|-----------|-----------|---------|-----------|
| Schema validation | Plain TypeScript (key-presence check) | N/A | Zero new deps. Required field presence check is trivial. ADR-011. |
| SKILL.md parsing | Plain TypeScript (line-by-line) | N/A | Zero new deps. Section detection + table extraction. No regex library needed. |
| schema.json format | JSON Schema draft 2020-12 | N/A (specification) | Industry standard. Human-readable. Tool ecosystem available if needed later. |

**No new runtime dependencies.** Phase A uses only existing deps: `@modelcontextprotocol/sdk`, `simple-git`, `zod`.

---

## Dependency Graph -- New and Modified Files

```
src/ports.ts                  MODIFIED  -- add readText, fileExists to FilePort
src/skill-parser.ts           NEW       -- shared skill metadata extraction
src/tools/garp-skills.ts      NEW       -- garp_skills tool handler
src/tools/garp-request.ts     MODIFIED  -- add schema validation warnings
src/tools/garp-inbox.ts       MODIFIED  -- add skill enrichment with cache
src/adapters/file-adapter.ts  MODIFIED  -- implement readText, fileExists
src/mcp-server.ts             MODIFIED  -- register garp_skills, import handler

skills/ask/schema.json              NEW  -- typed contract
skills/code-review/schema.json      NEW  -- typed contract
skills/sanity-check/schema.json     NEW  -- typed contract
skills/design-skill/schema.json     NEW  -- typed contract
```

### Dependency Direction (ports-and-adapters compliance)

```
                  DRIVING SIDE
                       |
              MCP Protocol (stdio)
                       |
                  mcp-server.ts
                   /   |   \
     garp-skills.ts  garp-request.ts  garp-inbox.ts
           \            |            /
            +--- skill-parser.ts ---+
                       |
                    ports.ts (interfaces)
                       |
                  DRIVEN SIDE
                   /   |   \
        git-adapter  config-adapter  file-adapter
```

All dependencies point inward. Tool handlers and skill-parser depend on port interfaces, never on adapter implementations. Adapters implement port interfaces. No circular dependencies.

---

## Phase B Readiness Assessment

Phase A artifacts feed directly into Phase B (meta-tool architecture) with zero throwaway:

| Phase A Artifact | Phase B Usage |
|-----------------|---------------|
| `skill-parser.ts` module | Becomes the parsing engine behind `garp_discover` meta-tool's skill search |
| `schema.json` files | Input for typed SDK generation (TypeScript interfaces from JSON Schema) |
| `garp_skills` handler logic | Reused inside `garp_discover` when the query targets skills |
| `FilePort.readText` | Required by any future module reading markdown files |
| `FilePort.fileExists` | Required by any future module checking for optional files |
| Key-presence validation | Extensible to full type validation (add ajv) when Phase B justifies the dependency |
| `SkillMetadata` type | Becomes the return type for Phase B SDK's `skills.list()` and `skills.get()` methods |

### Phase B does NOT require rework of Phase A because:

1. `garp_skills` stays as a standalone MCP tool (backward compatible with non-code-mode agents) while also serving as the implementation behind `garp_discover`
2. `schema.json` is the same format Phase B's SDK generator consumes -- no format migration
3. The skill-parser module is pure functions with dependency injection -- Phase B's `garp_discover` simply calls the same functions
4. Inbox enrichment is independently valuable regardless of whether Phase B ships

---

## Quality Attribute Strategies -- Phase A Specific

### Reliability

- schema.json reading failures silently skip validation (no degradation to existing flow)
- Skill metadata parsing failures silently omit enrichment fields (inbox still works)
- git pull failures in garp_skills fall back to local data with warning (same pattern as garp_inbox)

### Maintainability

- Shared skill-parser prevents logic duplication across 3 consumers
- schema.json is optional -- adding skills does not require schema authoring
- Phase A is purely additive: removing it restores exact pre-Phase-A behavior

### Testability

- skill-parser is pure functions with FilePort injection -- test with in-memory doubles
- Schema validation is a separate concern from envelope creation -- testable in isolation
- Inbox enrichment cache is a local variable -- no test setup needed for cache state

### Performance

- Skill metadata cache in inbox prevents redundant file reads (O(unique types) reads, not O(requests))
- garp_skills scans skills/ directory once per invocation (4-100 directories, sub-second)
- schema.json files are small (~1KB each) -- readJSON is fast

---

## Roadmap

### Recommended Build Order

Build order follows dependency graph and recommended order from backlog:

| Step | Story | What | Files Changed | Est. Lines |
|------|-------|------|---------------|------------|
| 1 | US-021 | FilePort extensions (readText, fileExists) | ports.ts, file-adapter.ts | ~15 |
| 2 | US-021 | schema.json files for 4 existing skills | 4 new schema.json files | ~200 |
| 3 | US-021 | Skill-parser module (schema.json reading + SKILL.md parsing) | skill-parser.ts (new) | ~80-120 |
| 4 | US-021 | Schema validation in garp_request | garp-request.ts | ~20-30 |
| 5 | US-019 | garp_skills tool handler | garp-skills.ts (new), mcp-server.ts | ~80-100 |
| 6 | US-020 | Inbox skill enrichment with cache | garp-inbox.ts | ~30-40 |

Steps 1-4 are US-021 (foundation). Step 5 is US-019 (new tool). Step 6 is US-020 (enrichment).

Steps 5 and 6 both depend on step 3 (skill-parser). Steps 5 and 6 are independent of each other.

**Estimated total production lines added**: ~225-305 (from ~675 to ~900-980).

---

## ADR Index -- Phase A

| ADR | Title | Decision |
|-----|-------|----------|
| ADR-010 | Skill Metadata Module | Shared `src/skill-parser.ts` at application core, pure functions with FilePort dependency |
| ADR-011 | Schema Validation Strategy | Key-presence-only validation using plain TypeScript. No ajv. WARN not REJECT. |
| ADR-012 | FilePort Extensions | Add `readText(path)` and `fileExists(path)` to FilePort interface |

---

## Handoff to Acceptance Designer

This architecture document provides:

- Component boundaries: skill-parser as shared module, garp_skills as new tool, garp_request/garp_inbox modifications
- Interface contracts: FilePort extensions, SkillMetadata type, return type changes, schema.json format
- Data flows: sequence diagrams for all three stories
- Technology decisions: no new deps, key-presence validation, line-by-line parsing
- Integration points: skill-parser consumed by three tool handlers
- Phase B readiness: every Phase A artifact feeds forward

The acceptance designer can produce step-level acceptance tests for the 6-step roadmap using the behavioral contracts, data flows, and interface definitions above. Implementation decisions (class decomposition, method signatures, internal algorithms) are deferred to the software crafter.
