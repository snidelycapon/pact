# Solution Testing -- GARP Code Mode

## Discovery Phase: 3 COMPLETE (REVISED)

**Date**: 2026-02-21
**Revised**: 2026-02-21 (trajectory analysis expanded scope to full code mode)
**Scope**: Phase A — skill discovery (O1) + typed contracts (O2). Phase B — fixed footprint (O5) + composable workflows (O4) via meta-tool architecture.
**Architecture constraint**: Solutions must preserve GARP's ports-and-adapters pattern and git-backed protocol. MCP surface layer is the change target.

---

## Solution Hypotheses

### H1: Skill Listing Tool

**If** we add a `garp_skills` tool that lists available request types with name, description, and field summary,
**then** agents will be able to discover and select the right request type without human guidance,
**because** the agent can query available skills at composition time instead of relying on prior knowledge.

**Riskiest assumption**: That a one-line description per skill is sufficient for the agent to select the right type. If skills overlap in purpose, the agent may need to read full SKILL.md files anyway.

### H2: Skill Schema Files

**If** we add a `schema.json` alongside each `SKILL.md` that defines context_bundle and response_bundle as JSON Schema,
**then** agents will produce more accurate request/response payloads,
**because** structured schemas are less ambiguous than markdown field tables.

**Riskiest assumption**: That skill authors will maintain both SKILL.md and schema.json in sync. Schema drift could be worse than having no schema.

### H3: Schema Validation on Send

**If** `garp_request` validates the context_bundle against the skill's schema.json before committing,
**then** malformed requests will be caught at composition time instead of confusing the recipient,
**because** early validation prevents garbage-in at the protocol boundary.

**Riskiest assumption**: That strict validation does not break the "open-ended flexibility" the user explicitly valued. The user said: "open-ended flexibility is ideal here." Strict schemas conflict with this.

### H4: Skill Discovery Applied to Request Types (User-Stated)

**If** agents can query "what request types exist that handle X" and get back matching skills with usage guidance,
**then** the system becomes self-documenting and new team members can use it without a walkthrough,
**because** the skills directory becomes a searchable catalog rather than a folder to browse.

**Riskiest assumption**: That skill "When To Use" sections contain enough semantic information for meaningful matching. Current SKILL.md files vary in specificity.

---

## Proposed Solutions

### Solution A: garp_skills Tool (New MCP Tool)

**What it does**: Lists all available request types with lightweight metadata extracted from SKILL.md files.

**Implementation sketch**:

```typescript
// New tool: garp_skills
// Lists skills/ directories, reads first 5 lines of each SKILL.md for name + description
server.tool(
  "garp_skills",
  "List available request types and their descriptions",
  {
    query: z.string().optional().describe("Optional search term to filter skills"),
  },
  async (params) => {
    // 1. List skills/ directory
    // 2. For each skill, read SKILL.md first line (title) and "When To Use" section
    // 3. If query provided, filter by keyword match against title + when-to-use
    // 4. Return array of { name, description, when_to_use, fields: [...field_names] }
  },
);
```

**Output format**:
```json
{
  "skills": [
    {
      "name": "ask",
      "description": "A general-purpose request for questions, opinions, or answers",
      "when_to_use": "You have a question that needs another person's perspective",
      "context_fields": ["question", "background", "options", "urgency"],
      "response_fields": ["answer", "reasoning", "caveats"],
      "skill_path": "/path/to/skills/ask/SKILL.md"
    },
    {
      "name": "code-review",
      "description": "Request a code review on a branch, PR, or changeset",
      "when_to_use": "You finished a feature branch and want a teammate to review",
      "context_fields": ["repository", "branch", "language", "description", "areas_of_concern", "related_tickets"],
      "response_fields": ["status", "summary", "blocking_feedback", "advisory_feedback", "questions"],
      "skill_path": "/path/to/skills/code-review/SKILL.md"
    }
  ]
}
```

**Token cost**: ~150 tokens per skill in the listing. With 20 skills: ~3,000 tokens. This is a pay-when-you-query cost, not a baseline cost. Acceptable.

**Integration with existing tools**: `garp_request` already validates that a skill exists. `garp_skills` adds the preceding discovery step.

**Scope**: 1 new tool. No changes to existing tools. No changes to skill file format. Pure additive.

### Solution B: Skill Schema Convention (schema.json)

**What it does**: Adds an optional `schema.json` alongside each `SKILL.md` that provides JSON Schema for context_bundle and response_bundle.

**File format**:
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "skill_name": "sanity-check",
  "skill_version": "1.0.0",
  "context_bundle": {
    "type": "object",
    "required": ["customer", "product", "issue_summary", "involved_files", "investigation_so_far", "question"],
    "properties": {
      "customer": { "type": "string", "description": "Customer name" },
      "product": { "type": "string", "description": "Product name and version" },
      "issue_summary": { "type": "string", "description": "Brief description of the issue" },
      "involved_files": {
        "type": "array",
        "items": { "type": "string" },
        "description": "Files examined during investigation"
      },
      "investigation_so_far": { "type": "string", "description": "What you have found" },
      "question": { "type": "string", "description": "Specific question for the reviewer" },
      "zendesk_ticket": { "type": "string", "description": "Related Zendesk ticket ID" }
    },
    "additionalProperties": true
  },
  "response_bundle": {
    "type": "object",
    "required": ["answer", "evidence", "recommendation"],
    "properties": {
      "answer": { "type": "string", "description": "YES / NO / PARTIALLY with explanation" },
      "evidence": { "type": "string", "description": "What you compared or examined" },
      "concerns": { "type": "string", "description": "Risks, caveats, or related issues" },
      "recommendation": { "type": "string", "description": "Suggested next step" }
    },
    "additionalProperties": true
  }
}
```

**Critical design decision**: `additionalProperties: true`. This preserves the "open-ended flexibility" the user values. Required fields enforce a minimum contract; additional fields allow creative extension. This is the same rigid-envelope-flexible-payload pattern GARP already uses.

**Integration**: `garp_skills` returns field names from schema.json when available, falling back to SKILL.md parsing when not. `garp_request` optionally validates context_bundle against schema.json. `garp_respond` optionally validates response_bundle.

**Schema validation behavior**: WARN, not REJECT. If a context_bundle is missing required fields, the tool logs a warning and includes it in the response, but does not block the request. The agent (and human) decide whether to fix it. This preserves the "dumb router" philosophy of Tier 1.

**Scope**: New convention (schema.json files). Optional validation in `garp_request` and `garp_respond`. No breaking changes to existing tools or skill files.

### Solution C: Skill Summary in Inbox (Enhancement)

**What it does**: When `garp_inbox` returns entries, include a brief skill description alongside the `skill_path` so the agent understands the request type without a separate file read.

**Current inbox entry**:
```json
{
  "request_id": "req-20260221-143022-cory-a1b2",
  "request_type": "sanity-check",
  "skill_path": "/path/to/skills/sanity-check/SKILL.md",
  "summary": "Does this match the pattern from ZD-4102?"
}
```

**Enhanced inbox entry**:
```json
{
  "request_id": "req-20260221-143022-cory-a1b2",
  "request_type": "sanity-check",
  "skill_path": "/path/to/skills/sanity-check/SKILL.md",
  "skill_description": "Validate your findings on a bug investigation",
  "response_fields": ["answer", "evidence", "concerns", "recommendation"],
  "summary": "Does this match the pattern from ZD-4102?"
}
```

**Benefit**: The agent sees what fields it needs to include in its response directly in the inbox entry. No separate file read needed for simple cases.

**Scope**: Modify `garp_inbox` output. ~20 lines of code change. No new tools.

---

## Phase B Solutions (Design Now, Build When Growth Demands)

### Solution D: Meta-Tool Architecture (garp_discover + garp_execute)

**What it does**: Collapses N MCP tools into 2-3 meta-capabilities. Token footprint becomes O(1) regardless of tool or skill count.

**Concept**:
- `garp_discover` -- unified search across skills, requests, threads, team members. Replaces the need to load all SKILL.md at startup and exposes tool capabilities dynamically.
- `garp_execute` -- LLM writes code against a typed GARP SDK. The SDK wraps existing tool logic (request, respond, inbox, etc.) as callable functions.

**Architecture sketch**:
```
Current:  7 MCP tools (each with JSON Schema definition) + N SKILL.md files at startup
Phase B:  2-3 MCP tools + typed SDK (generated from tool defs + skill schemas)
          Agent discovers capabilities via garp_discover, orchestrates via garp_execute
```

**Open questions requiring design work**:
1. **Git safety**: Each current tool performs an atomic git cycle (pull→write→commit→push). How does code execution maintain atomicity? Options: (a) each SDK function call is independently atomic (same as today, just called from code), (b) transactional wrapper that rolls back on failure, (c) dry-run mode that validates before committing.
2. **Incremental migration**: Can meta-tools coexist with individual tools during transition? Likely yes — agents that understand code mode use garp_execute; agents that don't use individual tools.
3. **HITL balance**: Code execution reduces inspectability. Mitigation: the generated code IS the plan — shown to the human before execution (like Cloudflare's approach).

**Status**: Needs DESIGN wave. The architectural questions (especially git safety) require careful exploration before implementation.

### Solution E: Typed SDK Generation

**What it does**: Generates TypeScript interfaces from tool definitions + skill schemas. Provides the type context for code mode execution.

**Depends on**: Solution B (schema.json) for skill types. Tool definitions already exist in code.

**Output example**:
```typescript
// Generated from tool definitions + skill schemas
interface GarpSDK {
  skills: {
    list(query?: string): Promise<SkillSummary[]>;
    get(name: string): Promise<SkillSchema>;
  };
  request(params: { type: string; recipient: string; context: Record<string, unknown>; ... }): Promise<RequestResult>;
  inbox(params?: { filter?: string }): Promise<InboxEntry[]>;
  respond(requestId: string, response: Record<string, unknown>): Promise<ResponseResult>;
  status(requestId: string): Promise<StatusResult>;
  thread(threadId: string): Promise<ThreadHistory>;
  // ... etc
}
```

**Status**: Foundation (schema.json) builds in Phase A. SDK generation is Phase B work.

### Previous Concerns — Reassessed

| Concern | Initial Assessment | Revised Assessment |
|---------|-------------------|-------------------|
| "7 tools is not many" | Used to reject meta-tools | 7 is MVP. 30 is projected. Meta-tools are justified at trajectory. |
| "Git side effects aren't sandboxable" | Used to reject code execution | Each SDK function can be independently atomic (same git cycle as today). The "sandbox" is the SDK itself, not a V8 isolate. |
| "HITL benefits from discrete steps" | Used to reject composability | True at 7 tools. Weakens at 30 tools where humans already trust orchestration. Code-as-plan shown before execution preserves HITL. |
| "Code execution adds complexity" | Used to reject code mode | Complexity is in the SDK, not the code the LLM writes. The LLM writes SIMPLER code than it currently produces (multiple tool calls with JSON params). |

---

## Test Plan

### Test 1: Skill Discovery Accuracy

**Goal**: Can an agent discover and select the correct request type using `garp_skills` alone?

**Method**:
1. Create 6+ skills in the test repo (current 4 + 2 new)
2. Give the agent a natural language task: "I need Dan to look over my branch before merging"
3. Agent calls `garp_skills` (optionally with query "review code")
4. Agent selects a skill and composes a request
5. Evaluate: did it pick the right skill? Did it include the required fields?

**Success criteria**: Correct skill selection in >80% of attempts across 10 diverse prompts.

### Test 2: Schema-Guided Response Quality

**Goal**: Do agents produce better responses when schema.json is available?

**Method**:
1. Process 5 inbox items with SKILL.md only (no schema.json)
2. Process 5 inbox items with SKILL.md + schema.json + response_fields in inbox entry
3. Compare: field completeness, schema compliance, response quality

**Success criteria**: >80% of schema-guided responses include all required fields vs <60% without.

### Test 3: Skill Discovery at Scale

**Goal**: Does `garp_skills` remain useful as skill count grows?

**Method**:
1. Create 20 skills (mix of realistic and edge cases)
2. Test skill selection accuracy with `garp_skills` listing (no query)
3. Test skill selection accuracy with `garp_skills` query filter
4. Measure token cost of the listing

**Success criteria**: Query-filtered results stay under 1,000 tokens. Selection accuracy >70% with 20 skills.

### Test 4: Backward Compatibility

**Goal**: Do schema.json and garp_skills break anything for existing usage?

**Method**:
1. Run all 65 existing tests with the new tool registered
2. Process existing skills (ask, design-skill, sanity-check, code-review) with and without schema.json
3. Verify that agents can still use skills without schema.json

**Success criteria**: All 65 tests pass. Skills without schema.json work identically to today.

---

## Phase 3 Gate Criteria

| Criterion | Target | How Measured |
|-----------|--------|-------------|
| Task completion | >80% correct skill selection | Test 1 |
| Usability | Agent composes valid request in <3 tool calls | Test 1 |
| Schema compliance improvement | >20 percentage point improvement | Test 2 |
| Scale tolerance | Works with 20+ skills | Test 3 |
| Backward compatibility | 65/65 tests pass | Test 4 |

---

## Implementation Estimate

### Phase A — Build Now (immediate value, additive)

| Solution | New/Modified | Estimated Effort | Dependencies |
|----------|-------------|-----------------|--------------|
| A: garp_skills tool | 1 new tool | 2-4 hours | None |
| B: schema.json convention | 4 schema files + optional validation | 3-5 hours | None |
| C: Skill summary in inbox | Modify garp_inbox | 1-2 hours | Solution A (for skill parsing logic) |

**Phase A total**: 6-11 hours.

### Phase B — Design Now, Build When Growth Demands

| Solution | Scope | Estimated Effort | Dependencies |
|----------|-------|-----------------|--------------|
| D: Meta-tool architecture | Architecture design + prototyping | Design: 4-8 hours. Build: TBD | Phase A foundation |
| E: Typed SDK generation | SDK generator + type definitions | Design: 2-4 hours. Build: TBD | Solution B (schema.json) |

**Phase B design total**: 6-12 hours of design work. Implementation effort TBD after design.

### Phasing Strategy

1. **Phase A — Solutions A, C, B** (in order): Immediate value. Progressive discovery replaces startup loading. Typed contracts enable machine-readable skills. Foundation for Phase B.
2. **Phase B — Design**: Architecture for meta-tools and SDK generation. Answer the git safety and HITL questions. Produce a design document.
3. **Phase B — Build**: When tool count exceeds ~15 or skill count exceeds ~20, implement the meta-tool architecture. The Phase A foundation (schema.json, garp_skills parsing logic) feeds directly into Phase B.

**Key insight**: Phase A is not throwaway work that Phase B replaces. Phase A's `garp_skills` becomes the implementation behind `garp_discover`. Phase A's `schema.json` becomes the input for SDK type generation. Phase A is the foundation, not a stopgap.
