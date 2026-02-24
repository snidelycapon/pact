# Roadmap Review: pact-fmt (pact-y30)

**Reviewer**: nw-software-crafter-reviewer
**Date**: 2026-02-24
**Verdict**: NEEDS_REVISION

---

## Executive Summary

The pact-fmt roadmap is **well-structured and properly grounded in design decisions** (ADR-020, apathy audit, data-models.md). The 11 steps are organized into 4 logical phases with good test coverage (29 scenarios). However, **acceptance criteria have coupling and clarity issues** that will cause implementation ambiguity.

**Key Problems:**
1. Inheritance resolution is coupled to discovery in a way that makes the "extends field consumed" requirement unclear
2. Compressed catalog format is under-specified (exact format, metadata inclusion not defined)
3. Group request status completion semantics are ambiguous (all recipients vs. current user)
4. Backward compatibility file detection order is implicit, not explicit
5. Send-time validation and respond-time authorization are mixed in Phase 04

**Impact**: Not blockers if you know the design, but will surface as rework during code review.

---

## Detailed Findings

### Phase 01: Flat-File Pact Store and Inheritance

#### Step 01-01: Flat-file pact loader with extended metadata

**Status**: Well-scoped, clear AC ✓

**Praise:**
- AC is behavioral and measurable (recursive glob, file handling, error cases)
- Good coverage of edge cases (malformed YAML, missing name, non-.md files)
- Proper fallback behavior (empty directory returns empty array)

**Notes:**
- Current implementation only supports `pacts/{name}/PACT.md` — this is a full replacement
- Test coverage: y30-flat-file-loader.test.ts lines 204-631 (16 scenarios, 44% error coverage)

---

#### Step 01-02: Single-level pact inheritance resolution

**Status**: ISSUE — Atomicity and coupling ❌

**Problem:**
The AC describes three separate concerns:
1. Load and parse pacts (including those with extends field)
2. Resolve inheritance at discovery time (merge fields, consume extends)
3. Flatten both base and variant into the catalog

These are **coupled** in the AC but should be separate operations:
```
Current (coupled):
  Load → Resolve → Discover (all in one step)

Better (atomic):
  01-01: Load all pacts (extends field visible in output)
  01-02: Resolve inheritance (merge fields, consume extends)
  01-03: Discover tool integration (flatten to catalog)
```

**Specific Coupling Problem:**
The AC says "extends field is consumed and absent from output" but doesn't specify *when*:
- After loading? Then 01-01 needs to know about inheritance
- After resolution? Then 01-02 needs to say what 01-01 output looks like
- During discovery? Then pact_discover needs to do the resolution

The tests reveal the intent (resolution at load time, not at discovery), but AC doesn't make this explicit.

**Merge Semantics Unclear:**
The AC specifies behavior (child overrides description, scope; context_bundle merges; defaults merge) but doesn't clarify:
- What if child omits a field that parent defines? (inherit parent value)
- What if child omits defaults entirely? (inherit parent defaults as-is, or use protocol fallback?)
- Are defaults merged recursively or shallow? (shallow merge is correct per data-models.md, but AC doesn't say)

**Test Coverage:** y30-flat-file-loader.test.ts lines 320-402 (valid inheritance, catalog flattening, variant resolution)

**Required Fix:**
- Clarify in AC that extends field is present after parsing, consumed during resolution
- Explicitly document merge semantics for each field type
- Consider moving "Discover tool integration" (01-03) to happen *after* resolution works

---

#### Step 01-03: Discover tool integration with flat-file fallback

**Status**: ISSUE — Circular dependency ⚠️

**Problem:**
The AC assumes "PactCatalogEntry output includes extended metadata fields (scope, defaults, multi_round, attachments, registered_for, has_hooks)". But where does this structure come from?

- **If inherited from 01-02**: Then 01-03 depends on inheritance resolution being complete, but 01-02 hasn't been merged yet. This is a backwards dependency.
- **If defined in 01-03**: Then "extended metadata" isn't defined until discovery, which violates the layering (discovery should consume metadata, not define it).

The tests (y30-flat-file-loader.test.ts, discovery tests) assume `result.pacts[].scope` etc. exist, which means the schema/structure must be defined *before* discovery is implemented.

**Backward Compatibility Note:**
AC correctly specifies fallback behavior (try pact-store/ first, fall back to pacts/ directory). ✓

**Required Fix:**
- Document that PactCatalogEntry is extended in 01-02 or 01-03 to include scope, defaults, etc.
- Make it clear whether old pacts/{name}/PACT.md format returns these fields (empty? inherited from pact-loader defaults?)

---

### Phase 02: Compressed Catalog and Scope Filtering

#### Step 02-01: Compressed pipe-delimited catalog format

**Status**: ISSUE — Format under-specified ❌

**Problem:**
The AC describes the *intent* ("pipe-delimited entries") but not the exact format.

Test shows:
```
ask|Get input that unblocks current work|global|question→answer
```

But the AC says:
```
name|description|scope|context_required→response_required
```

Several ambiguities:
1. **What is "context_required→response_required"?**
   - Is it comma-separated field names? `question,background→answer,reasoning`?
   - Count of required fields? `1→1`?
   - The test format (`question→answer`) shows field names, but AC doesn't specify this explicitly.

2. **Are defaults included?**
   - Test doesn't show defaults in compressed format, but AC doesn't say they're excluded
   - Should compressed format include scope qualifiers? (registered_for values)

3. **Do inherited variants show original or resolved values?**
   - Example: if request:backend extends request and overrides context_bundle.required,
     does compressed format show parent's original or child's resolved required list?
   - AC says "Inheritance-resolved variants appear as fully resolved entries" but doesn't
     define "fully resolved" for compression.

4. **What about optional fields?**
   - If a pact has no defaults, is the line shorter? Or are defaults always included (empty if omitted)?
   - Same for attachments, multi_round, etc.

**Required Fix:**
- Provide exact BNF or examples for the pipe-delimited format
- Explicitly list all fields and their order
- Show examples for inherited variants and missing optional fields

**Test Coverage:** y30-compressed-catalog.test.ts lines 126-188 (format generation, matching, empty catalog)

---

#### Step 02-02: Discover tool schema update

**Status**: Clear ✓

**Notes:**
- AC correctly specifies schema changes (format, scope parameters)
- Backward compatible (both optional)
- Implementation requires updates to mcp-server.ts Zod schema

**Minor Note:**
- AC doesn't mention that the MCP server must expose `format` and `scope` parameters in the tool definition. Consider adding this as explicit AC.

---

#### Step 02-03: Scope filtering and edge cases

**Status**: Well-specified ✓

**Notes:**
- Good coverage of empty results, invalid scope, mixed formats
- AC correctly handles error cases (no error thrown, just empty results)
- Test coverage is comprehensive (y30-compressed-catalog.test.ts lines 194-314)

---

### Phase 03: Group Addressing with Per-Respondent Responses

#### Step 03-01: Recipients array schema and send handler

**Status**: ISSUE — Validation timing unclear ⚠️

**Problem:**
The AC specifies validation requirements but doesn't define *when* they happen:

> "The send handler validates that all recipient user_ids exist in the team config,
> the sender is not in the recipients array, and the array is non-empty."

Questions:
1. **When are these checks performed?**
   - During `pact_do` call (send-time validation)?
   - When writing the envelope (envelope-write-time)?
   - Does failure prevent the envelope from being written at all?

2. **What happens with a missing user_id?**
   - AC says "validates that all user_ids exist" — does this mean:
     - Fail the entire send? (current assumption)
     - Skip missing users silently? (not recommended)
     - Partial failure? (unclear)

3. **Is the sender check part of send validation or response authorization?**
   - AC puts it in send handler, tests confirm this ✓
   - But AC should explicitly say: "send fails with error" not "send handler validates"

**Current Schema State:**
The RequestEnvelopeSchema (schemas.ts) still has `recipient: UserRef`, not `recipients[]`.
This needs to be updated, and read-coercion rules must be in place to support old format.

**Required Fix:**
- AC should say: "send handler FAILS with error when recipients list contains unknown user"
- Specify that validation happens before envelope is written
- Note the schema migration (recipient → recipients[]) as a prerequisite

**Test Coverage:** y30-group-walking-skeleton.test.ts lines 86-219 (valid send), y30-group-error-paths.test.ts lines 85-164 (validation errors)

---

#### Step 03-02: Per-respondent response storage and inbox filtering

**Status**: ISSUE — Status semantics unclear ❌

**Problem:**
The AC says:

> "The request stays in requests/pending/ (not moved to completed) when recipients
> remain who have not responded."

This implies a status field on the request envelope. But:
1. **When is status updated?**
   - After each response? Then the request envelope must be read and updated
   - Only checked when querying status? Then status is computed, not stored
   - AC doesn't clarify

2. **What does "completed" mean in a group context?**
   - All recipients have responded? (most likely, but not stated)
   - Current user has responded? (would break sender's ability to check all responses)
   - At least one recipient responded? (doesn't make sense)

3. **How does inbox filtering work with partial responses?**
   - AC says: "Inbox filtering matches requests where recipients.some(r => r.user_id === userId)"
   - This is for *listing* requests, not filtering by completion status
   - But what if you want to see only requests that *haven't* been answered by you?

**Required Fix:**
- Clarify: "request stays in pending/ until all recipients have responded"
- Document whether status is computed (on read) or stored (in envelope)
- Specify inbox filtering behavior for partially-responded requests

**Test Coverage:** y30-group-walking-skeleton.test.ts lines 225-303, y30-group-error-paths.test.ts lines 311-356 (status, thread views)

---

#### Step 03-03: Status and thread aggregation

**Status**: Mostly clear, minor gap ✓

**Notes:**
- AC correctly specifies per-respondent response aggregation
- Status check with both bob.json and carol.json present returns both ✓
- Thread view properly aggregates responses ✓

**Minor Issue:**
- AC doesn't mention what happens if a recipient appears in recipients[] but has no response file
  - Does status still say "pending"? (yes, implied)
  - Does thread view include a placeholder? (probably not, but AC doesn't say)

---

### Phase 04: Error Paths and Backward Compatibility

#### Step 04-01: Group validation error paths

**Status**: ISSUE — Mixed validation and authorization ⚠️

**Problem:**
The AC conflates two different failure modes:

**Send-Time Validation** (01-01, 01-02, 01-03 in AC):
- Unknown user_id in recipients → validation error, no envelope written
- Empty recipients array → validation error, no envelope written
- Sender in recipients → validation error, no envelope written

**Respond-Time Authorization** (01-04, 01-05 in AC):
- Non-recipient trying to respond → authorization error, no response written
- Duplicate response → state error, response rejected

These should be tested and implemented separately because:
- Send validation is idempotent (always fails for the same input)
- Respond authorization depends on request state (file-based)

**Test Structure:**
Tests properly separate these (y30-group-error-paths.test.ts lines 85-164 vs. 170-253), but AC bundles them.

**Required Fix:**
Split 04-01 into two steps:
- 04-01a: Send-time validation (unknown user, empty array, sender-in-recipients)
- 04-01b: Respond-time authorization (non-recipient, duplicate response)

**Test Coverage:** y30-group-error-paths.test.ts lines 85-253 (all error scenarios)

---

#### Step 04-02: Backward-compatible readers for old formats

**Status**: ISSUE — Read-coercion rules implicit ⚠️

**Problem:**
The AC describes what must work (old format readable by new code) but not *how*:

> "Inbox reads old-format request envelopes with singular recipient field (not recipients[])
> and still surfaces them to the correct user. Status reads old-format single response files."

Questions:
1. **What is the read-coercion order for request envelopes?**
   - Try to parse as new format (recipients[])?
   - Fall back to old format (recipient) if missing?
   - Or always check both?

2. **What about response files?**
   - AC says "read old-format single response files (responses/{id}.json as a file)"
   - But what if both exist: `responses/{id}.json` (file) and `responses/{id}/bob.json` (directory)?
   - Which takes precedence? (directory is new format, should probably win)

3. **What does "still surfaces them to the correct user" mean?**
   - The old format has `recipient: { user_id: "bob", ... }`
   - The new code tries to match against `recipients[].user_id`
   - Does the coercion happen on read or at query time?

**Data Models Clarification:**
The data-models.md document specifies read coercion (lines 284-291):
> "1. Check if responses/{request_id} is a directory → new format
> 2. Check if responses/{request_id}.json is a file → old format
> 3. New responses always use the directory format"

This should be in AC for step 04-02, not just in design docs.

**Required Fix:**
- Add explicit read-coercion rules to AC
- Specify file detection order (directory first, then file)
- Document that new writes always use new format (no writes to old format)

**Test Coverage:** y30-group-error-paths.test.ts lines 259-305 (backward compat reads)

---

## Cross-Cutting Issues

### 1. Implementation Scope Not Traced to Tests

Each step should reference the test file(s) and specific scenarios that validate it. Current state:

```yaml
implementation_scope:
  test_directories:
    - tests/acceptance/
```

Should be:
```yaml
implementation_scope:
  steps_to_tests:
    01-01: y30-flat-file-loader.test.ts:204-631
    01-02: y30-flat-file-loader.test.ts:320-402
    01-03: y30-flat-file-loader.test.ts:204-248
    02-01: y30-compressed-catalog.test.ts:126-188
    ...
```

This prevents scope creep and makes acceptance criteria testable.

### 2. Schema Updates Not Mentioned

Several steps require schema changes (RequestEnvelopeSchema, PactCatalogEntry), but the roadmap doesn't list them as dependencies:
- 01-02: Need to extend PactMetadata with scope, defaults, extends, etc.
- 03-01: Need to change RequestEnvelopeSchema (recipient → recipients[])
- 02-02: Need to update pact_discover schema in mcp-server.ts

Consider adding a "Schema Changes" section or noting these as prerequisites.

### 3. Step Decomposition Ratio at Limit

Currently 11 steps / 6-7 affected files ≈ 1.6x (within 2.5x limit). With suggested splits:
- Add 04-01b (respond-time authorization)
- Possibly add 01-02b (catalog flattening)

This brings ratio to ~13-14 steps / 6-7 files ≈ 1.9-2.0x, which is acceptable but at the upper bound. Monitor for further splits.

---

## Recommendations

### Priority 1 (Blocking): Clarify Coupling

1. **Separate inheritance loading from resolution:**
   - 01-01: Load and parse (extends field visible)
   - 01-02: Resolve inheritance (merge fields, consume extends)
   - 01-03: Discover tool integration (use resolved pacts)

2. **Specify merge semantics explicitly:**
   - Child overrides: name, description, scope, registered_for, when_to_use
   - Child replaces: context_bundle.required, response_bundle (if defined)
   - Child merges: context_bundle.fields, response_bundle.fields, defaults (shallow), attachments (replace)
   - Full spec in docs/discovery/pact-format-spec.md (line 308-314) should be referenced in AC

3. **Define compressed format exactly:**
   - Provide BNF or multiple worked examples
   - Show what happens with inherited variants, missing defaults, no attachments
   - AC should be testable without reading test code

### Priority 2 (High): Clarify Validation and Authorization

4. **Split 04-01 into validation and authorization:**
   - 04-01a: Send-time validation (schema check + sender check)
   - 04-01b: Respond-time authorization (recipient check + duplicate check)

5. **Specify status semantics for group requests:**
   - "Pending" = at least one recipient hasn't responded yet
   - "Completed" = all recipients have responded
   - Status is stored in request envelope (not computed)

6. **Define read-coercion rules:**
   - Request envelope: try recipients[] first, fall back to recipient
   - Response files: check directory first (new format), then file (old format)
   - All new writes use new format only

### Priority 3 (Medium): Improve Traceability

7. **Add test cross-reference:**
   - Each step should list test file(s) and line ranges
   - AC should be specific enough that tests don't surprise implementer

8. **Document schema prerequisites:**
   - List schema changes needed before each step
   - Make sure RequestEnvelopeSchema and PactCatalogEntry are updated before implementation starts

9. **Clarify MCP server changes:**
   - Step 02-02 should mention pact_discover tool definition update
   - Step 03-01 should mention pact_do schema update (recipients parameter)

---

## Verdict Rationale

**NEEDS_REVISION** because:
- ✓ Structure and phasing are correct
- ✓ Test coverage is comprehensive
- ✓ Grounded in solid design (ADR-020, apathy audit)
- ✗ Acceptance criteria have coupling issues (inheritance, discovery)
- ✗ Format specifications are under-specified (compressed catalog)
- ✗ Status/validation semantics are ambiguous
- ✗ File format detection rules are implicit

These are clarification-level issues, not fundamental design problems. With the suggested changes, the roadmap will be **APPROVED** and ready for implementation.

---

## Approval Gate

To move to **APPROVED**:
1. [ ] Split 01-02 into resolution + catalog flattening
2. [ ] Add explicit merge semantics for inheritance
3. [ ] Document compressed format with examples
4. [ ] Clarify group request status semantics
5. [ ] Add send validation vs. respond authorization split
6. [ ] Document read-coercion rules for backward compat
7. [ ] Add test file cross-references
8. [ ] List schema prerequisites
9. [ ] Update validation.status to "approved" and validation.approved_at to timestamp
