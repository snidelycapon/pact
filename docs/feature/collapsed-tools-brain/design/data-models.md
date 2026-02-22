# Data Models: Collapsed Tools + Declarative Brain

**Feature**: collapsed-tools-brain
**Date**: 2026-02-22
**Author**: Morgan (nw-solution-architect)

---

## 1. Unified PACT.md Format

### Structure

A PACT.md file consists of YAML frontmatter (between `---` delimiters) followed by a markdown body.

```
---
<YAML frontmatter: machine-parseable metadata>
---

<Markdown body: human-readable documentation>
```

### YAML Frontmatter Schema

```yaml
# --- Required fields ---
name: string                    # Pact identifier, matches directory name (e.g., "ask", "code-review")
version: string                 # Semantic version (e.g., "1.0.0")
description: string             # One-line description for discovery catalogs

# --- Context Bundle Schema ---
context_bundle:
  required: string[]            # Field names that must be present (WARN not REJECT)
  fields:                       # Field definitions
    <field_name>:
      type: string              # JSON Schema type: string, number, boolean, array, object
      description: string       # Human-readable field description
      enum: string[]            # Optional: allowed values
      default: any              # Optional: default value
      items:                    # Optional: for array types
        type: string
  additionalProperties: true    # Always true -- creative extension allowed

# --- Response Bundle Schema ---
response_bundle:
  required: string[]            # Field names expected in response
  fields:
    <field_name>:
      type: string
      description: string
      enum: string[]            # Optional
      items:                    # Optional: for array types
        type: string
  additionalProperties: true    # Always true

# --- Optional fields ---
when_to_use: string | string[]  # When to reach for this pact (for discovery filtering)

attachments:                    # Optional: expected attachments
  - name: string                # Attachment identifier
    recommended: boolean        # Whether this attachment is recommended
    filename_convention: string # Suggested filename pattern
    description: string         # What this attachment is for

# --- Brain Processing (Optional) ---
hooks:
  validation:                   # Optional: validation rules
    - when:
        <field_path>:
          <operator>: <value>
      then:
        warn: string            # Warning message template
    - require:                  # Shorthand: check field presence
        fields: string[]
        message: string         # Warning message if missing

  enrichment:                   # Optional: enrichment rules
    - when:
        <field_path>:
          <operator>: <value>
      then:
        set:
          <field_path>: <value_or_template>

  routing:                      # Optional: routing rules
    - when:
        <field_path>:
          <operator>: <value>
      then:
        reassign: string        # New recipient user_id
        # OR
        cc: string[]            # Additional notification recipients

  auto_response:                # Optional: auto-response rules
    enabled: boolean
    conditions:                 # All conditions must match (AND)
      <field_path>:
        <operator>: <value>
    template:                   # Response bundle template
      <field_name>: <value_or_template>
```

### Example: "ask" Pact in New Format

```yaml
---
name: ask
version: "1.0.0"
description: "A general-purpose request for when you need input, an opinion, or an answer from a teammate."

when_to_use:
  - "You have a question that needs another person's perspective"
  - "You want to get a gut check, recommendation, or decision"
  - "The question doesn't fit a more structured pact type"

context_bundle:
  required:
    - question
  fields:
    question:
      type: string
      description: "The question you're asking -- be specific"
    background:
      type: string
      description: "Relevant context the recipient needs to answer well"
    options:
      type: array
      items:
        type: string
      description: "If you've identified possible answers, list them here"
    urgency:
      type: string
      enum: ["low", "normal", "high"]
      default: "normal"
      description: "low, normal, or high -- defaults to normal"
  additionalProperties: true

response_bundle:
  required:
    - answer
  fields:
    answer:
      type: string
      description: "Direct answer to the question"
    reasoning:
      type: string
      description: "Why this answer, briefly"
    caveats:
      type: string
      description: "Anything the sender should keep in mind"
  additionalProperties: true
---

# Ask a Question

A general-purpose request for when you need input, an opinion, or an answer from a teammate. Use this when no more specific pact type fits.

## When To Use

- You have a question that needs another person's perspective
- You want to get a gut check, recommendation, or decision from someone
- The question doesn't fit a more structured pact type

## Tips

- Be specific in your question -- vague questions get vague answers
- Include background context so the recipient doesn't have to ask clarifying questions
- If you've already considered options, list them to save the recipient time
```

### Example: "ask" Pact with Brain Processing

```yaml
---
name: ask
version: "1.1.0"
description: "A general-purpose request for when you need input, an opinion, or an answer."

context_bundle:
  required: [question]
  fields:
    question:
      type: string
      description: "The question you're asking"
    urgency:
      type: string
      enum: ["low", "normal", "high"]
      default: "normal"
  additionalProperties: true

response_bundle:
  required: [answer]
  fields:
    answer:
      type: string
      description: "Direct answer to the question"
  additionalProperties: true

hooks:
  validation:
    - when:
        context_bundle.question:
          equals: ""
      then:
        warn: "Question field is empty -- recipient will not know what to answer"

  enrichment:
    - when:
        context_bundle.urgency:
          equals: "high"
      then:
        set:
          context_bundle.priority_flag: true
          context_bundle.sla_hours: 4

  auto_response:
    enabled: true
    conditions:
      context_bundle.urgency:
        equals: "low"
      context_bundle.question:
        contains: "what time"
    template:
      answer: "Please check the team calendar for scheduling questions."
      reasoning: "Auto-responded: low-urgency scheduling question"
---
```

---

## 2. pact_discover Response Schema

### Input Schema

```yaml
pact_discover:
  parameters:
    query:
      type: string
      required: false
      description: "Optional keyword to filter pacts by name, description, or when_to_use"
```

### Output Schema

```yaml
DiscoverResponse:
  pacts:                       # Array of pact summaries
    - name: string              # Pact directory name
      description: string       # One-line description
      when_to_use: string[]     # Usage guidance lines
      context_bundle:
        required: string[]      # Required field names
        fields:                 # Map of field name to type + description
          <name>:
            type: string
            description: string
      response_bundle:
        required: string[]
        fields:
          <name>:
            type: string
            description: string
      has_hooks: boolean        # Whether hooks section is present

  team:                         # Array of team members
    - user_id: string
      display_name: string

  warning: string               # Optional: "Using local data" if git pull fails
```

### Design Notes

- The `pacts` array returns enough information for an agent to compose a `pact_do` action without reading the PACT.md file directly.
- Field definitions include type and description but not enum values, defaults, or items -- those are available in the full PACT.md but are not needed for request composition.
- `has_hooks` is a boolean indicator, not the full hooks rules. Agents do not need to know brain rules; the brain executes them server-side.
- `team` is always included so the agent knows valid recipient values.
- The response shape is flat (no pagination, no cursor) because the expected scale is <100 pacts and <20 team members.

---

## 3. pact_do Action Dispatch Schema

### Input Schema

```yaml
pact_do:
  parameters:
    action:
      type: string
      required: true
      enum: [send, respond, cancel, amend, check_status, inbox, view_thread]
      description: "The operation to perform"

    # --- Action-specific parameters (all optional at top level) ---
    # The dispatcher validates required params per action

    request_type:
      type: string
      description: "Pact type for send action"

    recipient:
      type: string
      description: "Recipient user_id for send action"

    context_bundle:
      type: object
      description: "Request payload for send action"

    request_id:
      type: string
      description: "Target request ID for respond, cancel, amend, check_status"

    response_bundle:
      type: object
      description: "Response payload for respond action"

    thread_id:
      type: string
      description: "Thread ID for send (optional) or view_thread (required)"

    deadline:
      type: string
      description: "ISO 8601 deadline for send action (optional)"

    attachments:
      type: array
      description: "File attachments for send action (optional)"

    fields:
      type: object
      description: "Amendment fields for amend action"

    note:
      type: string
      description: "Amendment note for amend action (optional)"

    reason:
      type: string
      description: "Cancellation reason for cancel action (optional)"
```

### Action-to-Handler Mapping

| Action | Handler | Required Params | Optional Params |
|--------|---------|----------------|----------------|
| `send` | `handlePactRequest` | `request_type`, `recipient`, `context_bundle` | `deadline`, `thread_id`, `attachments` |
| `respond` | `handlePactRespond` | `request_id`, `response_bundle` | -- |
| `cancel` | `handlePactCancel` | `request_id` | `reason` |
| `amend` | `handlePactAmend` | `request_id`, `fields` | `note` |
| `check_status` | `handlePactStatus` | `request_id` | -- |
| `inbox` | `handlePactInbox` | -- | -- |
| `view_thread` | `handlePactThread` | `thread_id` | -- |

### Output Schema

The output of `pact_do` is the output of the dispatched handler, unchanged. Each handler's return type is preserved as-is:

| Action | Return Shape |
|--------|-------------|
| `send` | `{ request_id, thread_id, status, message, validation_warnings? }` |
| `respond` | `{ status, request_id, message }` |
| `cancel` | `{ status, request_id, message }` |
| `amend` | `{ status, request_id, amendment_count, message }` |
| `check_status` | `{ status, request, response?, attachment_paths?, warning? }` |
| `inbox` | `{ requests: (InboxEntry | InboxThreadGroup)[], warning? }` |
| `view_thread` | `{ thread_id, summary, entries, message?, warning? }` |

### Error Handling

- Unknown action: `"Unknown action 'foo'. Valid actions: send, respond, cancel, amend, check_status, inbox, view_thread"`
- Missing required params: Delegated to handler (existing error messages preserved)
- Handler errors: Propagated through MCP error formatting (existing `formatError` pattern)

---

## 4. Brain Processing Rule Schemas

### Condition Schema

```yaml
Condition:                      # A single field match
  <field_path>:                 # Dot-notation path into request envelope
    <operator>: <value>         # Operator + expected value

# Operators:
#   equals: exact match (string, number, boolean)
#   contains: substring match (string only)
#   in: value is member of list
#   exists: field is present (boolean: true/false)
#   gt: greater than (number or ISO date string)
#   lt: less than (number or ISO date string)

# Field paths:
#   Top-level: "status", "request_type", "sender.user_id"
#   Context bundle: "context_bundle.urgency", "context_bundle.severity"
#   Nested: "sender.display_name"
```

### Validation Rule Schema

```yaml
ValidationRule:
  # Form 1: Conditional warning
  - when:                       # Conditions (AND-joined)
      <field_path>:
        <operator>: <value>
    then:
      warn: string              # Warning message (supports {{field_path}} substitution)

  # Form 2: Field presence check (shorthand)
  - require:
      fields: string[]          # Field paths that must exist
      message: string           # Warning message template
```

**Evaluation**: All matching validation rules fire (not first-match). Warnings accumulate.

### Enrichment Rule Schema

```yaml
EnrichmentRule:
  - when:
      <field_path>:
        <operator>: <value>
    then:
      set:                      # Fields to add/update via amendment
        <field_path>: <value>   # Static value or {{template}} substitution
```

**Evaluation**: All matching enrichment rules fire. Sets are applied as a single amendment entry.

### Routing Rule Schema

```yaml
RoutingRule:
  - when:
      <field_path>:
        <operator>: <value>
    then:
      reassign: string          # New recipient user_id
      # OR
      cc: string[]              # Additional notification targets
```

**Evaluation**: First matching routing rule wins. If no rules match, routing is unchanged.

### Auto-Response Rule Schema

```yaml
AutoResponseRule:
  enabled: boolean              # Master switch
  conditions:                   # All must match (AND-joined)
    <field_path>:
      <operator>: <value>
  template:                     # Response bundle to generate
    <field_name>: <value>       # Static value or {{field_path}} substitution
```

**Evaluation**: If enabled and all conditions match, the brain generates a response using the template. The request is moved to completed. Only one auto-response rule per pact (it is a single object, not an array).

---

## 5. Preserved Data Models (No Changes)

The following schemas and structures are unchanged by this feature:

### RequestEnvelope (Zod schema in schemas.ts)

```
request_id, thread_id?, request_type, sender, recipient,
status, created_at, deadline?, context_bundle, expected_response?,
attachments?, amendments?, cancel_reason?
```

### ResponseEnvelope (Zod schema in schemas.ts)

```
request_id, responder, responded_at, response_bundle
```

### AmendmentEntry (Zod schema in schemas.ts)

```
amended_at, amended_by, fields, note?
```

### TeamConfig (Zod schema in schemas.ts)

```
team_name, version, members: [{ user_id, display_name }]
```

### Directory Structure

```
requests/pending/     -- active requests awaiting response
requests/completed/   -- responded requests
requests/cancelled/   -- cancelled requests
responses/            -- response envelopes
attachments/{id}/     -- attachment files
pacts/               -- pacts (PACT.md per directory)
config.json           -- team configuration
```

Note: `pacts/` replaces `examples/pacts/` as the canonical location. The `examples/` prefix is dropped because pacts are now functional artifacts, not documentation.
