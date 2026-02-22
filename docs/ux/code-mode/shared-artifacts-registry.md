# Shared Artifact Registry -- PACT Code Mode (Phase A)

## Purpose

Tracks every piece of data that flows between steps across the pact discovery
journey. Every field in journey schemas and every value in TUI mockups has a
documented source here.

---

## Artifact Index

### A1: Pact Catalog (pact_pacts result)

| Property | Value |
|----------|-------|
| **Type** | JSON (pact_pacts tool response) |
| **Created by** | pact_pacts tool, reading pacts/ directory |
| **Consumed by** | Agent (pact selection), sender flow |
| **Lifecycle** | Ephemeral -- fresh on every pact_pacts call |
| **Source data** | PACT.md files + schema.json files (when present) |

**Schema**:
```json
{
  "pacts": [
    {
      "name": "sanity-check",
      "description": "Validate findings on a bug investigation",
      "when_to_use": "You are investigating a bug and found something suspicious",
      "context_fields": ["customer", "product", "issue_summary", "involved_files", "investigation_so_far", "question"],
      "response_fields": ["answer", "evidence", "concerns", "recommendation"],
      "pact_path": "/path/to/pacts/sanity-check/PACT.md"
    }
  ]
}
```

**Fields used by**:
- `name` -- Agent matches against user intent; used as request_type in pact_request
- `description` -- Agent displays to user; used for keyword matching in search
- `when_to_use` -- Agent matches against user intent; used for keyword matching in search
- `context_fields` -- Agent knows what to gather before reading full PACT.md
- `response_fields` -- Agent knows what response structure looks like; reused in inbox enrichment
- `pact_path` -- Agent can read full PACT.md for detailed guidance

**Field sources**:
- `name` -- Directory name under pacts/
- `description` -- First paragraph of PACT.md (after H1 heading)
- `when_to_use` -- Content of "When To Use" section in PACT.md
- `context_fields` -- Field column of "Context Bundle Fields" table in PACT.md, or `context_bundle.properties` keys from schema.json
- `response_fields` -- Field column of "Response Structure" table in PACT.md, or `response_bundle.properties` keys from schema.json
- `pact_path` -- Constructed from repoPath + pacts/ + name + /PACT.md

---

### A2: Pact Schema (schema.json)

| Property | Value |
|----------|-------|
| **Type** | JSON Schema file |
| **File** | `pacts/{type}/schema.json` |
| **Created by** | Pact author (manual, or future: generated from PACT.md) |
| **Consumed by** | pact_pacts (field extraction), pact_request (validation), pact_respond (validation), pact_inbox (response_fields enrichment) |
| **Lifecycle** | Versioned in git. Updated when pact changes. |
| **Optional** | Yes -- pacts work without it. When absent, PACT.md is parsed instead. |

**Schema**:
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "pact_name": "sanity-check",
  "pact_version": "1.0.0",
  "context_bundle": {
    "type": "object",
    "required": ["customer", "product", "issue_summary", "involved_files", "investigation_so_far", "question"],
    "properties": {
      "customer": { "type": "string", "description": "Customer name" },
      "product": { "type": "string", "description": "Product name and version" },
      "issue_summary": { "type": "string", "description": "Brief description of the issue" },
      "involved_files": { "type": "array", "items": { "type": "string" }, "description": "Files examined" },
      "investigation_so_far": { "type": "string", "description": "What you have found" },
      "question": { "type": "string", "description": "Specific question for the reviewer" },
      "zendesk_ticket": { "type": "string", "description": "Related Zendesk ticket ID" }
    },
    "additionalProperties": true
  },
  "response_bundle": {
    "type": "object",
    "required": ["answer", "evidence", "recommendation"],
    "properties": {
      "answer": { "type": "string", "description": "YES / NO / PARTIALLY" },
      "evidence": { "type": "string", "description": "What you compared or examined" },
      "concerns": { "type": "string", "description": "Risks or caveats" },
      "recommendation": { "type": "string", "description": "Suggested next step" }
    },
    "additionalProperties": true
  }
}
```

**Critical design decision**: `additionalProperties: true` on both context_bundle and response_bundle. Required fields enforce minimum contract; additional fields allow creative extension.

**Fields used by**:
- `pact_name` -- Display, validation
- `pact_version` -- Future: contract evolution tracking
- `context_bundle.required` -- pact_request validation (warn on missing)
- `context_bundle.properties` -- pact_pacts field extraction (preferred over PACT.md parsing)
- `response_bundle.required` -- pact_respond validation (warn on missing, future)
- `response_bundle.properties` -- pact_inbox enrichment (response_fields), pact_pacts field extraction

---

### A3: Enriched Inbox Entry (pact_inbox response, modified)

| Property | Value |
|----------|-------|
| **Type** | JSON (pact_inbox tool response, modified) |
| **Created by** | pact_inbox tool, enriched with pact metadata |
| **Consumed by** | Receiver agent (response composition guidance) |
| **Lifecycle** | Ephemeral -- fresh on every pact_inbox call |
| **Backward compatible** | Yes -- new fields are additive |

**New fields** (added to existing InboxEntry):
```json
{
  "pact_description": "Validate findings on a bug investigation",
  "response_fields": ["answer", "evidence", "concerns", "recommendation"]
}
```

**Field sources**:
- `pact_description` -- From pact_pacts parsing logic (first paragraph of PACT.md or description from schema.json)
- `response_fields` -- From schema.json `response_bundle.properties` keys, or from PACT.md "Response Structure" table Field column

---

### A4: Validation Warnings (pact_request response, modified)

| Property | Value |
|----------|-------|
| **Type** | JSON (pact_request tool response, modified) |
| **Created by** | pact_request tool, when schema.json exists and fields are missing |
| **Consumed by** | Sender agent (display to user) |
| **Lifecycle** | Ephemeral -- part of the pact_request response |
| **Backward compatible** | Yes -- new field is additive, absent when no schema exists |

**New field** (added to existing pact_request response):
```json
{
  "request_id": "req-20260222-143022-cory-a1b2",
  "thread_id": "req-20260222-143022-cory-a1b2",
  "status": "pending",
  "message": "Request submitted",
  "validation_warnings": [
    "Missing required field 'customer' (schema: sanity-check v1.0.0)",
    "Missing required field 'product' (schema: sanity-check v1.0.0)"
  ]
}
```

**Field source**:
- `validation_warnings` -- Generated by comparing context_bundle keys against schema.json `context_bundle.required` array. Only present when schema.json exists AND required fields are missing.

---

## Cross-Flow Data Flow

```
PACT AUTHOR              pact_pacts              SENDER AGENT
============              ===========              ============

PACT.md ──────────────> Parses title,          Calls pact_pacts ──> Gets catalog
                         when_to_use,                |
schema.json ───────────> fields from              Selects pact
(optional)               schema or tables            |
                              |                   Loads PACT.md
                              |                   or schema.json
                              |                      |
                              |                   Assembles bundle
                              |                      |
                              +──── inbox ───>    pact_request ──> Validates against
                              |   enrichment                       schema.json (warn)
                              |                      |
                              v                   Submits with warnings
                         pact_inbox                  (if any)
                         adds:
                         - pact_description
                         - response_fields

                         RECEIVER AGENT
                         ==============
                         Sees enriched inbox ──> Knows response expectations
                                                 without reading PACT.md
```

## Integration Checkpoints

| Checkpoint | What Must Match | How Validated |
|------------|----------------|---------------|
| Pact name consistency | pact_pacts `name` == pact_request `request_type` == directory name in pacts/ | pact_request already validates pact directory exists |
| Field extraction parity | Fields from schema.json properties == fields from PACT.md tables | Manual review during schema.json authoring; future: lint tool |
| Inbox enrichment source | response_fields in inbox entries == response_bundle properties from schema.json or PACT.md | Uses same parsing logic as pact_pacts |
| Validation warnings accuracy | Missing fields reported by pact_request match schema.json required array | Unit tests with known schemas and incomplete bundles |
