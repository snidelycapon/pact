# Shared Artifact Registry: pact-fmt (Group Envelope Primitives)

**Epic**: pact-y30
**Date**: 2026-02-23
**Author**: Luna (nw-product-owner)

---

## Artifact Definitions

### `${protocol_defaults}`
- **Type**: Static configuration
- **Source**: Hardcoded in PACT system code
- **Values**: `{ response_mode: "any", visibility: "shared", claimable: false }`
- **Consumers**: Defaults merge logic (IC1), all agents (implicit behavior)
- **Lifecycle**: Changes only with protocol version bumps
- **Validation**: Compile-time constant; always valid

### `${pact_defaults}`
- **Type**: YAML frontmatter section in pact definition files
- **Source**: `pacts/{type}/PACT.md` → `defaults:` block
- **Schema**:
  ```yaml
  defaults:
    response_mode?: "any" | "all" | "none_required"
    visibility?: "shared" | "private"
    claimable?: boolean
  ```
- **Consumers**: pact_discover (returns merged defaults), pact_do:send (applies to request)
- **Lifecycle**: Edited by pact authors, versioned in git
- **Validation**: Advisory — agents nudge toward valid values on encounter
- **Convention**: Only fields differing from protocol_defaults should be present

### `${recipients}`
- **Type**: Array of user IDs on the request envelope
- **Source**: Sender agent resolves group_ref → user IDs via config.json
- **Schema**: `string[]` (user_id values)
- **Consumers**: Inbox filtering (IC3), claim tracking (IC5), response routing (IC6)
- **Lifecycle**: Set at send time, immutable after creation
- **Validation**: Each user_id must exist in config.json team membership

### `${group_ref}`
- **Type**: String identifier for the addressed group
- **Source**: Sender agent, based on human's intent (e.g., "@backend-team")
- **Schema**: `string` (optional — absent for direct requests)
- **Consumers**: Inbox display (label "→ @backend-team")
- **Lifecycle**: Set at send time, immutable
- **Validation**: Informational label only — not used for authorization

### `${claim_status}`
- **Type**: State on the request envelope
- **Source**: pact_do:claim action
- **Schema**:
  ```yaml
  claimed: boolean
  claimed_by?: UserRef       # { user_id, display_name }
  claimed_at?: string        # ISO 8601
  ```
- **Consumers**: Inbox display (IC5), duplicate-work prevention (IC4)
- **Lifecycle**: null → claimed (one-way transition for exclusive claims)
- **Validation**: Only one successful claim per request; second claim returns error
- **Concurrency**: Timestamp-based tie-breaking at git level

### `${response_mode}`
- **Type**: Enum on the request (from merged defaults)
- **Source**: protocol_defaults merged with pact_defaults
- **Values**: `"any"` | `"all"` | `"none_required"`
- **Consumers**: System completion logic (IC7)
- **Behavior**:
  - `any`: First response moves request to completed
  - `all`: Request stays pending until all recipients respond
  - `none_required`: No responses needed; informational only
- **Lifecycle**: Set at send time from merged defaults, immutable

### `${visibility}`
- **Type**: Enum on the request (from merged defaults)
- **Source**: protocol_defaults merged with pact_defaults
- **Values**: `"shared"` | `"private"`
- **Consumers**: Response retrieval filtering (IC6)
- **Behavior**:
  - `shared`: All responses visible to all recipients and requester
  - `private`: Responses visible only to requester and the individual respondent
- **Lifecycle**: Set at send time from merged defaults, immutable

### `${request_envelope}` (extended)
- **Type**: JSON file in requests/pending/
- **Changes from current**: New fields added to existing RequestEnvelope
  ```
  + recipients: UserRef[]        # replaces single `recipient: UserRef`
  + group_ref?: string           # optional group label
  + claimed?: boolean            # claim state
  + claimed_by?: UserRef         # who claimed
  + claimed_at?: string          # when claimed
  + defaults_applied: {          # resolved defaults (for auditability)
      response_mode: string
      visibility: string
      claimable: boolean
    }
  ```
- **Backward compatibility**: Single-recipient requests use `recipients: [single_user]` with no group_ref

### `${response_envelope}` (unchanged)
- **Type**: JSON file in responses/
- **Changes**: None — response structure stays the same
- **Note**: Visibility filtering happens at retrieval time, not storage time

---

## Integration Checkpoint Validation

| ID | Between | Shared Artifacts | Validation Rule |
|----|---------|-----------------|-----------------|
| IC1 | pact_discover → pact_do:send | pact_defaults, protocol_defaults | Merge produces valid {response_mode, visibility, claimable} with no null values |
| IC2 | config.json → pact_do:send | recipients | Every user_id in recipients[] exists in config.json |
| IC3 | pact_do:send → pact_do:inbox | recipients | Inbox query returns requests where current user is in recipients[] |
| IC4 | pact_do:claim → pact_do:claim | claim_status | Second claim on same request returns already_claimed error |
| IC5 | pact_do:claim → pact_do:inbox | claim_status | After claim, all recipients' inbox shows claimed_by |
| IC6 | pact_do:respond → visibility | visibility, response_envelope | Private responses not returned to other respondents |
| IC7 | pact_do:respond → response_mode | response_mode | any: complete on first; all: complete when count == recipients.length |

---

## Coherence Validation Results

### CLI Vocabulary Consistency
- **claim**: New action verb, consistent with PagerDuty "acknowledge" pattern
- **recipients** (plural): Replaces singular `recipient` — breaking change to schema
- **group_ref**: New field, optional, informational
- **defaults**: New frontmatter section, follows existing YAML conventions
- **Verdict**: ✅ Consistent — no vocabulary conflicts with existing 7 actions

### Emotional Arc Coherence
- **Flow A** (Author): Familiar → Confident → Done — smooth, no jarring transitions
- **Flow B** (Sender): Intent → Confirmation → Confidence — builds progressively
- **Flow C** (Receiver): Awareness → Clarity → Decision → Commitment → Completion — natural escalation of engagement
- **Flow D** (Private): Trust → Independence → Honesty — appropriate for sensitive contexts
- **Flow E** (Broadcast): Informed — single-note, appropriate for FYI
- **Verdict**: ✅ Coherent — confidence builds progressively across all flows

### Horizontal Integration
- Every `${variable}` has a documented single source in this registry
- No artifact is produced by multiple sources (single source of truth)
- claim_status is consumed by inbox display AND duplicate prevention — documented
- recipients is consumed by 3 systems (inbox, claim, response) — documented
- **Verdict**: ✅ No untracked artifacts, no ambiguous sources

### Backward Compatibility Assessment
- `recipient` (singular) → `recipients` (plural array) is a **breaking schema change**
- Mitigation: existing single-recipient requests become `recipients: [user]`
- pact_do:send, pact_do:inbox, pact_do:respond all need schema updates
- New action `claim` is additive (not breaking)
- `defaults_applied` on request envelope is additive
- **Verdict**: ⚠️ One breaking change (recipient→recipients), mitigatable

---

## Deferred Artifacts (Not Tracked in v1)

| Artifact | Why Deferred | Revisit Signal |
|----------|-------------|----------------|
| `${quorum_threshold}` | Quorum response mode deferred | Teams request built-in quorum |
| `${pact_parent}` | Pact inheritance deferred to DISCOVER | Teams duplicating pact definitions |
| `${watchers}` | Protocol concern, not format | Protocol evolution needs it |
| `${request_overrides}` | No sender-time override in v1 | Teams need per-request flexibility |
