# Test Scenarios: pact-y30

**Date**: 2026-02-24
**Agent**: Quinn (nw-acceptance-designer)
**Epic**: pact-y30 (Pact store: flat-file format, catalog metadata, default pacts)
**Framework**: Vitest + GWT helpers (given/when/thenAssert)
**Integration**: Real services (local bare git repos, Alice+Bob+Carol pattern)

---

## Summary

| Test File | Scenarios | Error/Edge | Error % |
|-----------|-----------|------------|---------|
| y30-group-walking-skeleton.test.ts | 3 | 0 | 0% (walking skeletons) |
| y30-flat-file-loader.test.ts | 9 | 7 | 78% |
| y30-compressed-catalog.test.ts | 7 | 3 | 43% |
| y30-group-error-paths.test.ts | 10 | 6 | 60% |
| **Total** | **29** | **16** | **55%** |

All scenarios enter through driving ports (`createPactServer().callTool()`). No internal components are accessed directly.

---

## Test File 1: y30-group-walking-skeleton.test.ts

Walking skeletons proving the core group addressing lifecycle works E2E.

### WS-1: Full group request-respond lifecycle
- Alice sends to Bob and Carol → envelope has recipients[]
- Both see the request in inbox
- Bob responds → per-respondent file `responses/{id}/bob.json`
- Carol responds → per-respondent file `responses/{id}/carol.json`
- Alice checks status → sees both responses

### WS-2: Group inbox enrichment
- Alice sends with group_ref `@backend-team`
- Bob's inbox shows `recipients_count: 2` and `group_ref: @backend-team`

### WS-3: Single recipient backward compatibility
- Alice sends with `recipients: ["bob"]` (array of one)
- Works identically to current behavior
- Response stored in per-respondent directory format

---

## Test File 2: y30-flat-file-loader.test.ts

Flat-file pact store, extended metadata, and pact inheritance.

### M1-1: Flat-file discovery with extended metadata
- Discovers pacts from `pact-store/*.md` via glob
- Each pact includes `scope` field
- Pacts with defaults include them; pacts without omit them

### M1-2: Multi_round, attachments, hooks metadata
- Review pact has `multi_round: true`
- Attachment slots parsed and included
- `has_hooks: true` when hooks section present
- Defaults include `visibility: private`

### M1-3: Subdirectory discovery
- Pacts in `pact-store/backend/*.md` are found by recursive glob

### M2-1: Inheritance resolution — child merges with parent
- `request--backend` extends `request`
- Child overrides: description, scope, registered_for
- Context fields merge (parent + child)
- Required list replaced by child
- Defaults merge (child overrides, parent inherits)
- `extends` field consumed, not in output

### M2-2: Flat catalog presentation
- Both base and variant appear as flat entries, no hierarchy

### M3-1: Missing parent in extends (ERROR)
- Orphan variant excluded from catalog
- Valid pacts still returned

### M3-2: Missing name field (ERROR)
- Pact with no name excluded

### M3-3: Deep inheritance rejected (ERROR)
- Grandchild (child→child→parent) excluded
- Single-level variants still work

### M3-4: Empty pact-store (EDGE)
- Empty directory → empty catalog, no error

### M3-5: Malformed YAML (ERROR)
- Invalid YAML → pact excluded, others still returned

### M3-6: Non-.md files ignored (EDGE)
- .txt, .json files in pact-store silently skipped

### M3-7: Fallback to old pacts/ directory (BACKWARD COMPAT)
- No pact-store/ → old pacts/{name}/PACT.md still works

---

## Test File 3: y30-compressed-catalog.test.ts

Token-efficient compressed catalog and scope filtering.

### C1-1: Pipe-delimited compressed catalog
- `format: "compressed"` returns pipe-delimited entries
- Each entry: `name|description|scope|context_required→response_required`

### C1-2: Compressed entries match full metadata
- Name and description in compressed entry match full catalog

### C2-1: Scope filtering
- `scope: "global"` returns only global pacts

### C2-2: No scope filter returns all
- Without scope parameter, all pacts returned

### C3-1: No matching scope (ERROR)
- `scope: "repo"` with no repo pacts → empty, not error

### C3-2: Empty pact-store compressed (EDGE)
- Compressed format with no pacts → empty string

### C3-3: Invalid scope value (ERROR)
- Nonexistent scope → empty results, not error

---

## Test File 4: y30-group-error-paths.test.ts

Group addressing validation, error handling, and backward compatibility.

### E1-1: Unknown recipient in array (ERROR)
- `recipients: ["bob", "nonexistent"]` → send fails
- Error message includes the unknown user_id
- No request file created

### E1-2: Empty recipients array (ERROR)
- `recipients: []` → validation error

### E1-3: Sender in recipients (ERROR)
- `recipients: ["alice", "bob"]` (alice is sender) → error

### E2-1: Non-recipient responding (ERROR)
- Carol responds to Bob-only request → rejected

### E2-2: Duplicate response from same recipient (ERROR)
- Bob responds twice → second response rejected

### E3-1: Old-format single recipient readable (BACKWARD COMPAT)
- Request with `recipient` field (not `recipients`) still appears in inbox

### E3-2: Old-format single response file readable (BACKWARD COMPAT)
- `responses/{id}.json` (file) still readable by status check

### E4-1: Thread with per-respondent responses
- view_thread shows all per-respondent responses from directory

### E4-2: Group inbox shows old-format request
- Old single-recipient requests still appear in inbox

### E4-3: Status check with mixed old/new format
- Old single-response format still readable alongside new directory format

---

## Driving Ports Exercised

| Port | Actions Tested |
|------|----------------|
| `pact_discover` | Full catalog, compressed format, scope filter, inheritance resolution |
| `pact_do(send)` | recipients[], group_ref, validation errors |
| `pact_do(inbox)` | Multi-recipient filtering, group enrichment |
| `pact_do(respond)` | Per-respondent storage, non-recipient rejection |
| `pact_do(check_status)` | Per-respondent reads, old-format compat |
| `pact_do(view_thread)` | Per-respondent thread assembly |
| `pact_do(cancel)` | Not tested (unchanged by pact-y30) |
| `pact_do(amend)` | Not tested (unchanged by pact-y30) |

---

## Integration Contracts Coverage

| IC | Description | Test Files |
|----|-------------|------------|
| IC1 | Group send: all user_ids in recipients[] exist | walking-skeleton, error-paths |
| IC2 | Inbox filtering: group requests appear for all recipients | walking-skeleton |
| IC3 | Response storage: per-respondent files readable by status/thread | walking-skeleton, error-paths |
| IC4 | Inheritance: resolved metadata complete and consistent | flat-file-loader |
| IC5 | Catalog: compressed entries match full metadata | compressed-catalog |
| IC6 | Backward compat: old formats still readable | flat-file-loader, error-paths |

---

## Implementation Sequence

Tests are marked `@skip` (via `describe.skip`) for one-at-a-time implementation:

1. **y30-group-walking-skeleton** — Enable after schema migration (`recipients[]`) and per-respondent storage
2. **y30-flat-file-loader** — Enable after flat-file glob loader and inheritance resolution
3. **y30-compressed-catalog** — Enable after compressed catalog format
4. **y30-group-error-paths** — Enable after group validation and backward compat handlers
