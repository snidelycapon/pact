# Pact Format Specification

**Date**: 2026-02-22 (updated 2026-02-23)
**Task**: pact-sz7, pact-bmk (inheritance folded in)
**Evidence**: 4 existing pacts, pact-loader.ts runtime analysis, Vercel AGENTS.md token efficiency research, code-mode discovery wave, DISCUSS wave for pact-fmt

---

## Design Principles

Four forces shape this format:

1. **Apathy** — PACT does not have opinions about how it's used. It stores pacts, presents them when asked, and delivers requests faithfully. It does not recommend, route, suggest, or prefer. Agents and humans decide what to use and when.
2. **Token efficiency** — At 100 pacts, upfront loading costs ~33,600 tokens (20% of 200k context). Vercel's AGENTS.md research proved 80% compression with zero accuracy loss. The format must support compressed index representations.
3. **LLM readability** — Vercel found passive structured context (always present, no decision point) outperforms active retrieval (100% vs 79% pass rate). Frontmatter IS the machine-readable contract; agents must compose valid requests from frontmatter alone.
4. **Human authorship** — Teams create pacts through normal PRs. The body is prose guidance, examples, and anti-patterns — supplementary to the machine-readable frontmatter.

**Core rule**: Frontmatter is the source of truth. Body is supplementary. An agent that reads only frontmatter can compose a valid request and response.

**Bundles are agent instructions, not validated schemas.** The `context_bundle` and `response_bundle` sections tell agents what information to include when composing requests and responses. The protocol accepts any `Record<string, unknown>` and passes it through untouched. There is no runtime validation of bundle contents beyond advisory warnings for missing required fields. Types, enums, and descriptions are guidance for agents, not enforcement.

---

## Canonical Format

```yaml
---
name: <kebab-case-identifier>
extends: <parent-pact-name>
description: <single-sentence summary>
version: <semver, default "1.0.0">
scope: <global|org|repo|team>
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
| `name` | yes | string | Kebab-case identifier. Matches filename stem (`ask.md` → `ask`). Used as `request_type` in protocol. For variants: `request:backend` (colon-separated base:variant). |
| `extends` | no | string | Parent pact name. The loader resolves the chain and presents the merged result. See [Inheritance](#inheritance). |
| `description` | yes | string | Single sentence. Appears in discovery catalog. Optimize for scan — agents pick pacts by reading descriptions. |
| `version` | no | semver | Defaults to `1.0.0`. Increment on breaking changes to bundle schemas. |

### Scoping

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `scope` | yes | enum | Visibility level: `global` (built-in default), `org` (all teams), `repo` (single repo), `team` (named teams). |
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

## Inheritance

Pacts can extend a parent pact using the `extends` field. This enables teams to create domain-specific variants of base pacts without duplicating the entire definition.

### How It Works

A child pact only specifies what's different from its parent. The loader resolves the chain at read time and presents a single, complete, merged result. Agents never see the layering — they see a fully resolved pact.

```yaml
# pact-store/request:backend.md
---
name: request:backend
extends: request
description: Backend team request with service context conventions
scope: team
registered_for: [team:backend]

when_to_use:
  - Backend team member needs something done that involves service architecture context

context_bundle:
  required: [what, service]
  fields:
    service: { type: string, description: "Affected service name" }
    runbook: { type: string, description: "Link to relevant runbook" }
---

# Backend Request

Extends the base `request` pact with backend-specific context fields.
Service and runbook context helps the recipient's agent understand
the operational environment.
```

### Resolution Rules

The merge is a shallow override at the section level:

| Section | Behavior |
|---------|----------|
| `name` | Always from child (identity) |
| `extends` | Consumed during resolution, not present in output |
| `description` | Child overrides parent |
| `version` | Child overrides parent |
| `scope` | Child overrides parent |
| `registered_for` | Child overrides parent |
| `when_to_use` | Child replaces parent's list entirely |
| `multi_round` | Child overrides parent |
| `context_bundle` | Child's `fields` merged over parent's `fields` (add/override). Child's `required` replaces parent's `required`. |
| `response_bundle` | Same as context_bundle |
| `defaults` | Child's values override parent's; unspecified values inherit |
| `attachments` | Child replaces parent's list entirely |
| `hooks` | Child's hooks override parent's; unspecified hooks inherit |
| Body (prose) | Child's body replaces parent's body entirely |

The key principle: **child specifies only what changes.** For `defaults`, this means a child that sets `claimable: true` inherits the parent's `response_mode` and `visibility`. For bundles, a child that adds a `service` field gets it merged with the parent's fields; a child that sets `required: [what, service]` replaces the parent's required list completely (no union, no magic).

### Naming Convention

Variants use colon-separated names: `base:variant`.

```
request              ← base pact (scope: global)
request:backend      ← backend team variant
request:security     ← security team variant
ask                  ← base pact (scope: global)
ask:architecture     ← architecture-focused questions
```

The colon is a naming convention for human and agent readability. It has no semantic meaning to the protocol — `request:backend` is just a string used as `request_type`. The `extends` field in frontmatter is what creates the actual parent-child relationship.

### Catalog Presentation

`pact_discover` shows all pacts — base and variants — as a flat list. No hierarchy, no preferencing. PACT does not suggest which variant an agent should use.

```
request|general action request, deliver a specific result|global
request:backend|backend team request with service context|team:backend
request:security|security team request with threat model context|team:security
ask|get input that unblocks current work|global
ask:architecture|architecture-focused questions with system context|org
```

When an agent or the protocol needs to present a specific pact's instructions (composing, reading an inbox item, etc.), the loader returns the **fully resolved result** — the merge already applied. The consumer never needs to know about or traverse the inheritance chain.

### Depth

Single-level inheritance (child → parent) only. No grandchild chains. If a team needs deeper layering, they create a standalone pact. This prevents the debugging complexity that plagues deep inheritance in systems like Helm value cascades.

### Requests Are Typed by the Variant

A request sent as `request:backend` is `request:backend` forever. The recipient's agent receives the resolved `request:backend` instructions to understand how to handle it. PACT does not interpret, convert, or fall back to the base pact — it delivers exactly what was sent.

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
ask|get input that unblocks current work|global|question→answer
ask:architecture|architecture questions with system context|org|question,system_area→answer
request|ask someone to do something and deliver a result|global|what,done_when→status,result
request:backend|backend team request with service context|team:backend|what,service,done_when→status,result
review|get structured feedback with blocking/advisory split|global|artifact,what_to_focus_on→overall,must_change,suggestions
```

Base pacts and variants appear as a flat list. Variants show their resolved fields (parent + child merged). Each entry: ~15-25 tokens. 100 entries: ~2,000 tokens. **94% reduction** vs loading full pact files.

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
  ask.md                  ← global default (base pact)
  propose.md              ← global default (base pact)
  share.md                ← global default (base pact)
  request.md              ← global default (base pact)
  handoff.md              ← global default (base pact)
  check-in.md             ← global default (base pact)
  decide.md               ← global default (base pact)
  review.md               ← global default (base pact)
  backend/                ← team folder (organizational, not semantic)
    request:backend.md    ← variant extending request
    review:backend.md     ← variant extending review
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

## Default Pacts (Base Layer)

8 global pacts ship with PACT as the base layer teams can use directly or extend via inheritance:

| Pact | Pattern | Multi-round | Notes |
|------|---------|-------------|-------|
| `ask` | Get input that unblocks current work | no | Simplest pact. |
| `propose` | Workshop an idea through structured iteration | yes | Parallel feedback (groups) or ping-pong (1-to-1). |
| `share` | Push context to someone's agent, no action required | no | defaults.response_mode: none_required. |
| `request` | Ask someone to do something and deliver a result | no | defaults.claimable available for group open-requests. |
| `handoff` | Transfer ownership of in-progress work with full context | no | Relay chain pattern for groups. |
| `check-in` | Async status round across a group | no | defaults.response_mode: all, defaults.visibility: shared. |
| `decide` | Collective decision with structured options | no | defaults.response_mode: all, defaults.visibility: private. |
| `review` | Get structured feedback with blocking/advisory split | yes | defaults.visibility: private for independent reviews. |

The old pacts (`code-review`, `sanity-check`, `design-pact`) become examples of team-created variants:
- `code-review` → variant of `review` (e.g. `review:code`)
- `sanity-check` → variant of `ask` (e.g. `ask:sanity-check`)
- `design-pact` → subsumed by `propose`

---

## Loader Changes

`pact-loader.ts` migration:
1. Path resolution from `pacts/{name}/PACT.md` to `{store_root}/**/*.md` glob
2. Drop `readSchemaIfValid()` fallback (schema.json no longer needed)
3. Drop Markdown table fallback — all pacts must use YAML frontmatter
4. Add `scope`, `registered_for`, `extends`, `defaults` to `PactMetadata` interface
5. Resolve inheritance at load time: if `extends` is present, load parent, merge per resolution rules, return resolved result
6. Add filtering by scope context in `pact-discover.ts`
7. Catalog output returns resolved entries (agent never sees raw inheritance chain)

---

## Open Questions

1. **Pact store location config**: `PACT_STORE` env var vs config.json field vs convention (`./pact-store/`). Needs decision.
2. **Version compatibility**: When a pact's `version` increments with breaking changes, how do in-flight requests on the old version behave? Likely: version is informational only (no runtime enforcement).
3. **Index generation**: The compressed catalog format needs a generator — either at pact store write time (pre-computed) or at discovery time (computed on scan). Trade-off: staleness vs latency.
