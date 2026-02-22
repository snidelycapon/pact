# DELIVER Wave Handoff — Agent-Native Async GARP

**Date**: 2026-02-21
**Status**: Ready for DELIVER (wave 6 of 6) — Outside-In TDD implementation
**Previous waves**: DISCOVER > DISCUSS > DESIGN > DEVOP > DISTILL — all complete

---

## What We're Building

A **git-backed protocol for async human+agent coordination**. JSON files in a shared git repo serve as the transport layer. A local MCP server on each client wraps git operations into 4 tools. SKILL.md files define request type contracts. Both sides of a request use the same skill file.

**Elevator pitch**: You're in a Claude session investigating a bug. You need a second opinion. Instead of writing up a markdown file and pasting it into Slack, you tell your agent "send Alex a sanity check." The agent packages your context into a structured request, you preview and approve it, and it pushes to a shared git repo. Alex pulls, sees it in their inbox, their agent auto-loads the skill contract, they investigate and respond. You see the response whenever you check. It's agent-to-agent email with humans in the loop.

**Name**: GARP (Git-based Agent Request Protocol)

---

## Architecture Summary

**Style**: Modular monolith, ports-and-adapters. ~500 lines of TypeScript.

**Tiered deployment**:
- Tier 1 (MVP): Git repo + local MCP server per client
- Tier 2 (future): Optional brain service watching the repo
- Tier 3 (future): Institutional memory

**4 MCP Tools** (driving ports):
| Tool | Purpose | Git Operations |
|------|---------|----------------|
| `garp_request` | Submit a structured request | write JSON + commit + push |
| `garp_inbox` | Check inbox for pending requests | pull + scan directory |
| `garp_respond` | Submit a response to a request | write response + git mv request to completed + commit + push |
| `garp_status` | Check status of a request | pull + read files |

**Driven ports** (infrastructure adapters):
- `GitPort`: pull, add, commit, push, mv, log
- `ConfigPort`: readTeamMembers, lookupUser
- `FilePort`: readJSON, writeJSON, listDirectory

**Key properties**:
- Stateless between tool calls — all state lives in the repo
- Type-agnostic — skills define request types, not server code
- Session-decoupled — send from session A, receive in session Z months later
- Skill auto-loading — request_type field triggers skill file selection
- Plan submission pattern for UX — preview before push on both send and respond

---

## Tech Stack

| Component | Choice | Notes |
|-----------|--------|-------|
| Runtime | Node.js 20+ | |
| Language | TypeScript | |
| MCP SDK | `@modelcontextprotocol/sdk` | Official TypeScript MCP SDK |
| Git operations | `simple-git` | Mature npm wrapper |
| Validation | Zod | Request envelope schemas |
| Build | `tsup` or `esbuild` | Single-file bundle for stdio |
| Test | Vitest | Custom GWT helpers |
| CI | GitHub Actions | Trunk-based, lint+typecheck+test+build |
| Logging | Structured JSON to stderr | `GARP_LOG_LEVEL` env var |

---

## Git Repo Structure (The Protocol)

```
garp-repo/
  config.json                        # Team membership
  requests/
    pending/                         # New requests awaiting response
      req-20260221-143022-cory-a1b2.json
    active/                          # Reserved for Tier 2
    completed/                       # Responded requests (moved by garp_respond)
  responses/
    req-20260221-143022-cory-a1b2.json  # Response keyed by request_id
  skills/
    sanity-check/
      SKILL.md                       # Single skill file, both sides
```

**Request lifecycle**: `pending/` → (git mv) → `completed/` + `responses/{id}.json` written. State transitions are directory moves.

---

## Data Model

### Request Envelope (rigid — server-validated)
```json
{
  "request_id": "req-20260221-143022-cory-a1b2",
  "request_type": "sanity-check",
  "sender": { "user_id": "cory", "display_name": "Cory" },
  "recipient": { "user_id": "alex", "display_name": "Alex" },
  "status": "pending",
  "created_at": "2026-02-21T14:30:22Z",
  "deadline": null,
  "context_bundle": { /* flexible — anything */ },
  "expected_response": { "type": "text" }
}
```

### Response Envelope
```json
{
  "request_id": "req-20260221-143022-cory-a1b2",
  "responder": { "user_id": "alex", "display_name": "Alex" },
  "responded_at": "2026-02-21T15:45:00Z",
  "response_bundle": { /* flexible — anything */ }
}
```

### Team Config (config.json)
```json
{
  "team_name": "Acme Support",
  "version": 1,
  "members": [
    { "user_id": "cory", "display_name": "Cory" },
    { "user_id": "alex", "display_name": "Alex" }
  ]
}
```

### Request ID Format
`req-{YYYYMMDD}-{HHmmss}-{user_id}-{random4hex}` — human-readable, sortable, collision-resistant.

---

## Environment Variables

| Var | Purpose | Example |
|-----|---------|---------|
| `GARP_REPO` | Absolute path to local repo clone | `/Users/cory/garp-team` |
| `GARP_USER` | Current user's ID (must match config.json) | `cory` |
| `GARP_LOG_LEVEL` | Logging verbosity | `info` (default), `debug`, `error` |

---

## Craft Agents Source Config

```json
{
  "type": "mcp",
  "name": "GARP",
  "slug": "garp",
  "mcp": {
    "transport": "stdio",
    "command": "node",
    "args": ["{path-to-garp-mcp}/dist/index.js"],
    "env": {
      "GARP_REPO": "/absolute/path/to/local/garp-repo-clone",
      "GARP_USER": "cory"
    }
  }
}
```

---

## Implementation Order

| Step | Story | What | Est |
|------|-------|------|-----|
| 1 | US-001 | Repo template + config.json + skill stub | Day 1 |
| 2 | — | MCP server scaffold (stdio, 4 tool stubs, env var loading) | Day 1 |
| 3 | US-002 | garp_request (validate, write JSON, commit, push) | Day 2 |
| 4 | US-003 | garp_inbox (pull, scan pending, filter by user, return summaries) | Day 2-3 |
| 5 | US-004 | garp_respond (write response, git mv, atomic commit, push) | Day 3 |
| 6 | US-005 | garp_status (pull, search directories, return status + response) | Day 3-4 |
| 7 | US-006 | Sanity-check SKILL.md (full contract) | Day 4 |
| 8 | US-007+008 | Craft Agents source config + round-trip validation | Day 5 |

Steps 3-6 are parallelizable after step 2. Total: 5-7 days.

---

## Testing Strategy

**Acceptance tests** (already written, assertions commented out):
- `tests/acceptance/walking-skeleton.test.ts` — 3 scenarios (full round-trip, audit trail, session independence)
- `tests/acceptance/garp-request.test.ts` — 11 scenarios
- `tests/acceptance/garp-inbox.test.ts` — 9 scenarios
- `tests/acceptance/garp-respond.test.ts` — 10 scenarios
- `tests/acceptance/garp-status.test.ts` — 8 scenarios
- `tests/acceptance/skill-contract.test.ts` — 7 scenarios

**Test helpers** (already written):
- `tests/acceptance/helpers/setup-test-repos.ts` — creates bare remote + Alice/Bob clones
- `tests/acceptance/helpers/gwt.ts` — Given/When/Then wrappers

**Approach**: Outside-In TDD. Enable walking-skeleton test 1 first, build production code until it passes. Then enable focused scenarios one at a time.

**Integration tests**: Local bare git repos (no network). Alice and Bob are two clones of the same bare remote.

**Port mocking**: For unit tests, driven ports (GitPort, ConfigPort, FilePort) are interfaces that can be replaced with in-memory mocks.

---

## Error Handling

| Error | Response | Recovery |
|-------|----------|----------|
| Recipient not in config | `"Recipient '{id}' not found in team config"` | Agent corrects |
| Missing required field | `"Missing required field: {field}"` | Agent retries |
| No matching skill | `"No skill found for request type '{type}'"` | User creates skill |
| Git push conflict | Auto pull --rebase, retry once | Transparent |
| Push still fails | `"Push failed after retry"` | User resolves |
| Network failure on pull | Warning + stale local data | Agent notes staleness |
| Already completed | `"Request {id} is already completed"` | No duplicate |
| Not the recipient | `"You are not the recipient of request {id}"` | Only recipient responds |
| Request not found | `"Request {id} not found in any directory"` | Agent reports |

All errors: structured JSON with `error: true` and `message` string.

---

## Key ADRs (Read If Needed)

| ADR | Decision | Rationale |
|-----|----------|-----------|
| ADR-001 | Git as transport (over HTTP) | Zero infrastructure, free sync/audit/auth |
| ADR-002 | Single SKILL.md (over paired files) | One contract both sides read, simpler |
| ADR-003 | Local stdio MCP (over central HTTP) | No server to deploy, Craft Agents native |
| ADR-004 | TypeScript + simple-git (over Python) | Matches Craft Agents ecosystem |
| ADR-005 | Directory-as-lifecycle (over status mutation) | Git-friendly, no merge conflicts on status |
| ADR-006 | Timestamp+user+random ID (over UUID) | Human-readable, sortable, grep-friendly |

Full ADRs at `docs/adrs/`.

---

## Complete File Inventory

### Documentation (read-only context for DELIVER)
```
docs/
  discovery/
    problem-validation.md          # 5-round interview record
    opportunity-tree.md            # 5 scored opportunities
    solution-testing.md            # MVP components + test plan
    lean-canvas.md                 # Business model + go/no-go
  research/
    async-multi-agent-coordination-landscape.md
    beads-ecosystem-analysis.md
  ux/coordination-mvp/
    journey-setup-visual.md        # Onboarding ASCII flow
    journey-setup.yaml             # Onboarding schema
    journey-setup.feature          # Onboarding Gherkin (7 scenarios)
    journey-sender-visual.md       # Sender ASCII flow
    journey-sender.yaml            # Sender schema
    journey-sender.feature         # Sender Gherkin (9 scenarios)
    journey-receiver-visual.md     # Receiver ASCII flow
    journey-receiver.yaml          # Receiver schema
    journey-receiver.feature       # Receiver Gherkin (10 scenarios)
    shared-artifacts-registry.md   # Data flow between steps
  requirements/
    us-001 through us-008          # Individual user stories
    backlog-coordination-mvp.md    # Backlog + dependency graph + DoR
  architecture/
    architecture.md                # Full architecture (C4, data model, ports, etc.)
  adrs/
    adr-001 through adr-006        # Architecture Decision Records
  platform/
    platform-readiness.md          # CI/CD, project setup, distribution
    testing-strategy.md            # Test pyramid, mocking, integration approach
  distill/
    test-scenarios.md              # 48 scenarios, traceability matrix
    walking-skeleton.md            # Walking skeleton strategy
```

### Test Files (to be used during DELIVER)
```
tests/acceptance/
  helpers/
    setup-test-repos.ts            # Creates bare remote + Alice/Bob clones
    gwt.ts                         # Given/When/Then helpers
  walking-skeleton.test.ts         # 3 scenarios (skeleton 1 enabled, 2-3 skipped)
  garp-request.test.ts            # 11 scenarios (all skipped)
  garp-inbox.test.ts              # 9 scenarios (all skipped)
  garp-respond.test.ts            # 10 scenarios (all skipped)
  garp-status.test.ts             # 8 scenarios (all skipped)
  skill-contract.test.ts           # 7 scenarios (all skipped)
```

---

## How to Start the DELIVER Wave

1. **Create the new repo** for the GARP MCP server (separate from craft-gm)
2. **Copy tests/** from craft-gm to the new repo
3. **Read** `docs/architecture/architecture.md` for the complete architecture
4. **Read** `tests/acceptance/walking-skeleton.test.ts` for the first test to make pass
5. **Read** `tests/acceptance/helpers/setup-test-repos.ts` for the test infrastructure
6. **Scaffold** the TypeScript project (package.json, tsconfig, vitest config)
7. **Enable** walking skeleton test 1, build production code until green
8. **Enable** focused scenarios one at a time, working through the implementation order

The acceptance tests have production code imports commented out as placeholders. Uncomment and adjust as you build the actual modules.

---

## What NOT to Change

- The protocol (repo directory structure, request/response envelope schema)
- The 4 tool names and their parameter signatures
- The request ID format
- Single SKILL.md per request type (not paired files)
- Directory-as-lifecycle (not status field mutation)
- Sender identity from GARP_USER env var (not from agent input)
