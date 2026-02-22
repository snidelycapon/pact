# ADR-006: Request ID Format

## Status: Accepted

## Context

Request IDs must be unique across concurrent clients, human-readable for reference in conversation, and sortable by creation time. Multiple users may create requests in the same second.

## Decision

Format: `req-{YYYYMMDD}-{HHmmss}-{user_id}-{random4hex}`

Example: `req-20260221-143022-cory-a1b2`

Components:
- `req-` prefix: identifies the file type
- `YYYYMMDD-HHmmss`: UTC timestamp for sorting and readability
- `user_id`: prevents collisions across clients at the same second
- `random4hex`: prevents same-user-same-second collisions (65,536 possible values)

The filename in the repo is `{request_id}.json`.

## Alternatives Considered

### UUID v4

`req-550e8400-e29b-41d4-a716-446655440000`

- **Pro**: Guaranteed unique, no timestamp coordination needed, widely understood
- **Con**: Not human-readable ("the 550e request" is meaningless in conversation), not sortable by time without opening the file, 36 characters of noise
- **Rejection rationale**: Users will reference requests in conversation with their agents ("check on the request I sent Alex about the memory leak"). A timestamp-based ID with user segment is grep-able, sortable, and referenceable by the trailing random segment ("the a1b2 request").

### Content-Addressed Hash (SHA-256, like Beads)

Hash of title + description + timestamp + user, truncated to 8 chars.

- **Pro**: Collision-resistant, used successfully by Beads at scale
- **Con**: Requires computing hash before writing (dependency on content). Not time-sortable without metadata. Beads uses hashes because issues are mutable and the hash reflects content; requests are append-only with fixed content at creation time. The Beads use case (preventing merge collisions on mutable data) does not apply to our append-only file design.
- **Rejection rationale**: Content hashing solves a problem (merge collisions on mutable records) that our append-only design does not have. The overhead of computing a hash is unnecessary when timestamp + user + random already guarantees uniqueness.

### Sequential Counter (req-001, req-002)

- **Pro**: Short, simple, familiar
- **Con**: Requires central coordination to prevent collisions (two clients both creating "req-042"). A centralized counter contradicts the distributed git-based architecture.
- **Rejection rationale**: Sequential IDs require a single authority to increment. Git-based coordination is decentralized by design. Two disconnected clients must be able to create requests without consulting each other.

## Consequences

### Positive

- Human-readable and referenceable in conversation
- Chronologically sortable by filename
- Collision-resistant across concurrent clients (user_id + random)
- Grep-friendly (`grep -r "cory" requests/` finds all of Cory's requests)
- Self-documenting (timestamp and sender visible in filename)

### Negative

- Longer than UUID for the same uniqueness guarantee (but more information-dense)
- user_id in filename reveals sender without opening the file (acceptable: repo is private, all members are known)
- Clock skew across clients could cause non-chronological ordering (acceptable: async workflows tolerate imprecise ordering)
