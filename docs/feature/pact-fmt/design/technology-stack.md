# Technology Stack: pact-y30 (Post-Apathy Revision)

**Feature**: pact-y30
**Date**: 2026-02-24
**Architect**: Morgan (nw-solution-architect)

---

## Stack Summary

No new dependencies. All features are implemented within the existing technology stack. The apathy audit reduced scope — fewer components means fewer potential dependency additions.

---

## Existing Stack (Retained)

| Layer | Technology | License | Rationale |
|-------|-----------|---------|-----------|
| **Runtime** | Node.js 20+ | MIT | Already in use; LTS support |
| **Language** | TypeScript 5.x | Apache-2.0 | Type safety for schema extensions |
| **Schema Validation** | Zod 4.x | MIT | Already validates RequestEnvelope; extend for recipients[] |
| **Git Operations** | simple-git 3.x | MIT | Already handles pull/push/retry; no change needed |
| **MCP SDK** | @modelcontextprotocol/sdk 1.x | MIT | Already registers 2 tools; no new tools |
| **YAML Parsing** | yaml 2.x (npm) | ISC | Already parses frontmatter; extend to parse new fields |
| **Test Framework** | vitest 4.x | MIT | 96 existing tests; extend with new scenarios |
| **Build** | esbuild 0.25.x | MIT | Bundling; no change |
| **Package Manager** | Bun | MIT | Already in use |

---

## New Dependencies

**None.** All features are schema/loader changes and file layout changes:

- **Flat-file glob**: Node.js `fs.readdir` with recursive option (built-in, no library)
- **Inheritance merge**: Object spread in TypeScript (no library)
- **Per-respondent storage**: Directory creation via existing FilePort
- **Compressed catalog**: String concatenation (no library)
- **Scope filtering**: Array filtering in TypeScript (no library)

---

## Rejected Alternatives

| Alternative | Reason for Rejection |
|-------------|---------------------|
| glob/fast-glob npm package | Node.js 20+ `fs.readdir({ recursive: true })` is sufficient for flat-file scan; no external dependency needed |
| gray-matter npm package | Already using `yaml` package for frontmatter parsing; adding gray-matter creates dual parsing path |
| Redis/SQLite for caching | Over-engineering; pact store is small (dozens of files), loaded once per session |

---

## Build & Deploy

No changes to build or deploy pipeline:

- Same `npm run build` (TypeScript → JavaScript)
- Same `npm test` (vitest)
- Same stdio transport (no new ports or services)
- Same environment variables (`PACT_REPO`, `PACT_USER`)
- New env var consideration: `PACT_STORE` for pact store root (defaults to `./pact-store/`)
