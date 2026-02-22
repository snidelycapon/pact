# ADR-005: Directory Placement as Request Lifecycle

## Status: Accepted

## Context

Requests have a lifecycle: pending (awaiting response), active (acknowledged, Tier 2), completed (response received). The system needs to track this state and make it queryable.

## Decision

Request lifecycle is represented by directory placement. A request file in `requests/pending/` is pending. When responded to, `pact_respond` uses `git mv` to move it to `requests/completed/`. The directory a file lives in IS its status.

State transitions:
- `pact_request` creates file in `requests/pending/`
- `pact_respond` moves file to `requests/completed/` via `git mv`
- `pact_inbox` scans `requests/pending/` (directory listing)
- `pact_status` searches all directories (pending, active, completed)

## Alternatives Considered

### Status Field Mutation

Keep the file in a single `requests/` directory and update the `status` field inside the JSON.

- **Pro**: Simpler directory structure. File does not move.
- **Con**: Reading status requires parsing every JSON file (not just directory listing). Two concurrent writers could conflict on the same file (one updating status while another updates something else). `git mv` is cheaper and cleaner than file content mutation.
- **Rejection rationale**: Directory listing is O(1) per file vs JSON parsing. Inbox scan becomes `ls requests/pending/` + filter, not `parse every file in requests/`. Directory-based state also means `git log --follow` tracks the complete lifecycle of a request across directories.

### Database (SQLite) for State

Local SQLite database indexed from repo files (like Beads' dual-storage pattern).

- **Pro**: Fast queries, complex filtering, aggregation
- **Con**: Requires sync daemon between SQLite and git files. Adds complexity (Beads needs a background daemon for this). Overkill for MVP where <100 concurrent pending requests is the expected scale. The Beads dual-storage pattern is a good Phase 2/3 optimization, not an MVP requirement.
- **Rejection rationale**: The MVP has 2-5 users and <100 requests. Directory listing + JSON parse is sub-second at this scale. SQLite indexing can be added later (Tier 2/3) if scaling demands it. Adding it now violates simplest-solution-first.

## Consequences

### Positive

- Inbox scan is a directory listing (fast, no JSON parsing needed for filtering)
- `git log --follow {file}` shows the complete lifecycle across directory moves
- `git mv` is an atomic rename in a single commit (no partial state)
- Status is visible in the file tree without opening any file
- Simple mental model: "pending" requests are literally in the "pending" folder

### Negative

- `git mv` creates a rename entry in git history (slightly more complex log)
- Three directories to search for pact_status (search completed first, then pending, then active)
- Cannot add arbitrary lifecycle states without new directories (acceptable: only 3 states planned)

### Risks

- Concurrent `git mv` of the same file (two people try to respond simultaneously) -- LOW risk because requests have a single recipient, and only the recipient can respond (enforced by pact_respond validation).
