# Technology Stack: Collapsed Tools + Declarative Brain

**Feature**: collapsed-tools-brain
**Date**: 2026-02-22
**Author**: Morgan (nw-solution-architect)

---

## 1. Existing Stack (No Changes)

### Runtime Dependencies

| Package | Version | Purpose | Change |
|---------|---------|---------|--------|
| `@modelcontextprotocol/sdk` | ^1.24.3 | MCP server framework (stdio transport, tool registration) | None |
| `simple-git` | ^3.32.1 | Git operations (pull, push, add, commit, mv) | None |
| `zod` | ^4.0.0 | Schema validation for protocol envelopes | None |

### Dev Dependencies

| Package | Version | Purpose | Change |
|---------|---------|---------|--------|
| `@types/node` | ^25.0.8 | Node.js type definitions | None |
| `esbuild` | ^0.25.0 | Build bundler | None |
| `typescript` | ^5.0.0 | Type checking and compilation | None |
| `vitest` | ^4.0.18 | Test runner | None |

### Runtime

| Component | Version | Purpose |
|-----------|---------|---------|
| Node.js | >=20.0.0 | Runtime engine |
| Bun | (build only) | Build script runner |

---

## 2. YAML Parsing Library Selection

The unified PACT.md format uses YAML frontmatter. A YAML parser is needed to extract the frontmatter deterministically.

### Decision: No New Dependency -- Built-in Frontmatter Extraction

**Approach**: Parse YAML frontmatter using a minimal extraction approach:

1. Detect frontmatter boundaries (`---` delimiters at start of file)
2. Extract the YAML string between delimiters
3. Parse using Node.js built-in or a zero-dependency approach

### Option Analysis

| Option | Bundle Size | Approach | Verdict |
|--------|-------------|----------|---------|
| `yaml` (npm) | ~120KB | Full YAML 1.2 spec parser | **Selected if built-in insufficient** |
| `js-yaml` (npm) | ~55KB | YAML 1.1 parser, widely used | Older spec, still viable |
| Hand-rolled JSON-subset parser | 0KB | Parse YAML-like frontmatter as structured text | Fragile, repeats heuristic problem |
| Node.js built-in | 0KB | None exists natively | Not available |

### Recommendation

**Add `yaml` as a runtime dependency** (the `yaml` npm package, version ^2.x). Rationale:

- YAML frontmatter parsing must be deterministic -- this is the entire reason for replacing the heuristic markdown parser
- The `yaml` package implements YAML 1.2 (the current spec), is well-maintained (>50M weekly downloads), MIT licensed, and has zero transitive dependencies
- Hand-rolling a YAML parser would repeat the exact mistake that created the 63% mutation score problem
- This is the only new runtime dependency. The principle is "zero new deps unless strongly justified" -- deterministic pact format parsing is strong justification.

**Alternative if zero-dep is a hard constraint**: Use `js-yaml` (smaller, YAML 1.1) or implement a JSON-only frontmatter format (valid JSON between `---` delimiters). The JSON alternative sacrifices readability but avoids any new dependency.

The final choice between `yaml`, `js-yaml`, or JSON frontmatter is a crafter implementation decision. The architecture requires: deterministic parsing of structured frontmatter with schema-level field definitions. Any approach that achieves this is acceptable.

---

## 3. New Dependencies Summary

### Runtime

| Package | Version | Purpose | Justification |
|---------|---------|---------|---------------|
| `yaml` | ^2.x | YAML frontmatter parsing in PACT.md | Replaces heuristic regex parser (63% mutation score). Deterministic parsing is a first-class requirement. Zero transitive deps. |

### Dev

No new dev dependencies.

---

## 4. Removed Dependencies

None. The collapsed architecture removes no existing dependencies.

---

## 5. Build and CI Impact

- Build script (`build.ts` via esbuild): No changes needed. esbuild bundles new imports automatically.
- CI pipeline (tests + linting): No changes needed. Vitest discovers new test files automatically.
- TypeScript config: No changes needed.
- Node.js engine requirement: Remains >=20.0.0.
