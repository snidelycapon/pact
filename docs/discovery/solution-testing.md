# Solution Testing — Async Multi-Agent PACT

## Discovery Phase: 3 COMPLETE + POST-MVP RE-DISCOVERY (Git Transport Revision)

**Date**: 2026-02-21
**Product**: Agent-native async PACT server ("agent-first email inbox")
**Working name**: TBD (user to decide)
**Transport**: Git repository as PACT (Tier 1), optional brain service (Tier 2)
**Client**: Local MCP server (stdio) per client, wrapping git operations

---

## Architectural Pivot: Git as PACT Transport

### What Changed (Round 6)

The user identified that git provides the entire "dumb router" layer for free:

> "If we do use a local MCP client and handle the 'orchestration LLM' layer locally on the client before pushing it to a central shared git repository(ies) where the other clients are syncing from and using as the queues, does that greatly simplify our MVP architecture or even the entire project?"

**Answer: Yes.** The MVP "central HTTP service" was providing: routing, inbox management, lifecycle tracking, audit trail, and file storage. Git provides ALL of these natively:

| MVP Need | Git Provides |
|----------|-------------|
| Request storage | JSON files in repo |
| Routing/inbox | Directory conventions (files addressed to user) |
| Audit trail | git log (every commit IS the audit) |
| Sync protocol | git push/pull |
| Conflict detection | git merge conflicts |
| Authentication | SSH keys, tokens (already solved) |
| Versioning | Every state change is a commit |
| Hosting | GitHub/GitLab private repo (free) |
| Offline-first | Commit locally, push when ready |

### What You Lose vs Central HTTP

| Capability | HTTP Server | Git Transport | Impact |
|-----------|-------------|---------------|--------|
| Real-time push notifications | Webhooks/SSE | Polling via git pull | ACCEPTABLE — async work tolerates latency |
| Central validation | Server validates before routing | Client validates locally | ACCEPTABLE — brain was deferred anyway |
| Central brain | Server-side LLM | Deferred to Tier 2 service | ACCEPTABLE — explicitly deferred |
| User directory | Server config file | Git repo contributors | ACCEPTABLE — repo access = user registry |

### The Tiered Architecture

```
Tier 1: Git Repository (always works, the base protocol)
  - Shared git repo = the coordination "server"
  - Local MCP server on each client wraps git operations
  - Directory structure = the protocol
  - git log = the audit trail
  - Works with 2 people and a private repo TODAY

      (optional, additive)
            |
            v

Tier 2: Brain Service (watches repo, adds intelligence)
  - Runs as CI/CD pipeline, GitHub Action, or standalone service
  - Watches repo for new requests via webhooks or polling
  - Enriches requests (search JIRA, check duplicates, add history)
  - Validates context bundles against schemas
  - Commits enrichment back to repo
  - Sends push notifications (Slack, email, OS notifications)
  - Hosts the orchestrator LLM

      (optional, additive)
            |
            v

Tier 3: Institutional Memory (accumulates knowledge)
  - Indexes all requests/responses
  - Detects patterns across history
  - Proactively enriches new requests with historical context
  - Customer/entity profile building
```

This is exactly the relationship between bare git and GitHub/GitLab. Git is the protocol. The service adds intelligence on top without clients needing to know it exists.

---

## Solution Hypotheses (Updated)

### H1: The Minimal Complete Loop (REVISED)

**If** we build a local MCP server that reads/writes structured request files to a shared git repository,
**then** tech support handoffs will require less manual context assembly and the receiving agent will start with better situational awareness,
**because** the context bundle lives in a JSON file that the receiver's MCP server reads directly into their agent's context.

**Riskiest assumption**: That the git pull/push cycle is fast and reliable enough that it does not feel broken compared to Slack's near-instant messaging.

### H2: Pacts as PACT (UNCHANGED)

**If** we define request types through paired PACT.md files (sender pact + receiver pact),
**then** agents on both sides will reliably produce and consume structured requests,
**because** this applies the Code Mode pattern to multi-agent coordination.

**Riskiest assumption**: That PACT.md instructions are precise enough for consistent agent behavior.

### H3: Git as PACT Transport (NEW)

**If** we use a shared git repository as the PACT with directory conventions as the protocol,
**then** we get sync, audit, auth, versioning, and conflict detection for free,
**because** git already solves these problems for code coordination, and structured request files are just another form of structured data.

**Riskiest assumption**: That git merge conflicts are rare enough (or handleable enough) that they do not break the workflow. Key insight: requests are append-only (new files), not edits to shared files, so conflicts should be extremely rare.

### H4: Tiered Architecture (NEW)

**If** we design the protocol as directory/file conventions independent of transport,
**then** the git layer and brain service layer are genuinely independent and interchangeable,
**because** the brain service just reads the same files the clients do, and writes enrichment back as commits.

**Riskiest assumption**: That the repo structure conventions are clean enough to support both human readability and machine processing.

---

## Proposed MVP Components (Git Transport)

### Component 1: Shared Git Repository

**What it is**: A private git repository (GitHub, GitLab, or self-hosted) that serves as the coordination "server."

**Repository structure**:
```
pact-repo/
  config.json                    # Team config: members, settings

  requests/
    pending/
      req-20260221-001.json      # New request, waiting for recipient
      req-20260221-002.json
    active/
      req-20260220-005.json      # Recipient has acknowledged
    completed/
      req-20260219-003.json      # Response received, lifecycle complete

  responses/
    req-20260219-003.json        # Response to completed request

  pacts/                        # Shared pacts (the team protocol)
    sanity-check/
      sender.md                  # How to compose a sanity-check request
      receiver.md                # How to handle a sanity-check request
    bug-report/
      sender.md
      receiver.md
```

**Key conventions**:
- Requests are files, not database rows. One file per request.
- Request lifecycle is represented by directory (pending -> active -> completed). Moving a file = changing status.
- Responses are separate files keyed by request ID.
- Pacts live IN the repo, so they are version-controlled and synced on pull. This solves the pact distribution problem for free.
- `config.json` lists team members (user IDs mapped to display names).

**Why directories as lifecycle**:
- `git mv requests/pending/req-001.json requests/active/` is a status change
- git log shows exactly when each transition happened
- Scanning `requests/pending/` for files addressed to you IS the inbox query
- No database, no state management, no server process

### Component 2: Local MCP Server (stdio)

**What it is**: A lightweight MCP server that runs locally on each client, wrapping git operations into the 4 PACT tools.

**Craft Agents source config**:
```json
{
  "type": "mcp",
  "name": "PACT",
  "slug": "pact",
  "provider": "pact",
  "mcp": {
    "transport": "stdio",
    "command": "node",
    "args": ["path/to/pact-mcp/index.js"],
    "env": {
      "PACT_REPO": "/path/to/pact-repo",
      "PACT_USER": "cory"
    },
    "authType": "none"
  },
  "tagline": "Agent-native async coordination with your team"
}
```

**4 MCP Tools** (same tools, git-backed):

| Tool | What It Does Internally |
|------|------------------------|
| `pact_request` | Validates envelope, writes JSON to `requests/pending/{id}.json`, runs `git add + commit + push` |
| `pact_inbox` | Runs `git pull`, scans `requests/pending/` for files where `recipient.user_id` matches current user, returns list |
| `pact_respond` | Writes response to `responses/{request_id}.json`, moves request from `pending/` or `active/` to `completed/`, runs `git add + commit + push` |
| `pact_status` | Runs `git pull`, reads request file, returns current status and any response |

**Implementation notes**:
- `git pull` runs at the start of every read operation (inbox, status) to ensure fresh state
- `git add + commit + push` runs at the end of every write operation (request, respond)
- Commit messages are structured: `[pact] new request: req-20260221-001 (sanity-check) -> colleague-a`
- The MCP server is stateless between tool calls — all state lives in the repo

### Component 3: Request Schema (UNCHANGED)

**Envelope** (MCP server validates locally):
```json
{
  "request_id": "req-20260221-001",
  "request_type": "sanity-check",
  "sender": { "user_id": "cory", "display_name": "Cory" },
  "recipient": { "user_id": "colleague-a", "display_name": "Alex" },
  "status": "pending",
  "created_at": "2026-02-21T14:00:00Z",
  "deadline": null,
  "context_bundle": {
    "customer": "Acme Corp",
    "product": "Platform v3.2",
    "issue_summary": "Memory leak in auth service after OAuth refresh",
    "involved_repos": ["platform-auth", "oauth-service"],
    "involved_files": [
      "src/auth/refresh.ts:L45-L90",
      "src/oauth/token-manager.ts:L120-L150"
    ],
    "investigation_so_far": "Agent found that refresh tokens are not being garbage collected...",
    "question": "Does this match the pattern you saw last month with the session service?",
    "zendesk_ticket": "ZD-4521"
  },
  "expected_response": { "type": "text" }
}
```

### Component 4: Pacts (IMPROVED — repo-hosted)

Pacts now live IN the PACT repo, not installed separately on each client.

**Before (HTTP architecture)**: Pacts manually installed on each client. No sync.
**After (git architecture)**: Pacts live in `pact-repo/pacts/`. Every `git pull` syncs them. Version-controlled for free.

The local MCP server can expose pact contents as part of `pact_inbox` responses, so the receiving agent gets both the request AND the instructions for how to handle it.

**Sender pact** (`pact-repo/pacts/sanity-check/sender.md`):
```markdown
# Sanity Check — Sender

When the user wants a colleague to verify their findings:

1. Gather context from the current investigation:
   - Customer and product context
   - Issue summary (in your own words, not raw logs)
   - Specific repos and files you've been looking at
   - What you've found so far
   - The specific question you want answered

2. Compose the request using pact_request with type "sanity-check"

3. Include a clear, specific question — not "look at this" but "does X match pattern Y?"

4. Set a deadline if urgent

## Context Bundle Fields

- customer: Customer name or ID
- product: Product and version
- issue_summary: Human-readable summary
- involved_repos: List of repository names
- involved_files: List of file paths with line ranges
- investigation_so_far: What you've found
- question: The specific thing you want checked
- zendesk_ticket: (optional) Reference ticket
```

**Receiver pact** (`pact-repo/pacts/sanity-check/receiver.md`):
```markdown
# Sanity Check — Receiver

When you receive a sanity-check request:

1. Read the context bundle carefully
2. Review the involved files using your local tools
3. Investigate the specific question asked
4. Compose your response:
   - **Answer**: Direct yes/no/maybe with explanation
   - **Evidence**: What you found
   - **Concerns**: Anything the sender should know
   - **Recommendation**: What to do next

5. Submit via pact_respond
```

### Component 5: Notification (Git-Based)

**MVP (Tier 1)**: Polling via `git pull`.
- `pact_inbox` tool runs `git pull` first, then scans
- Agent can be instructed to check inbox at session start
- Craft Agents hook (SchedulerTick) can periodically run `pact_inbox`

**Tier 2 (Brain Service)**: GitHub Actions or webhooks.
- On push to repo, webhook fires
- Brain service processes new requests, sends notifications
- Slack notification, email, or Craft Agents deep link

**Tier 3 (Deep Integration)**: OS notifications, UI badges in Craft Agents.

---

## Conflict Handling

### Why Conflicts Should Be Rare

Requests are **append-only new files**. Two users creating requests simultaneously write to DIFFERENT files (`req-20260221-001.json` and `req-20260221-002.json`). Git handles this natively with no conflicts.

The only conflict scenarios:
1. **Two people respond to the same request simultaneously** — unlikely (requests have a single recipient)
2. **Two people move the same request file** — prevented by convention (only recipient moves their own requests)
3. **Config.json edited by two people** — rare, and standard git merge handles it

### Conflict Resolution Strategy

If a `git push` fails due to remote changes:
1. MCP server runs `git pull --rebase`
2. If rebase succeeds (no conflicts), retry push
3. If conflict occurs, MCP server returns an error with explanation
4. Human resolves via their agent or manually

This is the same workflow developers use daily. The target users are developers.

---

## Test Plan (Updated for Git Transport)

### Test 1: Context Bundle Quality (UNCHANGED)

Same as before. Compare agent-composed structured request vs manual markdown handoff.

### Test 2: Receiver Agent Usefulness (UNCHANGED)

Same as before. Does the agent start useful work in 1-2 turns from the context bundle?

### Test 3: Round-Trip Completion (UPDATED)

**Goal**: Validate the complete git-based loop works end-to-end.

**Method**:
1. User A and User B both clone the PACT repo
2. User A installs the local MCP server and pacts
3. User A's agent composes a request via `pact_request` (writes file, commits, pushes)
4. User B installs the local MCP server and pacts
5. User B's agent runs `pact_inbox` (pulls, scans, finds request)
6. User B investigates and responds via `pact_respond` (writes response, moves request, commits, pushes)
7. User A's agent runs `pact_status` (pulls, reads response)

**Success criteria**: Complete round-trip with zero manual git operations, zero Slack, zero copy-paste.

### Test 4: Pact Contract Consistency (UNCHANGED)

Same as before. 5+ round-trips, measure schema compliance.

### Test 5: Adoption Signal (UNCHANGED)

Same as before. >50% of handoffs during test period use the system.

### Test 6: Git Workflow Friction (NEW)

**Goal**: Determine if the git pull/push cycle introduces unacceptable friction.

**Method**:
1. Measure time for each operation: request submit, inbox check, respond, status check
2. Compare to Slack message latency
3. Note any git errors (auth failures, push conflicts, network issues)

**Success criteria**: No single operation takes >10 seconds. Git errors occur in <5% of operations. Total round-trip latency (submit to notification) is <5 minutes (acceptable for async work).

---

## Phase 3 Gate Criteria (G3)

| Criterion | Target | How Measured |
|-----------|--------|-------------|
| Task completion | >80% round-trips complete without fallback | Test 3 |
| Usability | Agent starts useful work in 1-2 turns | Test 2 |
| Users tested | 2+ | Test 1-5 |
| Context quality | At least as good as manual handoff | Test 1 |
| Consistency | >80% schema compliance | Test 4 |
| Adoption signal | >50% of handoffs during test period | Test 5 |
| Git friction | <10s per operation, <5% error rate | Test 6 |

---

## Design Questions Status

### Resolved

1. **Transport**: Git repository. RESOLVED.
2. **Server intelligence at MVP**: None (git is the dumb router). RESOLVED.
3. **Request type extensibility**: Type-agnostic. Pacts define everything. RESOLVED.
4. **User identity**: Git identity (commit author). RESOLVED.
5. **Pact distribution**: Pacts live in the repo. Git pull syncs them. RESOLVED.
6. **Audit trail**: Git log. RESOLVED.
7. **Client integration**: Local MCP server (stdio transport). RESOLVED.

### Must Resolve During Building

8. **Request ID generation**: Timestamp-based? Random? Must be unique across clients.
9. **Git authentication for MCP server**: How does the MCP server authenticate to the remote? SSH key? Token in env var?
10. **Inbox polling automation**: Manual (agent checks) vs automated (Craft Agents hook with SchedulerTick)?
11. **Large context bundles**: What if a bundle is very large? Git handles large files poorly. Size limit?

### Can Resolve During Building

12. **Request expiry**: Do unanswered requests expire?
13. **Concurrent requests**: Multiple pending to same recipient?
14. **Notification format**: What does a new-request notification look like in Craft Agents?

### Defer to Phase 2 (Tier 2 Brain Service)

15. **Brain service architecture**: GitHub Action? Standalone watcher? CI pipeline?
16. **Enrichment protocol**: How does the brain write enrichment back to the repo?
17. **Push notifications**: Slack integration? Email? OS-level?
18. **Orchestration patterns**: Chain, ring, broadcast definitions.
19. **Institutional memory**: Indexing, search, pattern detection.

---

## Phased Roadmap (Updated)

### MVP (Tier 1): Git Protocol

**Goal**: Prove the complete loop works and is better than Slack + markdown.

**What to build**:
- Git repo with directory conventions (the protocol specification)
- Local MCP server with 4 tools wrapping git operations
- Pacts for "sanity check" request type (hosted in repo)
- Craft Agents source config
- Basic envelope validation

**What you get for free**:
- Sync (git push/pull)
- Audit trail (git log)
- Authentication (SSH keys/tokens)
- Pact distribution (git pull syncs pacts)
- Versioning (every commit)
- Hosting (GitHub private repo)

**Estimated scope**: Local MCP server is ~500 lines of code. Repo conventions are a README. Pacts are markdown files. This is a weekend-to-week build, not a month build.

**2-user testing** with developer friend.

### Phase 2 (Tier 2): Brain Service

**Goal**: Add intelligence that watching the repo provides.

- Service that watches the repo (GitHub Actions, webhooks, or polling)
- LLM processes new requests: validates, enriches, adds context
- Push notifications (Slack bot, email, Craft Agents hooks)
- Per-request-type orchestrator pacts (search JIRA, check duplicates)
- Multiple request types
- Workplace deployment

### Phase 3 (Tier 3): Institutional Memory

**Goal**: The system gets smarter with use.

- Request/response indexing and search
- Pattern detection across history
- Proactive context injection
- Customer/entity profile building
- Advanced orchestration patterns
- Pact versioning metadata

---

## Key Advantages of Git Transport

1. **No server to build, deploy, or maintain for MVP** — the "server" is a GitHub repo
2. **Pacts distribute automatically** — `git pull` syncs pacts to every client
3. **Audit trail is native** — `git log` shows every request, response, and status change with timestamps and authors
4. **Auth is solved** — SSH keys and tokens are how developers already authenticate to git
5. **Offline-first** — compose requests locally, push when ready
6. **Peer-to-peer capable** — two people can coordinate with just a shared repo, no infrastructure
7. **Brain service is purely additive** — you can add and remove Tier 2 without breaking Tier 1
8. **The protocol IS the repo structure** — no spec document needed, the conventions are self-documenting
9. **Conflict-free by design** — append-only new files means concurrent writes target different files
10. **Small peer-to-peer and large team both work** — same protocol, same tools, different repo access

---

## Post-MVP Solution Testing Results (2026-02-21)

### Test Plan Results (From Pre-Build Plan)

| Test | Target | Actual Result | Status |
|------|--------|--------------|--------|
| T1: Context bundle quality | Better than manual markdown handoff | NOT TESTED — real requests used minimal context | INCONCLUSIVE |
| T2: Receiver agent usefulness | Agent starts useful work in 1-2 turns | NOT TESTED — "ask" requests were trivial | INCONCLUSIVE |
| T3: Round-trip completion | Complete loop without manual git | PASS — 2 round-trips, zero manual git | PASS |
| T4: Pact consistency | >80% schema compliance over 5+ trips | PARTIAL — 2 trips, 100% compliance but small sample | PARTIAL |
| T5: Adoption signal | >50% of handoffs during test period | NOT MEASURED — too early, no parallel Slack comparison | NOT MEASURED |
| T6: Git workflow friction | <10s per operation, <5% error rate | PASS — sub-second operations, 0% error rate | PASS |

**Assessment**: The infrastructure works perfectly. The high-value tests (T1, T2, T5) that determine whether the system is actually better than Slack have not been run. The next phase must prioritize exercising the rich context bundle workflow that was the original problem validation.

### Hypothesis Validation

**H1: The Minimal Complete Loop** — CONFIRMED. The loop works. Request compose, push, pull, inbox scan, respond, status check — all function as designed. Zero manual git operations needed by either user.

**H2: Pacts as Protocol** — PARTIALLY CONFIRMED. The "ask" pact is simple enough that compliance is trivial. The "design-pact" contract is sophisticated but untested with real users doing real design work. The risk that PACT.md instructions are too imprecise for complex request types remains open.

**H3: Git as Transport** — CONFIRMED. Push/pull cycle is fast, conflicts are zero, offline tolerance works. The tiered architecture assumption holds: Tier 1 (git) provides the complete protocol without any intelligence layer.

**H4: Tiered Architecture** — CONFIRMED at Tier 1. The repo structure conventions are clean enough to support both human readability (browsing requests/completed/ in a file manager) and machine processing (JSON parsing). The protocol is genuinely transport-independent. Tier 2 brain service has not been attempted.

### Architecture Observations From Implementation

**What worked better than expected**:

1. **Ports-and-adapters architecture** — Not planned in discovery, but the implementation used hexagonal architecture with explicit port interfaces (GitPort, ConfigPort, FilePort). This made testing clean: 65+ tests at three levels (unit, integration, acceptance) with test doubles at port boundaries. This architectural choice should be preserved going forward.

2. **Zod schema validation** — The RequestEnvelopeSchema and ResponseEnvelopeSchema provide runtime validation at the protocol boundary. Malformed envelopes are caught and logged (not crashed). This is better than the discovery's suggestion of "basic envelope validation."

3. **Graceful degradation** — Inbox and status tools catch git pull failures and return local data with a staleness warning. This was not explicitly planned but emerged from good error handling practices.

4. **Structured logging** — JSON structured logs to stderr (stdout reserved for MCP JSON-RPC). Duration tracking on git operations. This provides the operational visibility needed for the "git friction" metric.

**What is weaker than expected**:

1. **Status field inconsistency** — The request envelope has a `status` field that stays "pending" even after the file is moved to completed/. The actual status is derived from directory location, making the field misleading. This should either be updated on move or removed from the envelope.

2. **No attachment surfacing** — Attachments are stored on disk but the receiving agent gets only the metadata (filename, description) in the envelope. There is no mechanism for the agent to read attachment content without direct file access.

3. **expected_response is hardcoded** — Every request gets `expected_response: { type: "text" }` regardless of pact type. This field was designed to carry pact-specific response expectations but is not being used.

4. **No thread tools** — thread_id is a schema field but there is no pact_thread or pact_list_threads tool. The multi-round pattern documented in design-pact relies entirely on the human tracking thread IDs.

### Design Questions Resolved During Building

| Question | Discovery Status | Resolution |
|----------|-----------------|------------|
| Request ID generation | Must resolve | `req-{YYYYMMDD}-{HHmmss}-{userId}-{hex4}` — timestamp + user + random |
| Git authentication | Must resolve | Inherited from system git config (SSH keys / tokens). PACT_REPO points to local clone. |
| Inbox polling automation | Must resolve | Manual via pact_inbox. No automation yet. |
| Large context bundles | Must resolve | No explicit size limit. Attachments handle large content as separate files. |
| Request expiry | Can resolve | NOT RESOLVED — no expiry mechanism |
| Concurrent requests | Can resolve | RESOLVED — multiple pending to same recipient works, inbox returns all |
| Notification format | Can resolve | NOT RESOLVED — no notifications beyond polling |

### What the Implementation Teaches About Phase 2

The MVP confirms the protocol layer. The next phase is about **workflows and usability**, not infrastructure:

1. **Thread management** — The primitive (thread_id) exists. The tooling (thread listing, thread history) does not. This is the gap between "protocol supports it" and "users can actually use it."

2. **Attachment completion** — The write side works. The read side is incomplete. The receiving agent needs attachment content, not just metadata.

3. **Lifecycle operations** — Cancel, amend, and draft are basic workflow operations missing from the current tool set.

4. **Real workload testing** — The system must be exercised with the actual tech support handoff workflow that validated the original problem. Playful testing proved the protocol; real workloads will prove the value.
