# Pact Format Specification

**Date**: 2026-02-22
**Task**: pact-sz7 (DISCOVER: Pact template/schema formalization audit)
**Evidence**: 4 existing pacts, pact-loader.ts runtime analysis, Vercel AGENTS.md token efficiency research, code-mode discovery wave

---

## Design Principles

Three forces shape this format:

1. **Token efficiency** — At 100 pacts, upfront loading costs ~33,600 tokens (20% of 200k context). Vercel's AGENTS.md research proved 80% compression with zero accuracy loss. The format must support compressed index representations.
2. **LLM readability** — Vercel found passive structured context (always present, no decision point) outperforms active retrieval (100% vs 79% pass rate). Frontmatter IS the machine-readable contract; agents must compose valid requests from frontmatter alone.
3. **Human authorship** — Teams create pacts through normal PRs. The body is prose guidance, examples, and anti-patterns — supplementary to the machine-readable frontmatter.

**Core rule**: Frontmatter is the source of truth. Body is supplementary. An agent that reads only frontmatter can compose a valid request and response.

---

## Canonical Format

```yaml
---
name: <kebab-case-identifier>
description: <single-sentence summary>
version: <semver, default "1.0.0">
scope: <global|org|repo|team|conversation>
registered_for: [<scope-qualifier>, ...]

when_to_use:
  - <situation where this pact is the right choice>
  - <another situation>

multi_round: <true|false, default false>

context_bundle:
  required: [<field_name>, ...]
  fields:
    <field_name>:
      type: <string|number|boolean|array|object>
      description: <terse field purpose>
    <field_name>:
      type: <string>
      enum: [<allowed_value>, ...]
      default: <default_value>
      description: <terse field purpose>

response_bundle:
  required: [<field_name>, ...]
  fields:
    <field_name>:
      type: <string>
      description: <terse field purpose>

attachments:
  - slot: <attachment-name>
    required: <true|false>
    convention: <filename pattern>
    description: <what to attach>

hooks:
  <lifecycle_event>: <hook_name>
---

# <Pact Title>

<Body: prose guidance, examples, anti-patterns. Supplementary to frontmatter.>
```

---

## Field Reference

### Identity

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `name` | yes | string | Kebab-case identifier. Matches filename stem (`ask.md` → `ask`). Used as `request_type` in protocol. |
| `description` | yes | string | Single sentence. Appears in discovery catalog. Optimize for scan — agents pick pacts by reading descriptions. |
| `version` | no | semver | Defaults to `1.0.0`. Increment on breaking changes to bundle schemas. |

### Scoping

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `scope` | yes | enum | Visibility level: `global` (built-in default), `org` (all teams), `repo` (single repo), `team` (named teams), `conversation` (ephemeral). |
| `registered_for` | no | string[] | Scope qualifiers. `team:backend`, `repo:platform-auth`, `user:cory`. Empty = available to all within scope. |

Scoping controls what `pact_discover` returns. A `scope: team` pact with `registered_for: [team:backend]` is only visible to backend team members.

### Behavioral

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `when_to_use` | yes | string[] | Situations where this pact is the right choice. Agents use this to select between pacts. Write as decision criteria, not marketing. |
| `multi_round` | no | boolean | `true` if the pact supports `thread_id` continuation. Default `false`. Signals to agents that the conversation may span multiple request/response cycles. |

### Bundles

Both `context_bundle` and `response_bundle` share the same structure:

```yaml
<bundle_name>:
  required: [field1, field2]
  fields:
    field1:
      type: string
      description: What goes here
    field2:
      type: string
      enum: [opt_a, opt_b, opt_c]
      default: opt_a
      description: Constrained choice
    field3:
      type: array
      description: List of items (items are strings unless noted)
```

**Field type vocabulary**: `string`, `number`, `boolean`, `array`, `object`. These are advisory — the protocol accepts `z.record(z.string(), z.unknown())` for both bundles. Types guide agent composition, they don't enforce at runtime.

**`required` is advisory**: The protocol warns on missing required context fields but does not reject the request. Response bundles have no runtime validation. Required fields signal "an agent should always include these."

**`enum` and `default`**: Optional constraints within field definitions. `enum` lists allowed values. `default` documents what the system assumes when the field is omitted.

### Attachments

```yaml
attachments:
  - slot: diff-file
    required: true
    convention: "{branch-name}.diff"
    description: Code changes to review
  - slot: test-results
    required: false
    convention: "test-results.txt"
    description: CI or local test output
```

Attachment slots are declared in frontmatter. Agents use `attachments` parameter on `pact_do(action: "send")` to attach files. The `convention` field suggests a filename pattern.

### Hooks

```yaml
hooks:
  on_send: notify-slack
  on_respond: update-ticket
  on_cancel: cleanup
```

Lifecycle events: `on_send`, `on_respond`, `on_amend`, `on_cancel`. Values are hook names resolved by the hook executor (future — Phase 3 feature). The loader checks `hooks != null` to set `has_hooks: boolean` on `PactMetadata`.

---

## Token Efficiency Design

### The Problem

| Pact Count | Full PACT.md Tokens | % of 200k Context |
|------------|--------------------|--------------------|
| 4 (today) | ~1,340 | 0.7% |
| 20 | ~6,700 | 3.4% |
| 50 | ~16,800 | 8.4% |
| 100 | ~33,600 | 16.8% |

### Two Representations

Applying Vercel's insight (compressed index + retrieval = full performance), each pact has two representations:

**1. Catalog entry** — returned by `pact_discover`, always available. Minimal tokens.

```
name|description|scope|context_required→response_required
ask|general question/input request|global|question→answer
code-review|structured PR review with blocking/advisory feedback|org|repository,branch,language,description→status,summary,blocking_feedback
```

Each entry: ~15-25 tokens. 100 entries: ~2,000 tokens. **94% reduction** vs loading full PACT.md files.

**2. Full pact** — retrieved on demand when composing a request/response. Complete frontmatter + body.

An agent's workflow becomes:
1. Read catalog (always in context, ~2k tokens for 100 pacts)
2. Identify the right pact by scanning descriptions and `when_to_use`
3. Retrieve full pact only when composing (one-time cost per interaction)

This matches Vercel's finding: "An index pointing to retrievable files works just as well."

### Frontmatter as the Machine Contract

The frontmatter is designed so an agent can compose a valid request without reading the body:

```yaml
context_bundle:
  required: [question]
  fields:
    question: { type: string, description: "The question -- be specific" }
    background: { type: string, description: "Context the recipient needs" }
```

From this alone, an agent knows: "I must include `question` (string). I may include `background` (string) for additional context." The body's Markdown tables and examples are supplementary for human pact authors and for edge cases.

### Writing Token-Efficient Pacts

1. **Descriptions**: One sentence. No filler. "Structured PR review with blocking/advisory feedback" not "Request a code review on a branch, PR, or changeset where the sender provides context..."
2. **Field descriptions**: Terse imperative. "PR URL to review" not "The URL of the pull request that needs to be reviewed"
3. **`when_to_use`**: Decision criteria, not marketing. "Finished a branch and want review before merge" not "When you want to get feedback from your team on your amazing code"
4. **Body**: Examples > explanation. A worked request/response pair teaches more than paragraphs of prose.
5. **Avoid redundancy**: Don't repeat frontmatter field descriptions in body tables. The body adds nuance, not duplication.

---

## Body Structure (Conventions)

The body is free-form Markdown. These sections are conventional but not required:

```markdown
# <Pact Title>

<1-2 sentence expansion of description. When the frontmatter description is sufficient, omit.>

## Example

<A complete worked request/response pair showing realistic field values.
 This is the highest-value body section — agents learn from examples.>

## Multi-Round Flow

<Only for multi_round: true pacts. Describe the round progression and
 how context_bundle fields change between rounds.>

## Notes

<Edge cases, anti-patterns, gotchas. Keep brief.>
```

**What NOT to include in the body:**
- Field tables duplicating frontmatter (the old format's tables are replaced by frontmatter `fields`)
- "When To Use" prose duplicating the frontmatter list
- Schema definitions (that's what frontmatter is)

---

## Scope Patterns

### Global (built-in defaults)

```yaml
scope: global
# No registered_for — available everywhere
```

Ships with PACT. Available to all users in all contexts. Examples: `ask`, `sanity-check`.

### Org-wide

```yaml
scope: org
# No registered_for — available to everyone in the org
```

Custom pacts adopted org-wide. Example: `code-review` standardized across all teams.

### Team-scoped

```yaml
scope: team
registered_for:
  - team:backend
  - team:platform
```

Visible only to named teams. Example: `deployment-approval` only relevant to platform and backend.

### Repo-scoped

```yaml
scope: repo
registered_for:
  - repo:platform-auth
```

Visible only in a specific repo context. Example: `security-review` only in the auth repo.

### Conversation-scoped (ephemeral)

```yaml
scope: conversation
```

Created ad-hoc for a single interaction. Not persisted in the pact store. Example: a one-off structured request with custom fields.

---

## Migration Path

### From: Directory-per-pact (current)

```
pacts/
  ask/
    PACT.md          ← Markdown tables define fields
    schema.json      ← JSON Schema defines types
  code-review/
    PACT.md
    schema.json
```

### To: Flat files (new)

```
pact-store/
  ask.md             ← YAML frontmatter defines everything
  code-review.md
  sanity-check.md
  design-pact.md
```

### What changes

| Aspect | Old Format | New Format |
|--------|-----------|------------|
| Field definitions | Markdown tables in body + schema.json | YAML frontmatter `context_bundle` / `response_bundle` |
| Type information | schema.json (JSON Schema) | Frontmatter field `type` + `enum` |
| Scoping | Implicit (repo-local) | Explicit `scope` + `registered_for` in frontmatter |
| Discovery | Directory listing of `pacts/` | Recursive glob `**/*.md` + frontmatter parsing |
| Multi-round | Documented in body prose | `multi_round: true` in frontmatter |
| Attachments | Documented in body prose | `attachments` slots in frontmatter |
| Hooks | Not supported | `hooks` in frontmatter |
| Loader path | `pacts/{name}/PACT.md` | `{store_root}/**/{name}.md` |

### Loader changes

`pact-loader.ts` already supports YAML frontmatter as primary parse path. Migration requires:
1. Change path resolution from `pacts/{name}/PACT.md` to `{store_root}/**/*.md` glob
2. Drop `readSchemaIfValid()` fallback (schema.json no longer needed)
3. Add `scope` and `registered_for` to `PactMetadata` interface
4. Add filtering by scope context in `pact-discover.ts`

---

## Relationship to Existing Pacts

The 4 existing pacts map to the new format as follows:

| Pact | Scope | Multi-round | Attachments | Notes |
|------|-------|-------------|-------------|-------|
| `ask` | global | no | no | Simplest pact. Reference example for format. |
| `sanity-check` | global | no | no | Domain-specific fields (customer, product). Shows field-rich context bundles. |
| `code-review` | org | yes | yes (diff, test results) | Shows multi-round, attachments, enum fields (status). |
| `design-pact` | org | yes | no | Meta-pact for creating new pacts. Shows phase/round patterns. |

---

## Open Questions

1. **Conversation-scoped pacts**: How are ephemeral pacts created and referenced? Inline in the request? Temporary file? This needs design.
2. **Pact store location config**: `PACT_STORE` env var vs config.json field vs convention (`./pact-store/`). Needs decision.
3. **Version compatibility**: When a pact's `version` increments with breaking changes, how do in-flight requests on the old version behave? Likely: version is informational only (no runtime enforcement).
4. **Index generation**: The compressed catalog format needs a generator — either at pact store write time (pre-computed) or at discovery time (computed on scan). Trade-off: staleness vs latency.
