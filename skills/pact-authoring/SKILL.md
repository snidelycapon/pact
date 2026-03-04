---
name: "Pact Authoring"
description: "Create and maintain pact definitions for a PACT store"
---

# Pact Authoring

Guide the user through creating or modifying pact definitions. Use this reference to ensure every pact is well-formed and follows PACT conventions.

## Before You Start

1. **Read the user's existing pact store.** List `pact-store/` in their pact repo to understand what pacts already exist. This prevents duplicating existing pacts and helps you suggest inheritance when appropriate.
2. **Ask what coordination pattern they need.** Use the litmus test below to validate it's a good fit for a pact.

## Core Philosophy

**PACT is a dumb pipe with a catalog.** It stores pact definitions, presents them when asked, and delivers requests faithfully. Agents are the engine — they read definitions, decide behavior, compose bundles, and coordinate.

### The Litmus Test

Before writing a pact, ask: **"Is this a coordination pattern or a command interface?"**

- **Coordination pattern** (good pact): Async exchange where both sides exercise judgment. The sender frames context, the responder interprets and decides.
- **Command interface** (bad pact): Synchronous-feeling invocation where the "response" is just an execution result.

If the response doesn't require judgment, it's not a pact — it's an API call.

### Agent Guidance, Not Enforcement

Fields like `defaults.response_mode`, `defaults.visibility`, `defaults.claimable`, and `multi_round` are *guidance for agents*, not runtime enforcement. PACT passes them through. Pact definitions should explain *why* a default exists so agents can make intelligent decisions about when to follow or deviate.

---

## File Format

Pact definitions are Markdown files with YAML frontmatter, stored in `pact-store/`.

### Directory Layout

```
pact-store/
  ask.md                    # Global pacts (root level)
  review.md
  propose.md
  backend/                  # Scoped variants in subdirectories
    request--backend.md
    review--backend.md
```

### Naming Convention

- **Global pacts**: Single verb or hyphenated phrase — `ask`, `review`, `propose`, `handoff`, `check-in`.
- **Variants**: `parent--specialization` (double-dash separator) — `check-in--weekly`, `request--backend`.
- Filename matches the `name` field in frontmatter, with `.md` appended.

---

## Frontmatter Schema

### Required Fields

```yaml
---
name: ask                           # Must match filename (minus .md).
description: Get input that...      # One-line summary. Shows in catalog.
---
```

### Standard Fields

```yaml
version: "1.0.0"
scope: global                       # Discovery filter. "global" for base pacts.
subject_hint: "Brief summary..."    # Guides agents on composing the subject line.

when_to_use:
  - When condition A applies
  - When condition B applies

multi_round: false                  # true if the pact supports iterative rounds.
```

### Bundles

```yaml
context_bundle:
  required: [question]
  fields:
    question: { type: string, description: "The question" }
    background: { type: string, description: "Context needed to answer well" }

response_bundle:
  required: [answer]
  fields:
    answer: { type: string, description: "Direct answer" }
    reasoning: { type: string, description: "Why this answer" }
```

Bundles are `Record<string, unknown>` at runtime — the protocol passes them through untouched. Field definitions are agent guidance.

**Supported types**: `string`, `number`, `boolean`, `array`, `object` (documentation hints, not runtime checks).

**Enums**: `verdict: { type: string, enum: [approve, request-changes, comment], description: "..." }`

**Defaults**: `urgency: { type: string, enum: [normal, high], default: normal, description: "..." }`

### Defaults Block

```yaml
defaults:
  response_mode: all          # "all" / "any" / "none_required"
  visibility: private         # "private" / "shared"
  claimable: true             # Group requests: one person claims the work
```

Defaults are freeform `Record<string, unknown>`. The keys above are conventions, not a closed set.

### Inheritance

```yaml
extends: propose              # Parent pact name. Single-level only.
```

**When to extend:** The domain needs 3+ specialized fields that wouldn't make sense on the global.

**When NOT to extend:** Adding 1-2 fields (use the global), renaming fields, or completely replacing parent required fields.

**Merge rules:**
- `context_bundle.fields`: Shallow merge (parent + child, child wins)
- `context_bundle.required`: Child replaces parent entirely
- `response_bundle`: Child's if non-empty, else parent's wholesale
- `defaults`: Shallow merge (parent + child, child wins)
- `name`, `description`, `scope`: Child always wins

**Failures (silent):** Orphan variants (missing parent) and deep inheritance (grandchild) are silently excluded from the catalog.

### Optional Extended Fields

```yaml
attachments:
  - slot: design_doc
    required: true
    convention: "PDF or Figma link"
    description: "The design document under review"

registered_for:
  - "+design-team"
```

---

## Markdown Body

Everything after the closing `---` is the body. It's not parsed by the loader but is the most important part for readers.

### Required Sections

```markdown
# Pact Title

## Example

**Request:**
```yaml
subject: "Concrete, descriptive subject line"
context_bundle:
  field: "concrete, realistic value"
```

**Response:**
```yaml
response_bundle:
  field: "concrete, realistic value"
```

## Notes

- When to use this vs alternatives.
- Why defaults are set the way they are.
- Cross-references to related pacts.
```

### Example Quality

Good examples:
- Use realistic, specific content (real-sounding names, real technical problems)
- Show all required fields and at least one optional field
- Demonstrate the judgment involved — responses show reasoning, not just data
- Include a realistic `subject` line matching the `subject_hint`

Bad examples:
- Placeholder values (`"Lorem ipsum"`, `"TODO"`)
- Only required fields
- Mechanical responses that don't demonstrate judgment
- Missing `subject` in the request example

---

## Default Pacts (Base Layer)

10 global pacts ship with PACT:

| Pact | Pattern | Multi-round |
|------|---------|-------------|
| `ask` | Get input that unblocks work | no |
| `propose` | Workshop an idea through iteration | yes |
| `share` | Push context, no action required | no |
| `request` | Ask someone to do something | no |
| `handoff` | Transfer ownership of work | no |
| `check-in` | Async status round | no |
| `decide` | Collective decision | no |
| `review` | Structured feedback | yes |
| `riff` | WIP reactions and remixes | yes |
| `try` | Hands-on testing | yes |

### Selection Guide

| Situation | Use |
|---|---|
| "Quick question, need an answer" | `ask` |
| "I have an idea, help me refine it" | `propose` |
| "FYI, no action needed" | `share` |
| "Please do this and deliver a result" | `request` |
| "I'm done, you take over" | `handoff` |
| "Everyone report your status" | `check-in` |
| "Which option should we go with?" | `decide` |
| "Review this before I ship it" | `review` |
| "How does this look? Thoughts?" | `riff` |
| "Try this and tell me what happens" | `try` |

---

## Anti-Patterns

| Anti-pattern | What to do instead |
|---|---|
| **Command interface** (response is execution output) | Use an API/tool call directly |
| **Synchronous query** (expects immediate answer) | Use the tool that has the data |
| **Thin wrapper** (variant adds 1 field) | Use the global pact |
| **Field replacement** (variant replaces all parent fields) | Write a new global pact |
| **Vendor lock-in** (fields reference specific tools) | Use generic field names |
| **Kitchen sink** (10+ context fields) | Split into multiple pacts |
| **Missing subject_hint** | Every pact should include one |

---

## Checklist: Before Shipping a Pact

Validate the pact against this checklist before writing it to disk:

1. **Coordination, not command.** Does the response require judgment?
2. **Async-compatible.** Is it OK if the response comes hours later?
3. **Fields earn their place.** Every field carries non-derivable judgment input.
4. **`subject_hint` is set.** Agents know how to compose the subject line.
5. **Example is realistic.** Would a real person send this? Includes a `subject`?
6. **Notes explain the "why."** Defaults have rationale. Alternatives cross-referenced.
7. **Scope is correct.** Global = `scope: global`. Variants = subdirectory name.
8. **Inheritance is additive.** Variants add fields; they don't replace parent's core.
9. **Name matches filename.** `name: check-in--weekly` lives in `check-in--weekly.md`.
