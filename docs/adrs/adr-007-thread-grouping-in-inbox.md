# ADR-007: Thread Grouping Algorithm in Inbox

## Status: Accepted

## Context

US-011 requires garp_inbox to group pending requests by thread_id so that multi-round conversations appear as a single inbox item. The grouping algorithm must handle: (1) threads where both parties send requests, (2) threads where some rounds are completed and only one is pending, and (3) pre-Phase-2 requests with no thread_id.

The inbox currently scans `requests/pending/`, filters by `recipient == userId`, and returns flat entries sorted by `created_at`.

## Decision

Group by `thread_id` within the pending scan results only. After filtering by recipient, build a `Map<thread_id, InboxEntry[]>`. Groups with 1 entry emit as standalone `InboxEntry`. Groups with 2+ entries emit as `InboxThreadGroup` with aggregated fields. Requests without `thread_id` are keyed by `request_id` (always standalone).

The grouping operates ONLY on pending requests visible to the current user. No cross-directory joins (completed, cancelled) are performed during inbox scan.

Thread groups expose a `request_ids: string[]` field so the agent can drill into individual rounds via `garp_status` or view the full history via `garp_thread`.

## Alternatives Considered

### Cross-Directory Thread Assembly

Scan pending/, completed/, and cancelled/ for all requests in a thread, then present the full thread state in each inbox entry.

- **Pro**: Agent sees complete thread context directly in inbox (e.g., "round 3 of 5, rounds 1-2 completed")
- **Con**: Requires scanning 3 directories and reading many more JSON files per inbox call. Significantly increases latency and complexity. Mixes triage data (what needs my attention?) with context data (what is the full history?).
- **Rejection rationale**: Inbox is a triage tool. Full thread context is the job of `garp_thread`. Adding cross-directory scanning to inbox would make it slower and more complex without a clear triage benefit. The round_count in the group reflects only pending rounds, which is what the user needs for triage.

### No Grouping (Flat List + Thread ID Display)

Keep inbox as a flat list but display thread_id on each entry. Let the agent group visually or use garp_thread.

- **Pro**: Zero inbox logic changes. Simplest implementation.
- **Con**: Defeats the purpose of US-011. Agent sees 3 separate items for a 3-round thread, must reason about grouping itself. The problem statement specifically describes this as the pain to solve.
- **Rejection rationale**: The flat list is the current state and is explicitly identified as the problem by the user story. The whole point of US-011 is automatic grouping.

## Consequences

### Positive

- Inbox logic remains single-directory (pending/ only) -- no latency increase for the common case
- Backward compatible: requests without thread_id display normally
- Thread groups provide `request_ids` for agent to drill down
- Sorting by latest `created_at` within groups keeps recent threads at top

### Negative

- `InboxResult.requests` becomes a union type (`InboxEntry | InboxThreadGroup`) -- consumers must check `is_thread_group` discriminator
- Round count reflects only pending rounds, not total thread rounds (agent must call garp_thread for full count)
- Bidirectional threads where the current user is sender on some rounds: those rounds are not in the user's inbox (they sent them), so round_count may be lower than expected

### Risks

- Agents may not handle the union type correctly -- mitigated by clear `is_thread_group` discriminator and consistent field naming
