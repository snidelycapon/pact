# ADR-018: Group Defaults Merge Strategy

## Status

Accepted

## Context

Group envelope primitives (`response_mode`, `visibility`, `claimable`) need default values. Pact authors should only specify values that differ from the protocol's sensible defaults. This requires a merge strategy: protocol defaults + pact-level overrides → resolved defaults written to the request envelope.

Design question: Where does the merge happen, and when?

## Decision

**Merge at send time, store as `defaults_applied` on the request envelope.**

Protocol defaults are hardcoded constants:
```typescript
const PROTOCOL_DEFAULTS: GroupDefaults = {
  response_mode: "any",
  visibility: "shared",
  claimable: false,
};
```

The merge is a pure function:
```
mergeDefaults(protocolDefaults, pactDefaults) → GroupDefaults
```

Pact-level values override protocol values. Missing pact fields inherit protocol defaults. The result is always a complete `GroupDefaults` object (no null values).

The resolved defaults are written to `defaults_applied` on the request envelope at send time. All downstream logic (inbox, claim, respond, status, thread) reads from `defaults_applied` — never re-merges.

## Alternatives Considered

### A: Merge at read time (lazy merge)
Each action handler merges defaults when it needs them.

**Rejected**: Multiple merge points create inconsistency risk. If the pact definition changes between send and respond, the resolved defaults would differ. Storing `defaults_applied` at send time creates an immutable snapshot.

### B: Three-tier merge (protocol + org + pact)
Add an org-level defaults layer between protocol and pact.

**Rejected**: Over-engineering for the current deployment target (~100 users, 20-30 repos). Org-level defaults can be added later by extending the merge function. For now, two tiers (protocol + pact) are sufficient. See deferred item DEF1 (Pact inheritance / layered defaults).

### C: Request-time override (sender specifies per-request)
Allow the sender to override defaults in the send action.

**Rejected**: Deferred to keep v1 simple (see DEF5 in journey YAML). Pact-level defaults are sufficient. If needed later, the merge function extends to three tiers: protocol → pact → request.

## Consequences

- **Positive**: Single merge point (send time) — all downstream logic reads resolved values
- **Positive**: Immutable after send — pact definition changes don't affect in-flight requests
- **Positive**: Pure function — easy to test, no side effects
- **Positive**: Convention over configuration — empty defaults section means "use protocol defaults"
- **Negative**: Cannot change defaults mid-flight (by design — use separate request if behavior needs to change)
