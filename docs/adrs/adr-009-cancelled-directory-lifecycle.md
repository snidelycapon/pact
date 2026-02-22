# ADR-009: Cancelled Directory as Lifecycle State

## Status: Accepted

## Context

US-013 adds the ability to cancel pending requests. Following ADR-005 (directory-as-lifecycle), cancelled requests need a physical location. The cancelled directory must either be pre-created during repo initialization or created on demand when the first cancellation occurs.

## Decision

Add `requests/cancelled/` with `.gitkeep` to `garp-init.sh`, matching the existing convention for `pending/`, `active/`, and `completed/`. The directory exists from repo creation. garp_status scans this directory alongside the other three. garp_cancel moves files from `pending/` to `cancelled/` using the same `git mv` pattern as garp_respond.

Status field consistency (US-015): garp_cancel sets `status: "cancelled"` in the envelope JSON before moving. garp_respond sets `status: "completed"` before moving. The JSON status field always matches the directory.

## Alternatives Considered

### Create on First Cancel

Do not add `cancelled/` to garp-init.sh. Instead, create `requests/cancelled/` on the first garp_cancel invocation using `mkdir -p`.

- **Pro**: Fewer directories in a fresh repo. No migration needed for existing repos (directory appears naturally).
- **Con**: `garp_status` and `garp_thread` must handle the case where `cancelled/` does not exist. Every `listDirectory("requests/cancelled")` call would need a try-catch or existence check. The FileAdapter currently throws on missing directories. This adds defensive code throughout the codebase.
- **Rejection rationale**: Defensive directory-existence checks in every read path add complexity to the common case (reading) to accommodate the rare case (first cancel). The `.gitkeep` convention is already established for the other three directories. Consistency wins.

### Status Field Only (No Directory Move)

Keep cancelled requests in `pending/` and set `status: "cancelled"` in the JSON.

- **Pro**: No new directory. No git mv. garp_cancel just rewrites the JSON.
- **Con**: Violates ADR-005. Cancelled requests would appear in `pending/` directory listings, requiring every inbox scan to filter by status field. The entire point of directory-as-lifecycle is that directory listing IS the status filter.
- **Rejection rationale**: ADR-005 is a foundational decision. Cancelled is a lifecycle state. It gets a directory.

## Consequences

### Positive

- Consistent with ADR-005 and existing directory conventions
- garp_status scans 4 directories without conditional logic
- Inbox scan (`pending/`) automatically excludes cancelled requests
- Migration for existing repos is a single `mkdir + touch + commit`

### Negative

- Existing repos need a one-time migration to add the directory
- One more directory in the repo structure (minor visual noise)
