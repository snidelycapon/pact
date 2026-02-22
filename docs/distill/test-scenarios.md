# Acceptance Test Scenarios -- PACT MVP

## Overview

| Test File | Traces To | Scenarios | Skipped | Error/Edge | Error % |
|-----------|-----------|-----------|---------|------------|---------|
| walking-skeleton.test.ts | US-001, US-008 | 3 | 2 | 0 | n/a |
| pact-request.test.ts | US-002 | 11 | 11 | 6 | 55% |
| pact-inbox.test.ts | US-003 | 9 | 9 | 4 | 44% |
| pact-respond.test.ts | US-004 | 10 | 10 | 5 | 50% |
| pact-status.test.ts | US-005 | 8 | 8 | 4 | 50% |
| pact-contract.test.ts | US-006 | 7 | 7 | 3 | 43% |
| **Total** | | **48** | **47** | **22** | **46%** |

Walking skeleton scenario 1 is the first to enable. All others are `it.skip` or `it.todo`.

Error/edge path ratio across all feature tests: **22 of 45 focused scenarios = 49%** (exceeds 40% target).

## Test Infrastructure

All tests use real local git repos (bare remote + two clones). No mocks at the acceptance level. No network access.

| Helper | Purpose |
|--------|---------|
| `helpers/setup-test-repos.ts` | Creates bare remote + Alice clone + Bob clone with standard structure |
| `helpers/gwt.ts` | Given/When/Then step wrappers for readability |

## Scenario Inventory

### walking-skeleton.test.ts (US-001 + US-008)

| # | Scenario | Type |
|---|----------|------|
| 1 | Alice sends a request, Bob receives and responds, Alice sees the response | Walking skeleton |
| 2 | Git log shows structured commit messages for the full round-trip | Walking skeleton |
| 3 | Request and response are accessible from a fresh server instance | Walking skeleton |

### pact-request.test.ts (US-002)

| # | Scenario | Type |
|---|----------|------|
| 1 | Submits a sanity-check request with valid envelope and pushes to remote | Happy path |
| 2 | Generates a request ID matching the required format | Happy path |
| 3 | Includes sender identity from PACT_USER, not from tool input | Happy path |
| 4 | Includes optional deadline field when provided | Happy path |
| 5 | Accepts any context_bundle shape without server validation | Happy path |
| 6 | Rejects request to a recipient not in team config | Error |
| 7 | Rejects request when request_type has no matching pact directory | Error |
| 8 | Rejects request missing required field: recipient | Error |
| 9 | Rejects request missing required field: request_type | Error |
| 10 | Rejects request missing required field: context_bundle | Error |
| 11 | Retries push after rebase when remote has new commits | Edge |

### pact-inbox.test.ts (US-003)

| # | Scenario | Type |
|---|----------|------|
| 1 | Returns one pending request addressed to the current user | Happy path |
| 2 | Only shows requests addressed to the current user, not others | Happy path |
| 3 | Returns requests ordered by creation time, oldest first | Happy path |
| 4 | Includes pact_path so the agent can auto-load the pact file | Happy path |
| 5 | Includes a summary from the context bundle for triage | Happy path |
| 6 | Returns zero results when inbox is empty | Edge |
| 7 | Does not show requests that have been moved to completed | Edge |
| 8 | Falls back to local state with a warning when git pull fails | Error |
| 9 | Inbox is a read-only operation -- no commits or pushes | Edge |

### pact-respond.test.ts (US-004)

| # | Scenario | Type |
|---|----------|------|
| 1 | Writes response, moves request to completed, commits and pushes | Happy path |
| 2 | Response write and request move happen in a single atomic commit | Happy path |
| 3 | Commit message follows structured format | Happy path |
| 4 | Responder identity is set from PACT_USER, not tool input | Happy path |
| 5 | Accepts any response_bundle shape without validation | Happy path |
| 6 | Rejects response when request is already completed | Error |
| 7 | Rejects response when current user is not the designated recipient | Error |
| 8 | Rejects response when request ID does not exist | Error |
| 9 | Rejects response missing required field: response_bundle | Error |
| 10 | Retries push after rebase when remote has new commits | Edge |

### pact-status.test.ts (US-005)

| # | Scenario | Type |
|---|----------|------|
| 1 | Returns completed status with full response for a finished request | Happy path |
| 2 | Returns pending status with no response for a waiting request | Happy path |
| 3 | Includes the original request data in the status response | Happy path |
| 4 | Finds a request regardless of which lifecycle directory it is in | Happy path |
| 5 | Returns an error when request ID does not exist in any directory | Error |
| 6 | Falls back to local state with warning when git pull fails | Error |
| 7 | Status check is read-only -- no commits are created | Edge |
| 8 | Works from any session -- not tied to the session that created the request | Edge |

### pact-contract.test.ts (US-006)

| # | Scenario | Type |
|---|----------|------|
| 1 | pact_request accepts a request when the pact directory exists | Happy path |
| 2 | pact_inbox includes the pact_path for each pending request | Happy path |
| 3 | Newly created pact type is available after git pull | Happy path |
| 4 | Updated pact file is synced to all clones via git pull | Happy path |
| 5 | pact_request rejects a request type with no pact directory | Error |
| 6 | pact_request rejects when PACT.md file is missing (directory but no file) | Error |
| 7 | Pact validation happens before envelope is written | Error |

## User Story Coverage

| Story | Scenarios | Covered By |
|-------|-----------|------------|
| US-001 | 3 | walking-skeleton.test.ts (repo structure verified in setup) |
| US-002 | 11 | pact-request.test.ts |
| US-003 | 9 | pact-inbox.test.ts |
| US-004 | 10 | pact-respond.test.ts |
| US-005 | 8 | pact-status.test.ts |
| US-006 | 7 | pact-contract.test.ts |
| US-007 | -- | Out of scope: source config is Craft Agents integration, not server logic |
| US-008 | 3 | walking-skeleton.test.ts |

US-007 (Craft Agents source integration) is not covered by automated acceptance tests because it validates platform integration behavior, not PACT server logic. It is covered by the manual testing checklist in the testing strategy.

## Implementation Order

1. `walking-skeleton.test.ts` -- skeleton 1 (full round-trip)
2. `pact-request.test.ts` -- scenarios 1, 6, 7, 8
3. `pact-inbox.test.ts` -- scenarios 1, 2, 6
4. `pact-respond.test.ts` -- scenarios 1, 6, 7, 8
5. `pact-status.test.ts` -- scenarios 1, 2, 5
6. `pact-contract.test.ts` -- scenarios 1, 5
7. Remaining scenarios in dependency order

Enable one `it.skip` at a time. Implement production code until it passes. Commit. Repeat.
