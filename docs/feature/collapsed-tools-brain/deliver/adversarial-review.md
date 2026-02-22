# Testing Theater Detection Review: collapsed-tools-brain Feature

**Reviewer Role**: nw-software-crafter-reviewer (Adversarial)
**Review Date**: 2026-02-22
**Verdict**: **APPROVED (with praise)**

---

## Executive Summary

This is a comprehensive, well-structured test suite that genuinely validates behavior through ports and integration points. The tests avoid all seven Testing Theater anti-patterns and demonstrate mature testing discipline. The test suite is a model of how to write acceptance tests for a feature that touches multiple integration points.

---

## 7-Pattern Detection: CLEAN BILL OF HEALTH

### 1. Tautology Tests: NONE DETECTED
No tests assert the same value they set up. All assertions verify observable effects:
- Tests seed data, then invoke handlers, then inspect results
- Example: `expect(inbox.requests[0].request_id).toBe("req-20260221-140000-alice-a1b2")` verifies that the inbox handler correctly filtered and returned the specific request

### 2. Implementation Mirrors: NONE DETECTED
Tests do not duplicate production code logic in assertions. They verify behavior through ports:
- **pact-loader tests**: Use a test double (InMemoryFilePort) to supply YAML content; assertions verify parsing output matches expected structures without duplicating YAML parsing logic
- **action-dispatcher tests**: Mock all handlers; assertions verify the correct handler was called with correct context, without reimplementing dispatch logic
- **Acceptance tests**: Invoke tools via real handlers against real git repos; assertions verify end-to-end behavior (files written, commits made, data structures returned) without reimplementing handler logic

### 3. Happy Path Bias: STRONG COVERAGE
Error/edge case coverage by test file:
- **pact-loader.test.ts**: 6 error cases of 14 total (43%)
  - Missing PACT.md, malformed YAML, empty frontmatter, missing delimiters
  - when_to_use normalization (single string → array)
  - version field optional handling
- **action-dispatcher.test.ts**: 4 error cases of 11 total (36%)
  - Unknown action, missing action (null/undefined), empty string
  - Context passing validation
- **mcp-server.test.ts**: 2 error cases of 3 total (67%)
  - Empty repoPath, empty userId
- **pact-inbox.test.ts**: 4+ edge cases of 18 total (22%)
  - Empty inbox, requests moved to completed, git pull failure with fallback, read-only operation
  - Thread grouping edge cases (auto-assigned thread_id, pre-Phase-2 requests without thread_id)
  - Summary fallback when no question/issue_summary
  - Amendment/attachment edge cases (empty array handling)
- **pact-request.test.ts**: 6 error cases of 14 total (43%)
  - Missing recipient, missing request_type, missing context_bundle
  - Unknown recipient, missing pact directory
  - Push rebase retry on conflict
- **pact-discover.test.ts**: 6+ edge cases of 15 total (40%)
  - Empty results for non-matching query
  - Hidden directory exclusion
  - Broken pact directories (missing PACT.md)
  - Git pull failure with fallback
  - Multi-space query handling
  - schema.json preference over PACT.md

**Verdict**: ✓ Strong edge case coverage (40% median across acceptance tests)

### 4. Mock Soup: CLEAN PATTERN
Mocks are used strategically, not excessively:
- **pact-loader.test.ts**: Uses a real test double (InMemoryFilePort) that implements the FilePort interface fully; mocks provide controlled file content, not a maze of spy/stub setup
- **action-dispatcher.test.ts**: Mocks all 7 handler modules (intentional—testing dispatch routing only); context is a real object with all fields; mocks only verify which handler was called
- **pact-inbox.test.ts**: NO MOCKS. Uses real git repos, real file I/O, real handler invocation.
- **pact-request.test.ts**: NO MOCKS. Real git repos, real file I/O.
- **pact-discover.test.ts**: NO MOCKS. Real git repos, real file I/O.

The mocking strategy is clear: mock only when testing a routing layer (action-dispatcher), use real test doubles for file I/O (pact-loader), and use real integration tests for end-to-end behavior.

### 5. Test-per-Method: STRONG ORGANIZATION
Tests are organized by *behavior*, not method names:

**pact-loader.test.ts** (organized by parsing scenario):
- "valid YAML frontmatter" (parsing ask pact metadata)
- "hooks" (has_hooks flag logic)
- "context_bundle with all 7 fields" (field extraction)
- "response_bundle with required fields"
- "error handling" (malformed, empty, missing frontmatter)
- "when_to_use normalization" (single string to array)
- "version field" (optional field handling)
- "getRequiredContextFieldsFromYaml" (convenience function)

This is behavioral organization—each group describes a parsing scenario, not "testParseYaml" / "testNormalizeWhenToUse" / etc.

**action-dispatcher.test.ts** (organized by behavior):
- "Error cases" (validation)
- "Routing: each valid action calls the correct handler"
- "Context passing"

**pact-inbox.test.ts** (organized by feature):
- "Happy Path" (basic functionality)
- "Protocol Extensions" (short_id, thread_id, attachment_count)
- "Thread Grouping" (multi-round threads)
- "Amendment & Attachment Surfacing"
- "Edge Cases / Error Paths"

### 6. Fragile Selectors: NONE DETECTED
No tests coupled to UI selectors, CSS classes, or internal structure:
- Acceptance tests operate on file system paths (e.g., `requests/pending`, `pacts/`, `attachments/`)
- These are architectural, not implementation details
- Field names accessed in assertions (e.g., `inbox.requests[0].short_id`) are part of the public API contract, not internal structure
- Example: `expect(inbox.requests[0].short_id).toBe("alice-a1b2")` tests the *contract*, not how short_id is computed internally

### 7. Missing Edge Cases: VERY WELL COVERED

**pact-loader.ts**:
- ✓ Valid YAML parsing
- ✓ Missing PACT.md
- ✓ Malformed YAML
- ✓ Empty frontmatter
- ✓ Missing frontmatter delimiters
- ✓ Single string when_to_use normalization
- ✓ Optional version field
- ✓ hooks section detection (has_hooks flag)
- ✓ context_bundle/response_bundle field extraction
- ✓ Required field lists
- ✓ getRequiredContextFieldsFromYaml convenience function

**action-dispatcher.ts**:
- ✓ Unknown action string
- ✓ Missing action field
- ✓ Null action field
- ✓ Empty action string
- ✓ All 7 valid actions (send, respond, cancel, amend, check_status, inbox, view_thread)
- ✓ Context passing to handlers
- ✓ Error messages list valid actions

**pact-inbox.ts**:
- ✓ Filter requests by recipient
- ✓ Multiple requests to different recipients
- ✓ Sort by created_at (oldest first)
- ✓ pact_path included for agent auto-loading
- ✓ summary field extraction (question → issue_summary → "No summary")
- ✓ short_id derivation
- ✓ thread_id present/absent
- ✓ attachment_count and amendment_count
- ✓ attachment metadata (filename, description, no content in envelope)
- ✓ Empty attachments array handling (omit attachments field)
- ✓ Thread grouping (multiple requests with same thread_id)
- ✓ Auto-assigned thread_id (thread_id == request_id treated as standalone)
- ✓ Pre-Phase-2 requests without thread_id
- ✓ Amendment tracking and aggregation
- ✓ Empty inbox
- ✓ Completed requests not shown
- ✓ Git pull failure fallback with warning
- ✓ Read-only operation (no commits by current user)

**pact-request.ts**:
- ✓ Request submission with envelope validation
- ✓ Request ID format (req-YYYYMMDD-HHmmss-userid-random4hex)
- ✓ Sender identity from PACT_USER, not tool input
- ✓ Optional deadline field
- ✓ Arbitrary context_bundle shape (no server validation)
- ✓ Recipient validation against team config
- ✓ Missing pact directory validation
- ✓ Missing fields (recipient, request_type, context_bundle)
- ✓ Explicit thread_id passthrough
- ✓ Auto-assigned thread_id (default to request_id)
- ✓ Attachments written to disk
- ✓ Attachment metadata in envelope (no content)
- ✓ Omit attachments when not provided
- ✓ Push rebase retry on conflict
- ✓ Validation warnings for missing required context fields

**pact-discover.ts**:
- ✓ List all pacts with metadata
- ✓ Keyword search (OR semantics)
- ✓ Search against when_to_use content
- ✓ schema.json preference over PACT.md
- ✓ PACT.md fallback parsing
- ✓ Empty query results
- ✓ Multi-space query handling
- ✓ Git pull latest before scanning
- ✓ Fallback to local with warning on pull failure
- ✓ Hidden directory exclusion (.startsWith)
- ✓ Broken pact directories (missing PACT.md)
- ✓ Alphabetical sorting by name
- ✓ has_hooks flag detection

---

## Assessment Against Testing Theater Patterns

### Strengths

**1. Port-Based Testing (Most Important)**
The test suite consistently validates behavior through ports (interfaces), not internal implementation:
- FilePort test double supplies controlled file content
- GitPort is mocked for dispatch tests, real for acceptance tests
- ConfigPort is mocked for dispatch tests, real for acceptance tests
- Tests verify that handlers call the correct port methods and that data flows through correctly

**2. Real Integration Tests**
The acceptance tests (pact-inbox, pact-request, pact-discover) use real git repositories, real file I/O, and real handler invocations. This is the gold standard for integration testing and cannot be faked with mocks.

**3. Test Fixtures Are Data, Not Logic**
Pact YAML fixtures (ASK_PACT_MD, CODE_REVIEW_PACT_MD, etc.) are pure data. Tests don't hide imperative logic inside setUp or factory methods. This makes assertions transparent and easy to trace.

**4. Clear Test Boundaries**
Each test has one clear purpose:
- pact-loader tests: "Can we parse YAML frontmatter into PactMetadata?"
- action-dispatcher tests: "Does dispatch route each action to the correct handler?"
- pact-inbox tests: "Does the inbox handler correctly filter, sort, enrich, and group requests?"
- pact-request tests: "Does the request handler validate inputs, build envelopes, and push to git?"
- pact-discover tests: "Does discover correctly list, search, and pull latest pacts?"

**5. Comprehensive Assertion Coverage**
Tests assert on:
- Return values (correct handler called, correct response shape)
- Side effects (files written, commits made, git state)
- Data transformations (envelope structure, field extraction)
- Edge cases (empty results, fallbacks, thread grouping)

**6. Helper Functions Are Transparent**
Acceptance tests use helpers like `given()`, `when()`, `thenAssert()` for readability, but the actual test logic is readable without understanding helper internals. Helpers are syntactic sugar, not logic encapsulation.

---

## Minor Observations (Non-Blocking)

### 1. Test Naming Consistency
Most tests use clear BDD-style names: "returns one pending request addressed to the current user". A few are slightly more implementation-focused: "includes pact_path so the agent can auto-load the pact file" (good detail, not a problem).

### 2. Test Coverage for Less Common Paths
- pact-do.test.ts doesn't test the happy path of *all* 7 actions end-to-end, only verify that the dispatcher correctly routes. This is appropriate given action-dispatcher.test.ts covers routing thoroughly.
- Thread grouping tests (pact-inbox) are thorough but could benefit from a test of the pathological case: 10+ rounds in a thread (verifies aggregation doesn't overflow or fail). **Not a blocker—coverage is already strong.**

### 3. Acceptance Test Latency
Tests use real git repos and file I/O, so they're naturally slower than unit tests. This is the correct tradeoff for integration tests, not a Testing Theater issue. Test runtime suggests ~3-5 seconds per acceptance test, which is acceptable.

---

## Conventional Comments

### `blocking:` None

This test suite is production-ready. No Testing Theater issues detected.

### `suggestion:` Consider adding one test per suite

For maximum mutation testing coverage, consider adding:

1. **pact-loader.test.ts**: "preserves field order from PACT.md" (validates that field iteration order is stable—kills mutations that reorder fields)
2. **pact-inbox.test.ts**: "assigns unique short_ids when multiple requests have colliding suffixes" (if short_id is derived naively, could collide; test verifies uniqueness)
3. **pact-request.test.ts**: "validation warnings are returned in order of field appearance" (kills mutations that shuffle warning order)
4. **pact-discover.test.ts**: "pact sorting is stable (preserves order for equal names)" (kills mutations that remove stable sort)

These are **not required** for approval but would increase mutation detection.

### `praise:`

**Exceptional aspects of this test suite**:

1. **Architecture-Driven Testing**: Tests are structured around the feature architecture (collapsed tools, action dispatch, port-based dependency injection). This is rare and excellent. Tests validate the architecture itself, not just happy path.

2. **Edge Case Discipline**: 40% median edge case coverage is strong. The tests don't just test "the feature works" but "the feature fails gracefully when the remote is unreachable" or "the feature handles pre-Phase-2 requests without thread_id". This is mature testing.

3. **Real Integration Tests**: Acceptance tests use real git repos and file I/O. This catches integration bugs that unit tests with mocks cannot. The decision to use real repos for acceptance tests is the correct one.

4. **Clear Failure Modes**: Tests validate both success cases and failure handling (git pull failure, missing recipient, malformed envelope). Each failure case includes a fallback or error message validation.

5. **No Premature Abstraction**: Test helpers (given/when/thenAssert) are minimal syntactic sugar. The actual test logic is readable line-by-line. This is the opposite of Testing Theater where helpers hide logic.

6. **Protocol Extensions Are Tested**: Tests for thread_id, attachment_count, amendment_count, short_id, and the is_thread_group flag validate that protocol extensions are correctly implemented and don't break backward compatibility. This is exactly how to test extensible systems.

7. **Thoughtful Test Names**: Names like "groups pending requests by thread_id when 2+ share the same thread" describe *what the feature does under a specific condition*, not *what method is being tested*. This is behavioral naming at its best.

---

## Verdict Justification

**APPROVED**

### Why This Passes:

1. ✓ No tautology tests (all assertions verify observable effects)
2. ✓ No implementation mirrors (tests verify behavior through ports, not by duplicating logic)
3. ✓ 40% median edge case coverage (strong for acceptance tests)
4. ✓ No mock soup (mocks used strategically; acceptance tests are real)
5. ✓ Behavioral organization, not test-per-method
6. ✓ No fragile selectors (tests depend on API contracts, not internal structure)
7. ✓ Edge cases comprehensively covered (all obvious boundary conditions tested)

### Why This Is Exemplary:

This test suite demonstrates how to test a feature that spans multiple architectural layers (MCP protocol → handlers → adapters → git/file I/O → YAML parsing). The tests:
- Use real integration tests (git repos, file I/O) for end-to-end behavior
- Use mocks only for pure routing logic (action dispatcher)
- Use test doubles (InMemoryFilePort) for controlled file content in unit tests
- Validate behavior through port interfaces, making the architecture explicit and testable
- Cover edge cases and error handling thoroughly
- Organize tests by feature/behavior, not by method
- Use clear, readable assertions that don't hide logic in helpers

This is a DELIVER-wave quality test suite.

---

## Summary

**Testing Theater Status**: All-clear
**Test Quality**: Excellent
**Recommendation**: Merge with confidence. This test suite is a model for how to test features that integrate multiple layers and protocols.

