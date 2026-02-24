# ADR-020: Flat-File Pact Store with Defaults as Agent Guidance

## Status

Accepted

## Context

The pact store currently uses a directory-per-pact layout (`pacts/{name}/PACT.md` + optional `schema.json`). This doesn't scale for the target of 100 pacts across 20-30 repos and doesn't support scoping, inheritance, or compressed catalog output.

Separately, the apathy audit (2026-02-23) established that behavioral defaults (`response_mode`, `visibility`, `claimable`) are agent guidance — the protocol stores and presents them but does not merge, apply, or enforce them at runtime. This supersedes ADR-018 (defaults merge) and ADR-019 (exclusive claim).

Two decisions are bundled here because they're tightly coupled: the pact file format determines what metadata the loader parses, and the loader determines what the catalog presents to agents.

## Decision

### 1. Flat-file layout

Replace `pacts/{name}/PACT.md` with `{store_root}/**/*.md`. Pact definitions are flat Markdown files with YAML frontmatter. The loader recursively globs the store root and parses each `.md` file.

Store root defaults to `./pact-store/` and can be configured via `PACT_STORE` environment variable.

### 2. Extended frontmatter

Pact frontmatter adds: `scope`, `registered_for`, `defaults`, `extends`, `attachments`, `multi_round`, `hooks`. See `docs/discovery/pact-format-spec.md` for the full canonical format.

### 3. Defaults as guidance

The `defaults` section in frontmatter is agent guidance:
```yaml
defaults:
  response_mode: all
  visibility: private
  claimable: true
```

The protocol:
- **Parses** defaults from frontmatter (pact-loader)
- **Presents** defaults in catalog entries (pact-discover)
- **Does not merge** defaults with protocol constants
- **Does not store** `defaults_applied` on request envelopes
- **Does not enforce** defaults at runtime

Agents read the pact definition (via catalog or full retrieval), see the defaults guidance, and decide how to behave. A well-behaved agent applies protocol fallback logic (`response_mode: any`, `visibility: shared`, `claimable: false`) when the pact omits defaults.

### 4. Single-level inheritance

Pacts can extend a parent via `extends: parent-name`. The loader resolves the chain at load time using shallow merge per section. Single-level only (no grandchild chains). Consumers see the fully resolved pact — never raw inheritance.

### 5. Compressed catalog

`pact_discover` returns pipe-delimited entries for token efficiency:
```
name|description|scope|context_required→response_required
```

~15-25 tokens per entry. 100 entries ≈ 2,000 tokens (94% reduction vs full pact files).

## Alternatives Considered

### A: Keep directory-per-pact, add metadata to schema.json
Extend existing layout with metadata in schema.json files.

**Rejected**: Two-file format (PACT.md + schema.json) is redundant with YAML frontmatter. The format spec established frontmatter as the single source of truth.

### B: Database-backed pact store (SQLite)
Store pact definitions in SQLite for fast querying and scope filtering.

**Rejected**: Over-engineering for dozens of files. Filesystem glob + YAML parse is sufficient. SQLite adds operational complexity (migrations, corruption recovery). Git remains the persistence layer.

### C: Runtime defaults merge (ADR-018 approach)
Merge protocol defaults + pact defaults at send time, store as `defaults_applied` on the envelope.

**Rejected by apathy audit**: PACT does not merge or enforce. Agents read guidance and decide. This keeps the protocol simple and behavioral logic in agents where it belongs.

## Consequences

- **Positive**: Single-file pact format (no schema.json) simplifies authoring
- **Positive**: Recursive glob scales naturally to 100+ pacts with subdirectory organization
- **Positive**: Compressed catalog keeps discovery within 2% of 200k context budget
- **Positive**: Inheritance enables team variants without duplication
- **Positive**: Defaults as guidance preserves apathy principle — protocol stays simple
- **Negative**: Markdown table fallback dropped — all pacts must migrate to YAML frontmatter
- **Negative**: `PACT_STORE` env var adds configuration surface (mitigated by sensible default)
