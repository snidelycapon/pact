# ADR-008: Append-Only Amendment Data Model

## Status: Accepted

## Context

US-014 adds the ability for the sender to add context to a pending request after submission. The design must preserve the original context_bundle while making amendments visible to the recipient. The system stores data as JSON files in a git repo, and all state is visible to anyone who reads the file.

## Decision

Amendments are stored as an append-only `amendments` array on the request envelope. Each entry contains `amended_at` (timestamp), `amended_by` (user_id), `fields` (key-value record), and optional `note` (description). The original `context_bundle` is never modified.

Schema addition:
```
amendments?: Array<{
  amended_at: string,
  amended_by: string,
  fields: Record<string, unknown>,
  note?: string,
}>
```

garp_amend reads the current envelope, pushes a new entry onto `amendments`, writes the updated envelope back to `requests/pending/{id}.json`, and commits.

## Alternatives Considered

### Merge Fields Into context_bundle

Merge amendment fields directly into context_bundle, overwriting or adding keys.

- **Pro**: Simple data model. Recipient sees one unified bundle.
- **Con**: Destroys audit trail. Cannot tell what was original vs amended. If the sender accidentally overwrites a key, the original value is lost. Contradicts the append-only design philosophy of GARP (git history shows the diff, but the JSON loses the distinction).
- **Rejection rationale**: GARP's value proposition is structured context preservation. Silently mutating context_bundle undermines the sender's original intent and makes amendments invisible without git log inspection.

### Separate Amendment Files

Write each amendment as a separate JSON file in `amendments/{request_id}/amendment-{n}.json`.

- **Pro**: Each amendment is an independent file, git-friendly, no risk of overwriting.
- **Con**: Requires scanning a new directory to reconstruct the full request. Every tool that reads a request (status, thread, respond, inbox) would need to join with the amendments directory. Significant complexity increase for a feature that at MVP scale involves 0-3 amendments per request.
- **Rejection rationale**: The amendment count per request is tiny (typically 0-2). A directory per request for amendments adds cross-file joins to every read path. At scale, this approach would be better, but GARP is designed for dozens of requests, not millions. The in-envelope array is simpler and sufficient.

## Consequences

### Positive

- Single file contains complete request state (envelope + amendments) -- no joins
- Append-only: original context_bundle is preserved, audit trail is clear
- git diff shows exactly what was added in each amendment commit
- Recipients see amendments as a distinct array, clearly separated from original context
- Each amendment is timestamped and attributed

### Negative

- Concurrent amendments to the same request could conflict (read-modify-write on same file). Mitigated: only the sender can amend, and GARP is designed for 1-2 concurrent users. Git push-retry handles rare conflicts.
- The envelope file grows with each amendment. At MVP scale (0-3 amendments), this is negligible.
- garp_amend must read, parse, modify, and rewrite the entire envelope file. This is a more complex write pattern than garp_request (write-only) or garp_respond (write response + move request). Mitigated: the pattern is straightforward (read JSON, push to array, write JSON).

### Risks

- Schema evolution: if AmendmentEntrySchema changes in a future version, existing amendment entries in repos will need to parse under the new schema. Mitigated: all fields except `note` are required, and the schema is intentionally minimal.
