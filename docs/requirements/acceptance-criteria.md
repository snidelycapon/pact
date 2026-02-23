# Acceptance Criteria: pact-fmt (Group Envelope Primitives)

**Epic**: pact-y30
**Date**: 2026-02-23
**Author**: Luna (nw-product-owner)

---

## US-1: Group Defaults in Pact Definitions

- [ ] AC-1.1: PactMetadata includes optional `defaults` field with `response_mode`, `visibility`, `claimable`
- [ ] AC-1.2: pact_discover returns merged defaults (protocol + pact-level) for every pact
- [ ] AC-1.3: Pact files with no `defaults:` section return protocol defaults
- [ ] AC-1.4: Valid enum values enforced: response_mode ∈ {any, all, none_required}, visibility ∈ {shared, private}, claimable ∈ {true, false}

## US-2: Send Group Requests to Multiple Recipients

- [ ] AC-2.1: RequestEnvelope accepts `recipients: UserRef[]`
- [ ] AC-2.2: Optional `group_ref: string` on RequestEnvelope
- [ ] AC-2.3: `defaults_applied` object written to envelope with resolved response_mode, visibility, claimable
- [ ] AC-2.4: All user_ids in recipients validated against config.json team members
- [ ] AC-2.5: Single-recipient requests work with `recipients: [user]` (backward compatible)

## US-3: Group Requests in Inbox

- [ ] AC-3.1: Inbox matches current user against `recipients[]` array
- [ ] AC-3.2: Inbox entries include `group_ref` when present
- [ ] AC-3.3: Inbox entries include `claimed`, `claimed_by`, `claimed_at` for claimable requests
- [ ] AC-3.4: Claimed requests remain visible to all recipients (not removed from inbox)
- [ ] AC-3.5: Direct requests (single recipient, no group_ref) work unchanged

## US-4: Claim a Group Request Before Working

- [ ] AC-4.1: New "claim" action registered in pact_do action dispatcher
- [ ] AC-4.2: Successful claim writes `claimed: true`, `claimed_by: UserRef`, `claimed_at: ISO8601` to request
- [ ] AC-4.3: Claim on already-claimed request returns `already_claimed` error with claimer identity
- [ ] AC-4.4: Claim on non-claimable request returns `not_claimable` error
- [ ] AC-4.5: Claim does not change request status (remains pending)
- [ ] AC-4.6: Request envelope update is atomic (git add + commit in single operation)

## US-5: Response Completion by Mode and Visibility Filtering

- [ ] AC-5.1: response_mode "any" — request moves to completed on first response
- [ ] AC-5.2: response_mode "all" — request stays pending until response count == recipients count
- [ ] AC-5.3: response_mode "none_required" — responses accepted but do not trigger completion
- [ ] AC-5.4: visibility "private" — check_status/view_thread shows responses only to requester and individual respondent
- [ ] AC-5.5: visibility "shared" — all responses visible to all participants
- [ ] AC-5.6: Multiple responses stored (one per respondent) in responses/ directory

---

## Cross-Cutting Acceptance Criteria

- [ ] AC-X.1: All existing tests pass after `recipient` → `recipients` migration
- [ ] AC-X.2: No new tools added to MCP surface — claim is an action within pact_do
- [ ] AC-X.3: Protocol defaults hardcoded and not configurable at runtime
- [ ] AC-X.4: Token overhead per group pact ≤ 50 tokens (frontmatter + catalog + reasoning)
