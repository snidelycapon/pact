# Pact Authoring Reference

The single source of truth for creating and maintaining pact definitions in a PACT store.

## Core Philosophy

**PACT is a dumb pipe with a catalog.** It stores pact definitions, presents them when asked, and delivers requests faithfully. That's it. The agents are the engine — they read definitions, decide what to do, compose requests, interpret responses, and coordinate with each other.

This means pact definitions are the only "smart" part of the system. A well-written pact teaches an agent *how to behave* through its structure, field descriptions, defaults, and examples. The protocol just serves it.

### The Litmus Test

Before writing a pact, ask: **"Is this a coordination pattern or a command interface?"**

- **Coordination pattern** (good pact): Async exchange where both sides exercise judgment. The sender frames context, the responder interprets and decides. Examples: asking a question, proposing an idea, handing off work, requesting feedback.
- **Command interface** (bad pact): Synchronous-feeling invocation where the "response" is just an execution result. The sender passes parameters, the responder executes mechanically. Examples: deploying a service, querying a database, triggering a CI pipeline.

If the response doesn't require judgment, it's not a pact — it's an API call.

### Agent Guidance, Not Enforcement

Fields like `defaults.response_mode`, `defaults.visibility`, `defaults.claimable`, and `multi_round` are *guidance for agents*, not runtime enforcement. The pact says "this is claimable"; the agent decides whether to honor that. PACT passes it through.

This means your pact definitions should explain *why* a default exists, not just declare it. Agents reading the definition need enough context to make intelligent decisions about when to follow the guidance and when to deviate.

---

## File Format

Pact definitions are Markdown files with YAML frontmatter. They live in the `pact-store/` directory of a PACT repo.

### Directory Layout

```
pact-store/
  ask.md                    # Global pacts (no subdirectory)
  review.md
  propose.md
  ...
  support/                  # Scoped variants in subdirectories
    handoff:escalation.md
    request:investigate.md
  ttrpg/
    check-in:turn.md
    propose:faction.md
```

Global pacts go at the root. Scoped variants go in subdirectories named after their scope. The subdirectory name should match the `scope` field in the frontmatter.

### Naming Convention

- **Global pacts**: Single verb — `ask`, `review`, `propose`, `handoff`, `request`, `share`, `check-in`, `decide`.
- **Variants**: `parent:specialization` — `check-in:sprint`, `handoff:escalation`, `propose:faction`.
- The filename matches the `name` field in frontmatter, with `.md` appended.

---

## Frontmatter Schema

Every field the pact-loader parses, with types and behavior.

### Required Fields

```yaml
---
name: ask                           # Pact identifier. Must match filename (minus .md).
description: Get input that...      # One-line summary. Shows in catalog listings.
---
```

`name` is the only strictly required field for flat-file pacts. Missing `name` causes the file to be silently skipped.

### Standard Fields

```yaml
version: "1.0.0"                   # Semantic version as a string.

scope: global                       # Scope tag for filtering via pact_discover.
                                    # Use "global" for base pacts.
                                    # Use the subdirectory name for variants.

when_to_use:                        # Agent decision guidance. String or array of strings.
  - When condition A applies        # pact_discover returns this so agents can pick
  - When condition B applies        # the right pact for the situation.

multi_round: false                  # true if the pact supports iterative rounds.
                                    # Agents use this to decide whether to re-send.
```

### Bundles

The two bundle specs define the contract between sender and responder.

```yaml
context_bundle:
  required: [question]              # Field names the sender MUST include.
  fields:                           # All available fields (required + optional).
    question:
      type: string
      description: "The question — be specific and actionable"
    background:
      type: string
      description: "Context the recipient needs to answer well"
    options_considered:
      type: array
      description: "What you already considered and why it's insufficient"

response_bundle:
  required: [answer]
  fields:
    answer:
      type: string
      description: "Direct answer to the question"
    reasoning:
      type: string
      description: "Why this answer, briefly"
```

**Important**: Bundles are `Record<string, unknown>` at runtime. The protocol passes them through untouched. The field definitions here are *agent guidance* — they tell the agent what to include, but PACT won't reject a request that omits a "required" field. The agent decides how strictly to follow the schema.

**Supported field types**: `string`, `number`, `boolean`, `array`, `object`. These are documentation hints, not runtime type checks.

**Enums**: Use inline `enum` for constrained-choice fields:
```yaml
verdict: { type: string, enum: [approve, request-changes, comment], description: "..." }
```

### Defaults

```yaml
defaults:
  response_mode: all                # "all" = every recipient should respond.
                                    # "any" = one response suffices.
                                    # "none_required" = response is optional.
  visibility: private               # "private" = don't show responses to other respondents.
                                    # "shared" = all respondents can see each other's answers.
  claimable: true                   # true = in group requests, one person can claim the work.
```

Defaults are a freeform `Record<string, unknown>`. The keys above are conventions, not a closed set. You can add domain-specific defaults — agents read them and decide how to act.

### Inheritance

```yaml
extends: propose                    # Parent pact name. Single-level only.
```

See [Inheritance](#inheritance-extends) below for full merge semantics.

### Optional Extended Fields

```yaml
attachments:                        # Declares that this pact supports file attachments.
  - slot: design_doc
    required: true
    convention: "PDF or Figma link"
    description: "The design document under review"

registered_for:                     # List of group refs this pact is registered for.
  - "+design-team"                  # Informational — agents use this for routing hints.
```

---

## Inheritance (`extends`)

Variants specialize a global pact for a specific domain. Inheritance is **single-level only** — a variant can extend a global, but a variant cannot extend another variant.

### When to Use Inheritance

Extend a global pact when:

- The domain needs **3+ specialized fields** that wouldn't make sense on the global.
- The response structure is **materially different** (different required fields, different field semantics).
- The variant represents a **distinct coordination pattern** within the parent's family.

Do NOT extend when:

- You're adding 1-2 fields. Just use the global and put extra info in existing fields.
- You're renaming fields. This creates confusing merged schemas where the parent's field definitions are present but not required.
- The variant completely replaces the parent's required fields. At that point you've written a new pact, not a variant.

### Merge Rules

When the pact-loader resolves inheritance, it merges child over parent:

| Field | Merge behavior |
|---|---|
| `name` | Child always wins |
| `version` | Child if set, else parent |
| `description` | Child if non-empty, else parent |
| `when_to_use` | Child if non-empty, else parent |
| `context_bundle.fields` | **Shallow merge** — parent fields + child fields, child wins on conflict |
| `context_bundle.required` | **Child replaces parent entirely** |
| `response_bundle` | Child's if it has any fields or required, else parent's wholesale |
| `defaults` | **Shallow merge** — parent + child, child wins on conflict |
| `scope` | Child if set, else parent |
| `multi_round` | Child if defined, else parent |
| `has_hooks` | OR — true if either has hooks |
| `attachments` | Child if defined, else parent |
| `registered_for` | Child if defined, else parent |

**Critical implication**: Because `context_bundle.fields` are shallow-merged but `context_bundle.required` is replaced wholesale, a variant that requires `[foo, bar]` still inherits the parent's field *definitions* for fields like `question` or `proposal`. Those ghost fields show up in the merged catalog output even though they're not required. This is confusing. Avoid it by keeping your variant's fields as *additions* to the parent, not replacements.

### Inheritance Failures (Silent)

- **Orphan variant**: If the parent pact doesn't exist, the variant is silently excluded from the catalog.
- **Deep inheritance**: If a variant tries to extend another variant (grandchild), it's silently excluded.
- No errors are thrown. The pact-loader never throws on malformed files.

---

## Markdown Body

Everything after the closing `---` of the frontmatter is the Markdown body. It's not parsed by the loader, but it's the most important part of the pact for human and agent readers.

### Required Sections

```markdown
# Pact Title

## Example

**Request:**
\```yaml
context_bundle:
  field: "concrete, realistic value"
\```

**Response:**
\```yaml
response_bundle:
  field: "concrete, realistic value"
\```

## Notes

- Guidance on when to use this vs alternatives.
- Explanation of why defaults are set the way they are.
- Cross-references to related pacts.
```

### Example Quality

Examples are the most impactful part of a pact definition. They teach agents by demonstration.

**Good examples:**
- Use realistic, specific content (real-sounding names, real-sounding technical problems).
- Show all required fields and at least one optional field.
- Demonstrate the *judgment* involved — the response should show reasoning, not just data.

**Bad examples:**
- Placeholder values (`"Lorem ipsum"`, `"TODO"`, `"example value"`).
- Only required fields with no optionals.
- Responses that are mechanical / don't demonstrate judgment.

For `multi_round: true` pacts, show at least one round of iteration (Round 1 request + response).

### Notes Section

Use Notes to:
- Explain **why** defaults are set a certain way (e.g., "visibility: private prevents anchoring bias").
- Point to **alternative pacts** for adjacent use cases ("If you need X, use Y instead").
- Clarify **coordination conventions** that agents should follow ("The first to respond with accepted: true takes ownership").

---

## Design Principles

### 1. Pacts Are Coordination Patterns, Not Workflows

A pact defines a *shape of interaction* — the structure of a request and the structure of a response. It does not define a workflow, process, or sequence of steps.

**Good**: `handoff` — "Here is work context, do you accept?"
**Bad**: `deploy` — "Run this Helm command and return the revision number."

### 2. Both Sides Exercise Judgment

In a well-designed pact, the sender decides *what to ask* and the responder decides *how to answer*. If the responder is just executing instructions mechanically, the pact is a command interface, not a coordination pattern.

**Good**: `review` — Reviewer decides what's blocking vs. advisory.
**Bad**: `query:database` — Responder just runs a query and returns rows.

### 3. Async-Native

PACT is git-backed. Requests are committed and pushed. Responses come later. Design pacts for interactions where latency is acceptable — hours or days, not seconds.

**Good**: `decide` — Gather independent opinions over a day.
**Bad**: `alert` — Fire engine needs to arrive in seconds, not after a git push.

### 4. Fields Should Earn Their Place

Every field in a bundle should:
- Carry information that the other side needs to exercise judgment.
- Not be derivable from other fields.
- Not be so specific that it only applies to one tool or platform.

If a field is a URL to a specific vendor's dashboard, it belongs in the `background` or `context` string, not as a top-level typed field. Keep the schema portable.

### 5. Scope Means Audience, Not Permission

`scope` is a discovery filter. `pact_discover(scope: "ttrpg")` returns only TTRPG pacts. It does not restrict who can use the pact. Any agent can send any pact to anyone.

Use scope to organize pacts into coherent sets that a team or context would browse together. Don't use it as access control (PACT has none).

---

## Anti-Patterns

| Anti-pattern | Why it's wrong | What to do instead |
|---|---|---|
| **Command interface** | Response is execution output, not judgment | Use an API/tool call directly |
| **Synchronous query** | Expects immediate answer, not async coordination | Use the tool that has the data |
| **Thin wrapper** | Variant adds 1 field over the global | Use the global pact; put extra info in existing fields |
| **Field replacement** | Variant replaces all parent required fields | Write a new global pact, don't abuse extends |
| **Vendor lock-in** | Fields reference specific tools (Helm, Zendesk, Jira) | Use generic field names; put tool-specific details in string fields |
| **Kitchen sink** | 10+ fields in context_bundle | Split into multiple pacts or reduce to essential judgment inputs |

---

## Checklist: Before Shipping a Pact

1. **Coordination, not command.** Does the response require judgment?
2. **Async-compatible.** Is it OK if the response comes hours later?
3. **Fields earn their place.** Every field carries non-derivable judgment input.
4. **Example is realistic.** Would a real human/agent send this?
5. **Notes explain the "why."** Defaults have rationale. Alternatives are cross-referenced.
6. **Scope is correct.** Global pacts use `scope: global`. Variants use their subdirectory name.
7. **Inheritance is additive.** Variants add fields; they don't replace the parent's core fields.
8. **Name matches filename.** `name: check-in:turn` lives in `check-in:turn.md`.
