# Technology Stack: pact-fmt (Group Envelope Primitives)

**Feature**: pact-fmt
**Date**: 2026-02-23
**Architect**: Morgan (nw-solution-architect)

---

## Stack Summary

No new dependencies. All group envelope features are implemented within the existing technology stack.

---

## Existing Stack (Retained)

| Layer | Technology | License | Rationale |
|-------|-----------|---------|-----------|
| **Runtime** | Node.js 20+ | MIT | Already in use; LTS support |
| **Language** | TypeScript 5.x | Apache-2.0 | Type safety for schema extensions |
| **Schema Validation** | Zod | MIT | Already validates RequestEnvelope; extend for group fields |
| **Git Operations** | simple-git | MIT | Already handles pull/push/retry; no change needed for claiming |
| **MCP SDK** | @modelcontextprotocol/sdk | MIT | Already registers 2 tools; claim action uses existing pact_do |
| **YAML Parsing** | yaml (npm) | ISC | Already parses frontmatter; extend to parse `defaults` section |
| **Test Framework** | vitest | MIT | 96 existing tests; extend with group scenarios |

---

## New Dependencies

**None.** All group features are domain logic implemented with existing libraries.

- **Defaults merge**: Pure TypeScript function (no library)
- **Claim exclusivity**: Git atomic operations via existing simple-git
- **Response counting**: File system directory listing via existing FilePort
- **Visibility filtering**: Array filtering in TypeScript (no library)
- **Timestamp tie-breaking**: ISO 8601 string comparison (built-in)

---

## Rejected Alternatives

| Alternative | Reason for Rejection |
|-------------|---------------------|
| Redis/SQLite for claim locking | Over-engineering; git atomic write + timestamp ordering sufficient for ~100 users |
| Separate claim protocol (HTTP) | Violates ADR-001 (git as transport) and ADR-003 (stdio MCP) |
| JSON Schema for defaults validation | Zod already in use; adding JSON Schema creates dual validation path |
| Event sourcing for response tracking | Append-only directory structure already provides audit trail; event store is premature |

---

## Build & Deploy

No changes to build or deploy pipeline. The feature is a code-level extension of the existing MCP server:

- Same `npm run build` (TypeScript → JavaScript)
- Same `npm test` (vitest)
- Same stdio transport (no new ports or services)
- Same environment variables (`PACT_REPO`, `PACT_USER`)
