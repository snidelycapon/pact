# Transport Pluggability & Interoperability Strategy

**Date**: 2026-02-22
**Status**: Active working document
**Depends on**: `01-positioning-and-identity.md`
**Supersedes**: Transport sections of `pact-positioning-and-interop.md`, `branch-per-user-inbox-architecture.md`

---

## 1. Why Transport Must Be Pluggable

PACT's protocol semantics (pacts, envelopes, lifecycle, hooks) are independent of how messages move between participants. Different teams have different constraints:

| Team Profile | Needs | Best Transport |
|---|---|---|
| OSS team sharing a GitHub repo | Audit trail, offline, zero infra | Git |
| Enterprise with privacy requirements | Self-hosted, compliance, access control | Self-hosted Git (GitLab/Gitea) or HTTP |
| Distributed team, no shared repo | Low friction, no git setup | Hosted HTTP or A2A bridge |
| Mixed tooling (some GitHub, some not) | Universal access | HTTP with optional git sync |
| Team needing real-time notifications | Low latency | HTTP + SSE/webhooks |

---

## 2. Architecture

### 2.1 Layer Diagram

```
+-----------------------------------------------------+
|                    Human + Agent                    |
|         (Claude Code, Codex, Gemini CLI, etc.)      |
+---------------------+-------------------------------+
                      | MCP (or CLI, or future interfaces)
+---------------------+-------------------------------+
|                  PACT Protocol Core                 |
|                                                     |
|  Pacts | Envelopes | Lifecycle | Hooks | Teams      |
+---------------------+-------------------------------+
                      | Transport SPI
         +------------+------------+------------+
         v            v            v            v
    +---------+  +---------+  +---------+  +--------+
    |   Git   |  |  HTTP   |  |   A2A   |  | Future |
    |Transport|  |Transport|  | Bridge  |  |        |
    +---------+  +---------+  +---------+  +--------+
```

### 2.2 Transport SPI (Service Provider Interface)

The abstract interface that all transports implement:

```typescript
interface TransportSPI {
  // Discovery
  discoverPacts(query?: string): Promise<PactCatalog>;
  discoverTeam(): Promise<TeamConfig>;

  // Sending
  sendRequest(envelope: RequestEnvelope): Promise<SendResult>;
  sendResponse(requestId: string, response: ResponseEnvelope): Promise<SendResult>;

  // Receiving
  listInbox(userId: string, filters?: InboxFilters): Promise<InboxEntry[]>;
  getRequest(requestId: string): Promise<RequestEnvelope | null>;
  getResponse(requestId: string): Promise<ResponseEnvelope | null>;

  // Lifecycle
  amendRequest(requestId: string, amendment: Amendment): Promise<AmendResult>;
  cancelRequest(requestId: string, reason?: string): Promise<CancelResult>;
  moveToCompleted(requestId: string): Promise<void>;

  // Threading
  getThread(threadId: string): Promise<ThreadEntry[]>;

  // Sync (transport-specific)
  sync(): Promise<SyncResult>;
}
```

### 2.3 What the Transport SPI Replaces

Currently, each handler calls GitPort + FilePort directly:

```
Current (handler -> git/file primitives):
  pact-request.ts:
    filePort.writeJSON(path, envelope)
    gitPort.add([path])
    gitPort.commit(message)
    gitPort.push()
```

After refactoring (handler -> transport):

```
Refactored (handler -> Transport SPI):
  pact-request.ts:
    transport.sendRequest(envelope)
```

The git-specific logic (writeJSON -> add -> commit -> push) moves into `GitTransport`. The handler doesn't know or care about the backing store.

---

## 3. Git Transport (Current, First-Class)

### 3.1 What Exists Today

The current implementation IS the Git transport, just not abstracted yet:
- `GitAdapter` (simple-git wrapper): pull, push, add, commit, mv
- `FileAdapter` (Node.js fs): readJSON, writeJSON, listDirectory, moveFile
- `ConfigAdapter` (config.json reader): readTeamMembers, lookupUser

### 3.2 Extraction Path

These three adapters compose into a `GitTransport` that implements TransportSPI:

```
GitTransport implements TransportSPI
  +-- uses GitAdapter (pull/push/add/commit/mv)
  +-- uses FileAdapter (readJSON/writeJSON/listDir)
  +-- uses ConfigAdapter (team membership)
  +-- maps SPI methods to git operations:
        sendRequest() -> writeJSON + add + commit + push
        listInbox()   -> pull + listDir + readJSON (filter by recipient)
        sync()        -> pull --rebase
        etc.
```

### 3.3 Branch-Per-User (Future Enhancement)

The branch-per-user inbox architecture (see `branch-per-user-inbox-architecture.md`) becomes an enhancement within the Git transport:

```
GitTransport (current): single branch, directory-based routing
GitTransport (enhanced): branch-per-user, reduced write contention

Branch namespace:
  main                    -> config, pacts (read-only canonical)
  inbox/<user_id>         -> per-user inbox
  inbox/team/<team_id>    -> per-team inbox
  dead-letters            -> failed deliveries
```

This is a Git transport concern, not a protocol concern. The SPI is the same either way.

---

## 4. HTTP Transport (New, For Broader Adoption)

### 4.1 What It Provides

- Standard REST API + SSE for real-time events
- SQLite (self-hosted) or Postgres (cloud) backing store
- OAuth 2.0 / OIDC authentication
- No git dependency

### 4.2 API Surface

```
Discovery:
  GET  /pacts                             -> PactCatalog
  GET  /pacts/:pactName                   -> PactMetadata
  GET  /team                              -> TeamConfig

Requests:
  POST /requests                          -> SendResult (create new request)
  GET  /requests/:requestId               -> RequestEnvelope
  PUT  /requests/:requestId/amend         -> AmendResult
  PUT  /requests/:requestId/cancel        -> CancelResult
  POST /requests/:requestId/respond       -> SendResult

Inbox:
  GET  /inbox                             -> InboxEntry[] (current user's inbox)
  GET  /inbox?status=pending              -> filtered

Threading:
  GET  /threads/:threadId                 -> ThreadEntry[]

Real-time:
  GET  /events (SSE)                      -> inbox updates, notifications

Auth:
  Standard OAuth 2.0 / OIDC
```

### 4.3 When to Prioritize HTTP Transport

After the Transport SPI is defined and the Git transport is extracted. The HTTP transport is the "adoption unlock" -- it opens PACT to teams that don't share a git repo.

---

## 5. A2A Bridge (Interop Layer)

### 5.1 What It Does

Translates between PACT protocol semantics and Google's A2A wire format. Makes a PACT team appear as an A2A endpoint to the outside world.

### 5.2 Concept Mapping

| PACT Concept | A2A Equivalent | Impedance |
|---|---|---|
| Pact (PACT.md) | Agent Card (agent.json) | Low |
| send_request | tasks/send | Low |
| check_inbox | tasks/get or push notification | Low |
| context_bundle | Artifact (with parts) | Low |
| response_bundle | Task result artifacts | Low |
| Request lifecycle | Task state machine | Low |
| Team membership | No equivalent | Medium (A2A is peer-to-peer) |
| amend_request | No equivalent | High (A2A tasks are immutable) |
| cancel_request | tasks/cancel | Low |
| Lifecycle hooks | No equivalent | High (novel to PACT) |

### 5.3 Inbound A2A (External -> PACT)

An external A2A agent sends a task to the PACT bridge:

```
External A2A Agent                     PACT A2A Bridge
       |                                  |
       | GET /.well-known/agent.json      |
       |--------------------------------->|
       |    (returns PACT pacts as        |
       |     A2A Agent Card capabilities) |
       |                                  |
       | POST /tasks/send                 |
       |    { pact: "code-review",        |
       |      artifacts: [...] }          |
       |--------------------------------->|
       |    Bridge translates:            |
       |    A2A task -> PACT envelope     |
       |    A2A artifacts -> context_bundle|
       |    Delivers via PACT transport   |
       |                                  |
```

### 5.4 Outbound A2A (PACT -> External)

A PACT user sends to a recipient that's an external A2A agent:

```
PACT User sends request
  -> Transport detects recipient is external A2A endpoint
  -> Translates PACT envelope -> A2A task
  -> Sends via A2A protocol
  -> Monitors task status
  -> Translates A2A response -> PACT response envelope
```

### 5.5 When to Prioritize A2A Bridge

After HTTP transport exists. The A2A bridge can be built on top of the HTTP transport's REST surface, since A2A is HTTP-based.

---

## 6. Messaging Pattern Foundations

These patterns from email/IM research apply across ALL transports:

### 6.1 Store-and-Forward (SMTP Model)

Every transport implements store-and-forward: the sender writes locally, then the transport delivers. If delivery fails, the message persists locally and can be retried.

- **Git**: commit locally -> push (retry with rebase if conflict)
- **HTTP**: POST to server -> server stores -> recipient fetches
- **A2A**: POST task -> monitor status -> retry on failure

### 6.2 Envelope/Header Separation (SMTP Model)

The transport envelope (routing) is separate from the message content:

- **Envelope** (transport concern): which inbox branch/endpoint to deliver to
- **Header** (protocol concern): sender, recipient, pact type, thread_id
- **Body** (application concern): context_bundle, response_bundle

This enables forwarding, CC, team fan-out where routing differs from addressing.

### 6.3 Threading (Email DAG Model)

Thread tracking is a protocol concern, not a transport concern:

- `thread_id`: groups related requests into a conversation
- `in_reply_to`: links a response to its request (future: could link requests too)
- The thread DAG is maintained by the protocol core regardless of transport

### 6.4 Idempotent Delivery (Inbox Pattern)

Duplicate delivery should be harmless:

- **Git**: content-addressable storage deduplicates at the object level
- **HTTP**: request_id is unique; server rejects or ignores duplicates
- **A2A**: task_id provides deduplication

### 6.5 Fan-Out (Mailing List Model)

Team delivery creates copies for each member:

- **Git**: cherry-pick commit to each member's inbox branch (or directory)
- **HTTP**: server creates inbox entries for each member
- **A2A**: multiple tasks/send calls (one per member)

---

## 7. Notification Sidebands

PACT doesn't replace Slack or email for notifications. It uses them as delivery signals:

```
PACT request sent
  -> lifecycle hooks fire (if an executor is configured)
  -> Slack: "Cory sent you a code-review request via PACT"
  -> Email: subject line + request summary
  -> GitHub: issue comment or status check

The notification says "you have mail."
The human opens their agent and checks their PACT inbox for the actual content.
```

This mirrors how GitHub sends email notifications that link back to the web UI. The notification channel is for alerting; PACT is for the actual structured interaction.

---

## 8. Standards Alignment

### 8.1 Adopt

| Standard | Where | Why |
|---|---|---|
| JSON Schema | Bundle validation in pacts | The standard for typed JSON |
| OAuth 2.0 / OIDC | HTTP transport auth | Don't build auth |
| A2A Agent Card | Pact advertisement for interop | A2A ecosystem compatibility |
| Semantic Versioning | Pact versions | Breaking change management |

### 8.2 Don't Adopt

| Standard | Why Not |
|---|---|
| CloudEvents | PACT's envelope has its own semantics (threading, pact identity, amendments, lifecycle hooks). Forcing these into CloudEvents extensions buys interop with nothing that would consume them. Define a clean PACT envelope spec instead. |
| A2A's full task lifecycle | PACT's lifecycle is richer (amend) and human-centric |
| gRPC for primary transport | Too heavy for small teams. Reserve for high-throughput bridge. |
| FIPA ACL | Over-engineered for this use case |
| GraphQL | Unnecessary complexity for inbox operations |

---

## 9. Privacy & Hosting Options

| Deployment | Transport | Infrastructure | Best For |
|---|---|---|---|
| Shared GitHub repo | Git | None (GitHub-hosted) | OSS teams, small companies |
| Self-hosted GitLab/Gitea | Git | GitLab/Gitea instance | Enterprise, privacy-sensitive |
| Self-hosted HTTP server | HTTP | Docker container or binary | Teams without git workflow |
| Cloud-hosted PACT service | HTTP | Managed (future) | Zero-ops teams |
| Peer-to-peer A2A | A2A bridge | None (each runs locally) | Maximum privacy (future) |

---

## 10. Open Questions

### Transport Selection
- Can a team use multiple transports simultaneously? (e.g., git for internal, A2A bridge for external partners)
- How do you migrate from one transport to another without losing history?

### Consistency
- How do you ensure pact versions are consistent across transports? (Git has version control built in; HTTP needs explicit versioning)
- If the same team uses both git and HTTP, which is the source of truth?

### Performance
- What are the latency characteristics of each transport? Git push is ~2-5s. HTTP POST is ~100-500ms. A2A depends on the remote.
- At what message volume does each transport hit its limits?

### Security
- How do you prevent unauthorized sends in the HTTP transport? (Git has SSH key auth; HTTP needs bearer tokens or OAuth)
- Should messages be encrypted at rest? In transit?
