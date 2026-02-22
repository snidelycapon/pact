# ADR-001: Git as GARP Transport

## Status: Accepted

## Context

The GARP needs a transport layer for structured requests and responses between distributed human+agent clients. The original design (discovery Round 5) specified a central HTTP service as the transport. During Round 6, the user identified that git provides all the "dumb router" capabilities needed for MVP.

The system must support: request storage, routing (inbox), audit trail, sync, conflict detection, authentication, versioning, hosting, and offline-first operation.

## Decision

Use a shared git repository as the Tier 1 GARP transport. JSON files in the repo are the data model. Directory structure is the protocol. `git push/pull` is the sync mechanism. `git log` is the audit trail.

A central HTTP service (the "brain") is deferred to Tier 2 as an additive layer that watches the repo and commits enrichment back, without replacing the git transport.

## Alternatives Considered

### Central HTTP Service (original Round 5 design)

A Node.js or Python HTTP server per team, managing request routing, inbox queries, lifecycle tracking, and validation.

- **Pro**: Real-time push notifications, centralized validation, familiar REST API patterns
- **Con**: Requires server deployment and maintenance, authentication infrastructure, hosting cost, single point of failure, operational overhead for a solo developer
- **Rejection rationale**: The entire "dumb router" functionality (storage, routing, sync, audit, auth) is already provided by git. Building an HTTP server for MVP duplicates what git gives for free, and adds deployment/maintenance burden for a 1-person team with a 5-7 day timeline.

### Message Queue (RabbitMQ, Redis Streams)

Dedicated message broker for request routing between clients.

- **Pro**: Built for async messaging, low latency, topic-based routing
- **Con**: Infrastructure dependency, no built-in persistence/versioning, no audit trail, requires deployment, overkill for 2-5 users
- **Rejection rationale**: The coordination pattern is async with minutes-to-hours latency tolerance. A message queue solves a real-time problem that does not exist here. Git provides the same routing via file-per-recipient conventions with permanent versioned storage included.

## Consequences

### Positive

- Zero infrastructure cost (GitHub private repos are free)
- Zero server deployment or maintenance
- Authentication solved (SSH keys, tokens -- already configured by target users)
- Audit trail is native (`git log`)
- Skill distribution is free (`git pull` syncs SKILL.md files)
- Offline-first (commit locally, push when ready)
- Protocol is transport-independent (Tier 2 HTTP layer can be added without changing file format)

### Negative

- Polling-based notification (no push notifications at Tier 1)
- Git pull/push adds 1-5 seconds latency per operation (acceptable for async work)
- Git merge conflicts possible on concurrent writes to same file (mitigated by append-only design)
- Repository size grows with completed requests (mitigated by archiving/compaction in future)
- Requires git to be installed and configured on each client machine (acceptable for developer target users)

### Risks

- **B15**: Git conflicts during concurrent operations -- LOW risk due to append-only file design (new files, not edits to shared files). Mitigated by pull-before-write and push-with-rebase-retry.
- **B16**: Git pull/push latency -- LOW risk. Async workflows tolerate seconds of latency. Success criteria: <10s per operation.
