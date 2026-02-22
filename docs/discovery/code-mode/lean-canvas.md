# Lean Canvas -- PACT Code Mode

## Discovery Phase: 4 (Market Viability) COMPLETE (REVISED)

**Date**: 2026-02-21
**Revised**: 2026-02-21 (trajectory analysis validated full code mode thesis)
**Scope**: Code mode architecture for PACT -- progressive discovery, meta-capabilities, typed contracts, composable workflows
**Relationship**: Architectural evolution of existing PACT product, designing for the success case

---

## The Canvas

### 1. PROBLEM (Validated -- Full Scope)

**Core problem**: PACT's MCP surface scales O(tools + pacts). Both axes grow independently — tools with PACT features, pacts with team adoption. At projected maturity (30 tools + 100 pacts), baseline context consumption reaches ~40,000 tokens (20% of 200k) before the agent does any work.

**Top 4 problems** (validated against trajectory):

1. **Startup context budget** -- PACT.md files loaded at session startup + MCP tool definitions = O(n) baseline cost. At 100 pacts + 30 tools, this consumes 20% of context unconditionally. Every session, every agent.

2. **No pact discovery mechanism** -- Agents cannot list, search, or browse available request types. The only "discovery" is loading all PACT.md at startup — which IS the scaling problem.

3. **Pacts are human-readable only** -- PACT.md files are markdown. No machine-parseable schema. Agents must read and interpret 27-128 lines of markdown per pact to construct payloads.

4. **Tool surface enumeration** -- Every PACT tool is a separate MCP tool definition. As features grow (notifications, permissions, pact management, search, analytics), the tool definition surface grows proportionally. At 30 tools, MCP tool definitions alone cost ~6,400 tokens.

### 2. CUSTOMER SEGMENTS

**Primary**: LLM agents operating PACT tools on behalf of human users. The "customer" is the agent that needs to discover pacts and compose well-formed payloads.

**Secondary**: Human users onboarding to a PACT workspace. New team members need to understand what request types are available and when to use them.

**Tertiary**: Pact authors who want their pacts to be discoverable and correctly used.

### 3. UNIQUE VALUE PROPOSITION

**For the narrowed scope**: Agents can discover the right request type and compose well-formed payloads without upfront knowledge or human hand-holding, while pact authors get validation that their contracts are being followed.

This is NOT a dramatic architectural change. It is two incremental improvements to the existing pact system that happen to embody the most useful code mode principles (progressive discovery, type generation).

### 4. SOLUTION (Validated Shape -- Phased)

**Phase A — Progressive Discovery (immediate value, additive)**:

| Component | What It Does | Effort |
|-----------|-------------|--------|
| `pact_pacts` tool | Lists/searches available pacts with name, description, fields | 2-4 hours |
| schema.json convention | Machine-readable JSON Schema per pact for typed discovery | 3-5 hours |
| Pact summary in inbox | Inbox entries include response field expectations | 1-2 hours |

**Phase B — Meta-Tool Architecture (designs for trajectory)**:

| Component | What It Does | Effort |
|-----------|-------------|--------|
| `pact_discover` meta-tool | Unified search across pacts, requests, threads, team | TBD (design phase) |
| `pact_execute` meta-tool | Code-as-plan execution against typed PACT SDK | TBD (design phase) |
| Typed SDK generation | Generate TypeScript interfaces from tool definitions + pact schemas | TBD (design phase) |
| Gradual tool consolidation | Migrate individual tools behind meta-capabilities | TBD (design phase) |

**Architecture impact**: Phase A is additive (1 new tool, optional files). Phase B is an architectural evolution — collapsing N MCP tools into 2-3 meta-capabilities with a typed SDK. Ports-and-adapters pattern is preserved; the change is at the MCP surface layer.

### 5. KEY METRICS

| Metric | Target | How Measured |
|--------|--------|-------------|
| Correct pact selection | >80% accuracy across 10 prompts | Test 1 from solution-testing |
| Response schema compliance | >20pp improvement with schema | Test 2 from solution-testing |
| Scale tolerance | Works at 20+ pacts | Test 3 from solution-testing |
| Backward compatibility | 65/65 existing tests pass | Test 4 from solution-testing |
| Adoption | Agents use pact_pacts before composing requests | Observation over 2 weeks |

### 6. COST STRUCTURE

**Build cost**: 6-11 hours of development time.
**Ongoing cost**: Schema.json files must be authored when new pacts are created. This is 10-15 minutes per pact.
**Risk cost**: If schema.json drifts from PACT.md, agents get contradictory guidance. Mitigation: schema.json is optional; PACT.md remains the authoritative source.

### 7. UNFAIR ADVANTAGE

The existing PACT architecture already embodies the core code mode principle (rigid protocol, flexible payload). The proposed solutions leverage this architecture rather than replacing it. The pact system's design (files in a git repo, loaded on demand, synced via pull) makes discovery and schema validation natural extensions.

---

## Risk Assessment (4 Big Risks)

### Value Risk: Will this actually help?

**Status**: MODERATE

The pact discovery tool (pact_pacts) has clear value -- it fills a gap that demonstrably exists. The schema.json convention has less certain value because PACT.md already works "well enough" for 4 pacts.

**Key question**: Does schema-guided composition produce meaningfully better payloads than PACT.md-guided composition? This must be tested (Test 2).

### Usability Risk: Will it be used correctly?

**Status**: LOW

pact_pacts is a simple query tool. Agents already handle tool queries well. The schema.json format is standard JSON Schema. No novel concepts.

### Feasibility Risk: Can we build it?

**Status**: VERY LOW

6-11 hours of development. No architectural changes. Well-understood technologies (JSON Schema, file I/O, Zod validation). The existing FilePort and ConfigPort adapters provide all needed infrastructure.

### Viability Risk: Does the model work?

**Status**: N/A (Feature enhancement, not a product)

This is an incremental improvement to an existing open-source tool. There is no business model impact. The only viability question is maintenance burden, and that is minimal (1 new tool + optional schema files).

---

## Go/No-Go Decision

### GO -- Proceed to Implementation

**Rationale**:

1. **Pact discovery gap is real** -- No mechanism exists. This blocks autonomous agent use as pacts grow.
2. **Effort is minimal** -- 6-11 hours total. Low risk of wasted work.
3. **Purely additive** -- No changes to existing tools, protocol, or architecture. If it does not help, it can be removed without side effects.
4. **User explicitly requested** -- "The same patterns could (should) also apply to request type discovery and usage."
5. **Foundation for future** -- schema.json provides the typed foundation if full code mode is ever justified.

**What to build first**:
1. `pact_pacts` tool (immediate value, no dependencies)
2. Pact summary in inbox entries (small change, leverages pacts parsing)
3. schema.json for existing 4 pacts (needs authoring time)
4. Optional validation in pact_request (only after schema.json exists)

**What NOT to build**:
- Meta-tools replacing individual tools
- Code execution sandbox
- SDK generation
- Batch processing

These are deferred, not rejected. If real usage at higher volume reveals that 2-4 step workflows are painful or that batch processing is needed, they can be reconsidered with new evidence.

---

## Relationship to Full Code Mode

The user's original request was to apply "code mode conceptual mechanisms" to PACT. After trajectory correction, this discovery finds:

| Code Mode Mechanism | PACT Applicability | Decision |
|--------------------|--------------------|----------|
| Context pressure relief | **VALIDATED** — 20% of context at projected scale | BUILD (meta-tool architecture) |
| Progressive discovery | **VALIDATED** — no discovery mechanism; startup loading is the only option | BUILD (pact_pacts → pact_discover) |
| Type generation | **VALIDATED** — markdown contracts are lossy; typed schemas enable SDK | BUILD (schema.json → typed SDK) |
| Fixed footprint | **VALIDATED** — O(tools + pacts) must become O(1) | BUILD (meta-tool collapse) |
| Composability | **PLAUSIBLE** — grows with tool count; design now, build when needed | DESIGN (code-as-plan pattern) |
| Code execution | **OPEN** — safety concerns real but not disqualifying | DESIGN (sandboxing approach for git operations) |

**The revised conclusion**: PACT's trajectory demands code mode as an architecture, not just two features. The success case (more tools, more pacts, more teams) creates a scaling problem that code mode patterns directly solve. The question is not "if" but "when and how."

**Phased approach**: Build Phase A (progressive discovery, typed contracts) immediately — these deliver value today and lay the foundation. Design Phase B (meta-tools, SDK, code execution) now so the architecture is ready when tool/pact growth demands it. Build Phase B when the growth materializes.

---

## Phase 4 Gate Evaluation (REVISED)

| Criterion | Target | Actual | Status |
|-----------|--------|--------|--------|
| All phases complete | Yes | Phase 1-4 documented, revised with trajectory analysis | PASS |
| G1: Problem validated | 5+ evidence sources, >60% | 7 sources, ~80% mechanisms validated at trajectory | PASS |
| G2: Opportunities prioritized | OST complete, top 2-3 >8 | 5 opportunities; top 4 score 12, 11, 10, 9 | PASS |
| G3: Solution tested | Tests defined, feasibility confirmed | Phase A test plan defined; Phase B needs design | PASS (Phase A) / PARTIAL (Phase B) |
| G4: Viability confirmed | Risks addressed | Phase A: LOW risk. Phase B: MODERATE risk (code execution safety) | PASS |

### Correction Note

The initial discovery evaluated against current state and incorrectly refuted 3 of 6 code mode mechanisms. User feedback identified two wrong assumptions: (1) pacts load on demand (they don't — loaded at startup), (2) tool count is fixed (it's not — 7 is an MVP). Trajectory analysis validates the full code mode thesis.

### Handoff Recommendation

**Phase A** (progressive discovery + typed contracts): Ready for DISCUSS wave. Clear scope, low risk, immediate value.

**Phase B** (meta-tool architecture + code execution): Needs DESIGN wave first. The architecture for collapsing N tools into 2-3 meta-capabilities and safely sandboxing git operations requires careful design work before implementation.
