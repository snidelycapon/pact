# Walking Skeleton Test Strategy

## Purpose

The walking skeleton is the first acceptance test to implement and the last one to break. It validates that the entire coordination architecture works end-to-end before any focused feature tests matter.

## What It Proves

A single round-trip through all 4 driving ports:

```
Alice (pact_request)  -->  git push  -->  Bob (pact_inbox)
                                               |
Bob (pact_respond)    -->  git push  -->  Alice (pact_status)
```

Specifically:
1. **Repo structure works** -- directories, config.json, pact file all in place
2. **pact_request works** -- writes valid envelope, commits, pushes
3. **pact_inbox works** -- pulls, scans pending, filters by user, returns summary
4. **pact_respond works** -- writes response, moves request via git mv, atomic commit, pushes
5. **pact_status works** -- pulls, finds completed request, returns response
6. **Git transport works** -- push/pull between two clones through a bare remote
7. **Session independence works** -- no state held between tool calls

## Test File

`tests/acceptance/walking-skeleton.test.ts`

## Skeletons (3 total)

| # | Skeleton | What It Validates |
|---|----------|-------------------|
| 1 | Full request-respond lifecycle | All 4 tools, complete round-trip, data integrity |
| 2 | Git audit trail | Structured commit messages in git log |
| 3 | Session independence | Fresh server instance can read previous request/response |

Skeleton 1 is the FIRST test to enable. Skeletons 2 and 3 are marked `it.skip` until skeleton 1 passes.

## Implementation Sequence

1. Enable skeleton 1 (the full round-trip)
2. Build production code until skeleton 1 passes
3. Enable skeleton 2 (audit trail)
4. Enable skeleton 3 (session independence)
5. Move to focused scenarios in feature-specific test files

## What the Walking Skeleton Is NOT

- It is not a performance test (git latency is acceptable for async work)
- It is not a concurrent access test (that is a focused scenario in pact-request.test.ts)
- It is not a pact content validation test (pacts are agent-level, not server-level)
- It is not a Craft Agents integration test (we test the tool handlers, not the MCP protocol layer)

## Relationship to US-008

US-008 is the "validation story" -- it has no code to build. The walking skeleton acceptance test IS the automated validation for US-008. The manual validation checklist in US-008 (MCP Inspector, Craft Agents round-trip) supplements this test but is not automated.
