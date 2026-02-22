# Definition of Ready Validation -- PACT Code Mode Phase A

## Date: 2026-02-22
## Stories Validated: US-019, US-020, US-021

---

## US-019: Pact Discovery Tool (pact_pacts)

### 1. Problem statement clear and in domain language
**PASS**
Problem articulates two concrete pain points:
- Cory cannot remember which pact type to use ("was it code-review or sanity-check?")
- Maria Santos is new and has no way to discover the catalog
Both are described in domain language (pacts, request types, PACT.md) without technical jargon. The scaling consequence is quantified: 1,340 tokens at 4 pacts, 33,600 at 100 pacts.

### 2. User/persona identified with specific characteristics
**PASS**
- Cory: developer composing a PACT request, knows the system but cannot remember exact pact names
- Maria Santos: new team member, has never seen the pact catalog, needs guided discovery
Both have distinct characteristics and motivations. Not generic "user" placeholders.

### 3. At least 3 domain examples with real data
**PASS** (3 examples)
- Example 1: Cory lists all pacts, agent selects "code-review" for "Can someone review my auth changes?" -- includes full catalog listing with real pact names and field lists
- Example 2: Maria Santos searches "review code changes" and finds code-review -- includes real query, real result with description and context_fields
- Example 3: Cory searches "deploy pipeline" with no match -- includes real query, empty result, agent fallback behavior

### 4. UAT scenarios in Given/When/Then (3-7 scenarios)
**PASS** (7 scenarios)
1. List all available pacts (happy path)
2. Search by keyword (happy path search)
3. Search matches against when_to_use
4. Search with no matches (boundary)
5. Prefers schema.json when available
6. Falls back to PACT.md (backward compat)
7. Git pull before scanning (infrastructure)

### 5. Acceptance criteria derived from UAT
**PASS**
8 acceptance criteria, each traceable to at least one scenario:
- Registered as MCP tool (from scenario 1)
- Optional query parameter (from scenarios 1-4)
- Returns all pacts when no query (from scenario 1)
- Each entry includes name, description, etc. (from scenarios 1-2)
- Case-insensitive search (from scenarios 2-3)
- Prefers schema.json (from scenario 5)
- Git pull with fallback (from scenario 7)
- Empty array not error (from scenario 4)

### 6. Story right-sized (1-3 days, 3-7 scenarios)
**PASS**
Estimated 2-3 days. 7 scenarios. Single tool following existing patterns (similar to pact_thread or pact_status). Demonstrable in a single session: call pact_pacts, see results.

### 7. Technical notes identify constraints and dependencies
**PASS**
Notes specify: handler pattern, parsing strategy (H1, When To Use, field tables), schema.json preference, search algorithm (case-insensitive substring), shared module recommendation, tool registration position (8th tool).

### 8. Dependencies resolved or tracked
**PASS**
No blocking dependencies. US-021 (schema.json) noted as beneficial. Shared parsing module noted as consumed by US-020.

---

## US-020: Inbox Pact Enrichment

### 1. Problem statement clear and in domain language
**PASS**
Problem is highly specific: "three additional file reads totaling 221 lines of markdown just to understand what each request expects." Quantifies the exact token cost (66 + 128 + 27 lines). Describes the user's flow (check inbox, read PACT.md for each type, then respond).

### 2. User/persona identified with specific characteristics
**PASS**
- Dan: developer checking inbox with multiple pending requests of different types
Specific context: multiple request types, needs to orient quickly, wants to prioritize.

### 3. At least 3 domain examples with real data
**PASS** (3 examples)
- Example 1: Dan sees sanity-check enrichment -- includes real field names (answer, evidence, concerns, recommendation) and real description
- Example 2: Dan has 3 different types (sanity-check, code-review, ask) -- shows different response_fields for each
- Example 3: ask pact without schema.json still gets enrichment from PACT.md parsing

### 4. UAT scenarios in Given/When/Then (3-7 scenarios)
**PASS** (5 scenarios)
1. Inbox entry includes pact description
2. Inbox entry includes response field names
3. Enrichment uses schema.json when available
4. Falls back to PACT.md
5. Graceful degradation when pact missing

### 5. Acceptance criteria derived from UAT
**PASS**
5 acceptance criteria, each traceable:
- pact_description included (from scenario 1)
- response_fields included (from scenario 2)
- Prefers schema.json (from scenario 3)
- Graceful degradation (from scenario 5)
- Existing fields unchanged (from all scenarios)

### 6. Story right-sized (1-3 days, 3-7 scenarios)
**PASS**
Estimated 1 day. 5 scenarios. Modifies existing tool (pact_inbox) with 2 new fields. Demonstrable in a single session: call pact_inbox, see enriched entries.

### 7. Technical notes identify constraints and dependencies
**PASS**
Notes specify: InboxEntry interface modification, shared module reuse, graceful degradation on missing pacts, caching per request_type, InboxThreadGroup update.

### 8. Dependencies resolved or tracked
**PASS**
US-019 noted as beneficial (shared parsing module). US-021 noted as beneficial (schema.json). Both are non-blocking -- enrichment works with PACT.md parsing alone.

---

## US-021: Machine-Readable Pacts (schema.json)

### 1. Problem statement clear and in domain language
**PASS**
Problem identifies the specific failure mode: "agent might miss that involved_files expects an array (not a string), or include zendesk_ticket as required when it is optional." Describes the markdown interpretation problem in domain terms.

### 2. User/persona identified with specific characteristics
**PASS**
- Cory: developer whose agent needs precise field requirements
- Dan: receiver whose agent needs to validate response coverage
- Pact authors: want contracts followed accurately
Three distinct personas with different motivations.

### 3. At least 3 domain examples with real data
**PASS** (3 examples)
- Example 1: Cory's agent reads schema.json and correctly types involved_files as array -- includes real field names, real data values
- Example 2: Validation warns on missing customer and product -- includes real warning messages with schema name and version
- Example 3: Ask pact without schema.json works unchanged -- demonstrates backward compatibility

### 4. UAT scenarios in Given/When/Then (3-7 scenarios)
**PASS** (7 scenarios)
1. schema.json defines both bundle schemas
2. Validates and warns on missing fields
3. No warnings when all fields present
4. No validation when schema.json absent
5. additionalProperties allows extra fields
6. schema.json created for sanity-check
7. schema.json created for code-review

### 5. Acceptance criteria derived from UAT
**PASS**
7 acceptance criteria, each traceable:
- schema.json for all 4 pacts (from scenarios 6-7)
- JSON Schema draft 2020-12 (from scenario 1)
- additionalProperties: true (from scenario 5)
- Validation in pact_request (from scenario 2)
- Warnings not rejections (from scenario 2)
- No validation without schema (from scenario 4)
- Alignment with PACT.md (from scenarios 6-7)

### 6. Story right-sized (1-3 days, 3-7 scenarios)
**PASS**
Estimated 1-2 days. 7 scenarios. Deliverables: 4 schema.json files + validation logic in pact_request. Demonstrable in a single session: submit request with missing fields, see warnings.

### 7. Technical notes identify constraints and dependencies
**PASS**
Notes specify: file location, validation placement in pact_request.ts, key-presence-only validation strategy, return type change, additionalProperties rationale, manual authoring for 4 pacts, version strategy deferred to Phase B.

### 8. Dependencies resolved or tracked
**PASS**
No blocking dependencies. Consumed by US-019 and US-020 (noted). Recommended ordering (US-021 first) is explained but not required.

---

## Summary

| DoR Item | US-019 | US-020 | US-021 |
|----------|--------|--------|--------|
| 1. Problem statement | PASS | PASS | PASS |
| 2. User/persona | PASS | PASS | PASS |
| 3. 3+ domain examples | PASS (3) | PASS (3) | PASS (3) |
| 4. UAT scenarios (3-7) | PASS (7) | PASS (5) | PASS (7) |
| 5. AC from UAT | PASS | PASS | PASS |
| 6. Right-sized | PASS | PASS | PASS |
| 7. Technical notes | PASS | PASS | PASS |
| 8. Dependencies | PASS | PASS | PASS |

**All 3 stories pass all 8 DoR items. Ready for DESIGN wave handoff.**
