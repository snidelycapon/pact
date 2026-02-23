# Requirements: pact-fmt (Group Envelope Primitives)

**Epic**: pact-y30
**Date**: 2026-02-23
**Author**: Luna (nw-product-owner)
**Evidence**: docs/discovery/pact-fmt/ (DISCOVER wave, CONDITIONAL-GO)

---

## Scope

Extend the PACT format and protocol to support group requests: multiple recipients, response collection modes, visibility control, and ownership claiming.

### In Scope (v1)
1. **Group defaults in pact definitions** — `defaults:` section in YAML frontmatter
2. **Group addressing** — `recipients: UserRef[]` replacing singular `recipient`
3. **Response modes** — any, all, none_required
4. **Visibility modes** — shared, private
5. **Claiming** — Exclusive claim action, separate from response
6. **Protocol defaults** — Hardcoded sensible values, pact authors override only what differs

### Out of Scope (Deferred)
- Quorum response mode (teams manage their own quorum tracking)
- Pact inheritance / layered defaults (separate DISCOVER wave)
- Sequential and private_then_shared visibility modes
- Multi-group addressing (sender creates multiple requests)
- Request-time override of pact defaults
- Watchers / CC recipients (protocol concern, not format)

---

## Functional Requirements

### FR-1: Pact Defaults Schema
The PactMetadata type must support an optional `defaults` field:
```yaml
defaults:
  response_mode?: "any" | "all" | "none_required"
  visibility?: "shared" | "private"
  claimable?: boolean
```
Missing fields inherit from protocol defaults: `{ response_mode: "any", visibility: "shared", claimable: false }`.

### FR-2: Group Addressing
The RequestEnvelope must support `recipients: UserRef[]` replacing `recipient: UserRef`. An optional `group_ref: string` provides a display label (e.g., "@backend-team"). All user_ids in recipients must be validated against config.json.

### FR-3: Defaults Merge and Application
When a request is sent, the system merges protocol defaults with pact-level defaults and writes the resolved values as `defaults_applied` on the request envelope. Pact-level values override protocol values. The merge produces a complete `{ response_mode, visibility, claimable }` object with no null values.

### FR-4: Inbox Group Filtering
Inbox queries must match the current user against `recipients[]` (not a single `recipient`). Results include `group_ref` and claim status (`claimed`, `claimed_by`, `claimed_at`) as metadata on each entry.

### FR-5: Claim Action
A new "claim" action in pact_do allows a recipient to mark a claimable request as claimed. Claims are exclusive — a second claim attempt returns `already_claimed` with the claimer's identity. Claims on non-claimable requests return `not_claimable`. Claiming does not change request status (remains pending).

### FR-6: Response Mode Completion Logic
- `any`: First response moves request from pending to completed
- `all`: Request stays pending until response count equals recipients count
- `none_required`: No responses trigger completion

### FR-7: Visibility Filtering
- `shared`: All responses visible to all participants (requester + all recipients)
- `private`: Each response visible only to the requester and the individual respondent

### FR-8: Backward Compatibility
Single-recipient requests must work with `recipients: [single_user]` and no group_ref. Behavior is identical to the current system for single-recipient cases.

---

## Non-Functional Requirements

### NFR-1: Convention Over Configuration
Pact definition files should only contain defaults that differ from protocol defaults. An empty or missing defaults section means "use protocol defaults for everything."

### NFR-2: Apathetic Design
PACT does not track who has/hasn't responded for response_mode: all. It does not nudge, escalate, or enforce deadlines. Humans and their agents manage their own coordination.

### NFR-3: Advisory Validation
Agents nudge pact authors toward valid defaults values but do not enforce. Teams build their own auditor skills for deeper validation specific to their needs.

### NFR-4: Token Budget
Group envelope primitives add approximately:
- +31 tokens per pact frontmatter (defaults section)
- +5 tokens per catalog entry (compressed format)
- +15 tokens per-request agent reasoning overhead
- Total per-session cost at scale (50 group pacts): ~750 tokens (~0.4% of 200k context)

---

## Constraints

1. **Git as transport**: Claiming concurrency resolved by git's atomic file write + commit. Timestamp-based tie-breaking.
2. **Flat-file format**: Request envelopes remain JSON files in `requests/pending/`. No database.
3. **MCP tool surface**: No new tools — `claim` is a new action within existing `pact_do` tool.
4. **Schema migration**: `recipient` → `recipients` is a breaking change requiring test migration.

---

## Dependencies

| This Feature | Depends On | Type |
|-------------|-----------|------|
| US-1 (Pact Defaults) | pact-format-spec.md update | Specification |
| US-2 (Group Send) | US-1 | Implementation |
| US-3 (Group Inbox) | US-2 | Implementation |
| US-4 (Claim) | US-2, US-3 | Implementation |
| US-5 (Response Mode + Visibility) | US-2, US-4 | Implementation |
| pact-grp (Group Addressing) | US-2 | Beads sibling task |
| pact-meta (PactMetadata extension) | US-1 | Beads sibling task |

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Breaking schema change (recipient→recipients) | Certain | Medium | Migration path: recipients: [single_user] for existing requests |
| Claim race conditions | Low | Medium | Git atomic operations + timestamp tie-breaking |
| Token budget underestimated | Low | Low | Conservative estimates include reasoning overhead |
| Teams confused by defaults layering | Medium | Low | Convention over configuration: omit what matches protocol |
