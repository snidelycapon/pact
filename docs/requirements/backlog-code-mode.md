# Backlog -- GARP Code Mode (Phase A)

## Epic: code-mode
## Status: Requirements complete -- ready for DESIGN wave handoff
## Date: 2026-02-22

---

## Scope

Phase A of the code mode architecture: progressive skill discovery and typed contracts. These three stories deliver immediate value (agents can discover skills at runtime, compose well-formed payloads, and orient on inbox items without extra file reads) while laying the foundation for Phase B (meta-tool architecture, SDK generation, code-as-plan execution).

**Phase B is out of scope for this backlog.** It is designed at the concept level in the discovery artifacts (docs/discovery/code-mode/) and will receive its own DISCUSS wave when tool/skill growth demands it.

---

## Story Map

```
DISCOVERY           TYPED CONTRACTS      INBOX ENRICHMENT
=========           ===============      ================

US-019              US-021               US-020
garp_skills         schema.json          Skill summary
(new tool)          (convention +        in inbox entries
                     validation)         (modify garp_inbox)
```

## Dependency Graph

```
                US-021 (schema.json convention)
                  |              |
                  v              v
        US-019 (garp_skills)   US-020 (inbox enrichment)
               |
               v
        US-020 (shared parsing module)
```

**Note**: All dependencies are "beneficial, not blocking." Each story works independently:
- US-019 works without schema.json (falls back to SKILL.md parsing)
- US-020 works without schema.json (falls back to SKILL.md parsing)
- US-020 can duplicate parsing logic if US-019 is not done yet
- US-021 delivers value even without US-019/US-020 (validation warnings on garp_request)

**Recommended build order** (optimal, not required):
1. US-021 (schema.json) -- defines the typed contracts, smallest standalone change
2. US-019 (garp_skills) -- creates shared parsing module, new tool
3. US-020 (inbox enrichment) -- uses parsing module from US-019

---

## Story Summary

| ID | Title | Size | Scenarios | Dependencies | Priority |
|----|-------|------|-----------|-------------|----------|
| US-019 | garp_skills tool | 2-3 days | 7 | None (US-021 beneficial) | P1 |
| US-020 | Inbox skill enrichment | 1 day | 5 | US-019 (beneficial, for shared parsing) | P2 |
| US-021 | schema.json convention | 1-2 days | 7 | None | P1 |

**Total estimated effort**: 4-6 days

---

## Implementation Order (Recommended)

### Wave 1: Foundation (2-3 days)
1. **US-021** (schema.json) -- 1-2 days. Create schema.json for 4 existing skills. Add validation in garp_request.
2. **US-019** (garp_skills) -- 2-3 days. New tool with skill parsing module. Can start after US-021 or in parallel.

### Wave 2: Enrichment (1 day)
3. **US-020** (inbox enrichment) -- 1 day. Modify garp_inbox to use skill parsing from US-019.

---

## DoR Checklist Summary

| Item | US-019 | US-020 | US-021 |
|------|--------|--------|--------|
| 1. Problem statement | PASS | PASS | PASS |
| 2. User/persona | PASS | PASS | PASS |
| 3. 3+ domain examples | PASS (3) | PASS (3) | PASS (3) |
| 4. UAT scenarios (3-7) | PASS (7) | PASS (5) | PASS (7) |
| 5. AC from UAT | PASS | PASS | PASS |
| 6. Right-sized | PASS | PASS | PASS |
| 7. Technical notes | PASS | PASS | PASS |
| 8. Dependencies | PASS | PASS | PASS |

**All 3 stories pass all 8 DoR items.**

### DoR Validation Notes

**US-019 (garp_skills)**: Problem clearly articulates the discovery gap with concrete pain (Cory cannot remember skill names, Maria Santos is new and has no catalog). 3 domain examples with real personas cover list-all, search-by-intent, and no-matches. 7 UAT scenarios cover listing, searching, schema.json preference, SKILL.md fallback, and git pull. Technical notes specify parsing strategy and shared module recommendation. Size: 2-3 days for new tool following existing patterns.

**US-020 (inbox enrichment)**: Problem is specific -- "three additional file reads totaling 221 lines of markdown just to understand what each request expects." 3 domain examples cover single enrichment, multiple types, and SKILL.md fallback. 5 scenarios including graceful degradation when skill files are missing. Technical notes specify caching strategy and InboxThreadGroup update. Size: 1 day modifying existing tool.

**US-021 (schema.json)**: Problem identifies the specific failure mode (agent interprets involved_files as string instead of array from markdown table). 3 domain examples cover typed composition, validation warnings, and backward compatibility. 7 scenarios cover validation, no-validation, additionalProperties, and schema creation for existing skills. Technical notes specify key-presence-only validation strategy and additionalProperties: true rationale. Size: 1-2 days for schema files + validation logic.

---

## Risk Register

| Risk | Severity | Mitigation | Validated By |
|------|----------|------------|-------------|
| schema.json drifts from SKILL.md | MEDIUM | schema.json is optional; SKILL.md remains authoritative. Future lint tool can check consistency. | Manual review at authoring time |
| Skill parsing from SKILL.md is fragile | LOW | SKILL.md follows a consistent structure (H1, When To Use, field tables). schema.json provides the robust alternative. | Test with all 4 existing skills |
| garp_skills search is too simple (substring match) | LOW | Sufficient for Phase A. Semantic search or fuzzy matching is a Phase B enhancement if needed. | Test 3 (from solution-testing.md) |
| Validation warnings are ignored by agents | LOW | Warnings are visible in the garp_request response. If agents ignore them, that is acceptable -- the request still went through. | Real usage observation |
| Performance of skill parsing on every inbox call | LOW | Cache per request_type during a single inbox scan. Skill files are small (27-128 lines). | Load testing at 20+ skills |

---

## Handoff Notes for DESIGN Wave

### What Is Decided (Do Not Re-Open)
- 1 new MCP tool: garp_skills (list/search available skills)
- 1 new convention: schema.json alongside SKILL.md (optional, JSON Schema draft 2020-12)
- 1 modified tool: garp_inbox (enriched entries with skill_description and response_fields)
- 1 modified tool: garp_request (optional validation warnings when schema.json exists)
- additionalProperties: true on all schema.json files (preserves open-ended flexibility)
- Validation is WARN, not REJECT (dumb router philosophy)
- schema.json is optional (skills work without it)
- Keyword search in garp_skills is case-insensitive substring matching (not semantic)
- Shared skill parsing module for metadata extraction from SKILL.md

### What Needs Design Decisions
- garp_skills output format: exact JSON structure (array vs object wrapper, field naming)
- garp_skills parameter schema: exact Zod definition for the query parameter
- Skill parsing algorithm: exact regex/logic for extracting description, when_to_use, field names from SKILL.md markdown
- schema.json validation logic: how to handle malformed schema.json files (skip validation? warn?)
- InboxEntry interface changes: exact field names and types for skill_description and response_fields
- garp_request return type change: how to add optional validation_warnings without breaking existing consumers
- Caching strategy in inbox: in-memory Map per request_type per scan, or something else

### Journey Artifacts Produced
| File | Contents |
|------|----------|
| docs/ux/code-mode/journey-skill-discovery-visual.md | Skill discovery ASCII flow with 4 flows and emotional annotations |
| docs/ux/code-mode/journey-skill-discovery.yaml | Structured journey schema with actors, flows, shared artifacts |
| docs/ux/code-mode/journey-skill-discovery.feature | Gherkin scenarios (16 scenarios across discovery, schema, inbox, compatibility) |
| docs/ux/code-mode/shared-artifacts-registry.md | Shared artifact registry tracking all data flow |

### Requirements Produced
| File | Contents |
|------|----------|
| docs/requirements/us-019-garp-skills-tool.md | garp_skills tool -- new MCP tool for skill discovery |
| docs/requirements/us-020-inbox-skill-enrichment.md | Inbox enrichment -- skill summary in inbox entries |
| docs/requirements/us-021-skill-schema-json.md | schema.json convention -- typed skill contracts with validation |
| docs/requirements/backlog-code-mode.md | This file |

### Discovery Artifacts (Input to This Wave)
| File | Contents |
|------|----------|
| docs/discovery/code-mode/problem-validation.md | Problem validation -- context pressure, discovery gap, typed contracts |
| docs/discovery/code-mode/opportunity-tree.md | Opportunity scoring -- 5 opportunities, top 4 pursued |
| docs/discovery/code-mode/solution-testing.md | Solution hypotheses and test plans for Phase A and B |
| docs/discovery/code-mode/lean-canvas.md | Lean canvas with risk assessment and go/no-go |
| docs/discovery/code-mode/interview-log.md | Evidence sources and methodology |

### Relationship to Phase B
Phase A is foundation, not throwaway:
- US-019's `garp_skills` becomes the implementation behind Phase B's `garp_discover` meta-tool
- US-021's `schema.json` becomes the input for Phase B's SDK type generation
- US-019's shared skill parsing module feeds Phase B's unified search
- US-020's inbox enrichment pattern extends to Phase B's richer metadata

Phase B stories (garp_discover, garp_execute, typed SDK generation, tool consolidation) will receive their own DISCUSS wave when tool count exceeds ~15 or skill count exceeds ~20.
