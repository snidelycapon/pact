# Opportunity Solution Tree -- GARP Code Mode

## Discovery Phase: 2 COMPLETE (REVISED)

**Date**: 2026-02-21
**Revised**: 2026-02-21 (trajectory analysis corrected startup-loading and tool-growth assumptions)
**Product**: GARP MCP Server -- code mode pattern application
**Scope**: Full code mode thesis validated against projected state (30 tools + 100 skills)

---

## Desired Outcome

Enable agents to discover available request types, understand their contracts, and compose well-formed requests and responses without requiring upfront knowledge of all skills or reading full SKILL.md files on every interaction.

**Success metric**: An agent with no prior knowledge of available skills can discover, select, and correctly use the right request type in under 3 tool calls, without the human needing to specify the skill name.

---

## Opportunity Tree

### O1: Skill Discovery at Scale (Score: 11/15)

**Evidence**: 4 skills exist today (`ask`, `design-skill`, `sanity-check`, `code-review`). No tool or mechanism exists for an agent to list available skills. The `garp_request` tool validates that a skill exists (`existsSync(skillPath)`) but provides no way to discover what skills are available beforehand. The agent must either be told by the human or `ls` the skills directory.

**Job step**: When I want to send a request and I am not sure what request type fits, I need to browse available types and find the right one.

**Current behavior**: Human tells the agent which request type to use, or agent guesses based on conversation context.

**Scoring**:
- Importance: 4/5 (blocks autonomous agent composition of requests)
- Satisfaction with current: 2/5 (works with 4 skills because humans remember them)
- Frequency: 4/5 (every request composition, every new team member onboarding)
- Total: 11/15

**Sub-opportunities**:
- O1a: Skill listing tool -- `garp_skills` returns name + one-line description for all available skills
- O1b: Skill search -- query skills by keyword or job description ("I need someone to review code")
- O1c: Skill summary in inbox -- inbox entries include a brief skill description, not just skill_path

---

### O2: Machine-Readable Skill Contracts (Score: 10/15)

**Evidence**: SKILL.md files are human-readable markdown. They describe context_bundle fields and response structure in tables, but there is no machine-parseable schema. The `garp_request` tool accepts `context_bundle: z.record(z.string(), z.any())` -- completely untyped. The `garp_respond` tool accepts `response_bundle: z.record(z.string(), z.any())` -- also completely untyped. Agents must read the SKILL.md and interpret the markdown tables to know what fields to include.

**Job step**: When composing a request or response, I need my agent to know exactly what fields are expected so it produces a well-formed payload without trial and error.

**Current behavior**: Agent reads SKILL.md (27-128 lines of markdown), interprets the field tables, and constructs JSON. This works but is token-expensive and error-prone for complex skills.

**Scoring**:
- Importance: 4/5 (directly affects response quality and protocol compliance)
- Satisfaction with current: 2/5 (markdown interpretation works but is imprecise)
- Frequency: 4/5 (every request composition and every response composition)
- Total: 10/15

**Sub-opportunities**:
- O2a: JSON Schema per skill -- `skills/{type}/schema.json` with request and response schemas
- O2b: Schema validation on send/receive -- `garp_request` validates context_bundle against skill schema
- O2c: Schema in skill listing -- `garp_skills` returns field names and types alongside descriptions
- O2d: Type generation -- generate TypeScript interfaces from skill schemas for code-mode SDK usage

---

### O3: Contextual Skill Recommendation (Score: 7/15)

**Evidence**: Speculative. When an agent is mid-conversation and the user says "ask Dan to sanity-check this," the agent must map "sanity-check" to the `sanity-check` request type. Today this mapping is trivial (the name matches). But what about "can you get someone to look over my code changes?" -- the agent needs to infer that `code-review` is the right type.

**Job step**: When I describe what I need in natural language, I want the system to suggest the right request type.

**Current behavior**: No recommendation mechanism. Direct name match or human specification.

**Scoring**:
- Importance: 3/5 (nice-to-have, not blocking)
- Satisfaction with current: 3/5 (skill names are descriptive enough for 4 skills)
- Frequency: 2/5 (only relevant when the user does not know the exact type name)
- Total: 7/15

**Sub-opportunities**:
- O3a: Skill matching by description -- agent compares user intent against skill "When To Use" sections
- O3b: Skill aliases -- skills can declare aliases ("review" -> "code-review")

---

### O4: Composable Workflows (Score: 9/15 — REVISED UP)

**Evidence**: At 7 tools, 2-4 step workflows are manageable. But GARP is an MVP — tool count will grow with features (notifications, permissions, skill management, search, etc.). At 15-30 tools, common workflows involve 5-6 tool calls across a larger selection space. The HITL inspection argument weakens at scale: with 30 tools, humans are already trusting agent orchestration rather than inspecting each discrete step.

**Job step**: When I need to orchestrate a complex GARP workflow, I want to express it as a compact plan rather than managing N sequential tool calls across 30 possible tools.

**Current behavior**: Sequential tool calls. Works at 7 tools. Becomes increasingly complex as tool surface grows.

**Scoring**:
- Importance: 4/5 (grows with tool count; at 30 tools this is a real coordination problem)
- Satisfaction with current: 3/5 (fine today, degrades with scale)
- Frequency: 3/5 (every complex interaction)
- HITL trade-off: -1 (loses some inspectability, but this is already weakening at scale)
- Total: 9/15

**Sub-opportunities**:
- O4a: Code-as-plan execution -- agent writes code orchestrating multiple GARP operations
- O4b: Typed SDK for code mode -- generated from tool definitions + skill schemas
- O4c: Batch inbox processing -- process multiple requests in one invocation

---

### O5: Fixed Token Footprint (Score: 12/15 — REVISED FROM 3 TO 12)

**Evidence**: CORRECTION — GARP does NOT have a fixed token footprint. Skills are loaded at startup, not on demand. Tool definitions grow with GARP features. Both axes scale independently:

- 7 tools + 4 skills (today): ~2,840 tokens
- 30 tools + 100 skills (projected): ~40,000 tokens (20% of 200k context)

The current architecture has O(tools + skills) baseline context cost. Code mode patterns achieve O(1) — a fixed footprint regardless of how many tools or skills exist.

**Job step**: As my team adds skills and GARP adds features, I need the baseline context cost to stay constant so agents have room to actually work.

**Scoring**:
- Importance: 5/5 (20% context at projected scale is architecturally blocking)
- Satisfaction with current: 2/5 (fine today, fundamentally broken at scale)
- Frequency: 5/5 (every session, every agent, unconditionally)
- Total: 12/15

---

## Opportunity Prioritization (REVISED)

| Rank | Opportunity | Score | Pursue? | Rationale |
|------|-----------|-------|---------|-----------|
| 1 | O5: Fixed token footprint | 12 | **YES** | Both axes grow. 20% context at projected scale. Must design for O(1) now. |
| 2 | O1: Skill discovery at scale | 11 | **YES** | No mechanism exists. Foundation for progressive discovery. |
| 3 | O2: Machine-readable skill contracts | 10 | **YES** | Enables typed discovery, validation, and code mode SDK generation. |
| 4 | O4: Composable workflows | 9 | **YES — DESIGN NOW** | Not painful today but architecturally entangled with O5. Design the code-as-plan pattern alongside the meta-tool pattern. |
| 5 | O3: Contextual skill recommendation | 7 | DEFER | Nice-to-have. Falls out naturally from O1 + O2 once progressive discovery exists. |

**Key change**: O5 (fixed footprint) moved from "already solved" to top priority. O4 (composability) moved from "defer" to "design now" because it shares architectural surface with the meta-tool pattern needed for O5.

---

## Phase 2 Gate Evaluation

### G2 Criteria

| Criterion | Target | Actual | Status |
|-----------|--------|--------|--------|
| Opportunities identified | 5+ | 5 (O1-O5) | PASS |
| Top opportunity score | >8 | 11 (O1) | PASS |
| Job step coverage | 80%+ | Core discovery + composition workflows covered | PASS |
| Team alignment | Confirmed | User explicitly requested this exploration | PASS |

### G2 Decision: PASS -- FULL SCOPE

Proceed to solution testing for O5 (fixed footprint), O1 (skill discovery), O2 (typed contracts), and O4 (composable workflows). These four opportunities are architecturally entangled — the meta-tool pattern that achieves O(1) footprint also enables progressive discovery and code-as-plan composition.

---

## Relationship to Original Discovery

This code mode discovery is an extension of the original GARP discovery, not a replacement. However, the trajectory analysis reveals that code mode is not a nice-to-have feature — it is an architectural necessity for GARP's success case.

The original discovery planned for more skills and more tools as signs of success. This discovery identifies the architectural consequence: if both axes grow, the current enumeration-based MCP surface becomes a context budget problem. Code mode patterns (progressive discovery, meta-capabilities, typed contracts, code-as-plan) are the answer.

This is not "adding code mode to GARP." This is recognizing that GARP's trajectory demands the same patterns that code mode embodies.
