# Shared Artifact Registry -- GARP Code Mode (Phase A)

## Purpose

Tracks every piece of data that flows between steps across the skill discovery
journey. Every field in journey schemas and every value in TUI mockups has a
documented source here.

---

## Artifact Index

### A1: Skill Catalog (garp_skills result)

| Property | Value |
|----------|-------|
| **Type** | JSON (garp_skills tool response) |
| **Created by** | garp_skills tool, reading skills/ directory |
| **Consumed by** | Agent (skill selection), sender flow |
| **Lifecycle** | Ephemeral -- fresh on every garp_skills call |
| **Source data** | SKILL.md files + schema.json files (when present) |

**Schema**:
```json
{
  "skills": [
    {
      "name": "sanity-check",
      "description": "Validate findings on a bug investigation",
      "when_to_use": "You are investigating a bug and found something suspicious",
      "context_fields": ["customer", "product", "issue_summary", "involved_files", "investigation_so_far", "question"],
      "response_fields": ["answer", "evidence", "concerns", "recommendation"],
      "skill_path": "/path/to/skills/sanity-check/SKILL.md"
    }
  ]
}
```

**Fields used by**:
- `name` -- Agent matches against user intent; used as request_type in garp_request
- `description` -- Agent displays to user; used for keyword matching in search
- `when_to_use` -- Agent matches against user intent; used for keyword matching in search
- `context_fields` -- Agent knows what to gather before reading full SKILL.md
- `response_fields` -- Agent knows what response structure looks like; reused in inbox enrichment
- `skill_path` -- Agent can read full SKILL.md for detailed guidance

**Field sources**:
- `name` -- Directory name under skills/
- `description` -- First paragraph of SKILL.md (after H1 heading)
- `when_to_use` -- Content of "When To Use" section in SKILL.md
- `context_fields` -- Field column of "Context Bundle Fields" table in SKILL.md, or `context_bundle.properties` keys from schema.json
- `response_fields` -- Field column of "Response Structure" table in SKILL.md, or `response_bundle.properties` keys from schema.json
- `skill_path` -- Constructed from repoPath + skills/ + name + /SKILL.md

---

### A2: Skill Schema (schema.json)

| Property | Value |
|----------|-------|
| **Type** | JSON Schema file |
| **File** | `skills/{type}/schema.json` |
| **Created by** | Skill author (manual, or future: generated from SKILL.md) |
| **Consumed by** | garp_skills (field extraction), garp_request (validation), garp_respond (validation), garp_inbox (response_fields enrichment) |
| **Lifecycle** | Versioned in git. Updated when skill contract changes. |
| **Optional** | Yes -- skills work without it. When absent, SKILL.md is parsed instead. |

**Schema**:
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "skill_name": "sanity-check",
  "skill_version": "1.0.0",
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
- `skill_name` -- Display, validation
- `skill_version` -- Future: contract evolution tracking
- `context_bundle.required` -- garp_request validation (warn on missing)
- `context_bundle.properties` -- garp_skills field extraction (preferred over SKILL.md parsing)
- `response_bundle.required` -- garp_respond validation (warn on missing, future)
- `response_bundle.properties` -- garp_inbox enrichment (response_fields), garp_skills field extraction

---

### A3: Enriched Inbox Entry (garp_inbox response, modified)

| Property | Value |
|----------|-------|
| **Type** | JSON (garp_inbox tool response, modified) |
| **Created by** | garp_inbox tool, enriched with skill metadata |
| **Consumed by** | Receiver agent (response composition guidance) |
| **Lifecycle** | Ephemeral -- fresh on every garp_inbox call |
| **Backward compatible** | Yes -- new fields are additive |

**New fields** (added to existing InboxEntry):
```json
{
  "skill_description": "Validate findings on a bug investigation",
  "response_fields": ["answer", "evidence", "concerns", "recommendation"]
}
```

**Field sources**:
- `skill_description` -- From garp_skills parsing logic (first paragraph of SKILL.md or description from schema.json)
- `response_fields` -- From schema.json `response_bundle.properties` keys, or from SKILL.md "Response Structure" table Field column

---

### A4: Validation Warnings (garp_request response, modified)

| Property | Value |
|----------|-------|
| **Type** | JSON (garp_request tool response, modified) |
| **Created by** | garp_request tool, when schema.json exists and fields are missing |
| **Consumed by** | Sender agent (display to user) |
| **Lifecycle** | Ephemeral -- part of the garp_request response |
| **Backward compatible** | Yes -- new field is additive, absent when no schema exists |

**New field** (added to existing garp_request response):
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
SKILL AUTHOR              garp_skills              SENDER AGENT
============              ===========              ============

SKILL.md ──────────────> Parses title,          Calls garp_skills ──> Gets catalog
                         when_to_use,                |
schema.json ───────────> fields from              Selects skill
(optional)               schema or tables            |
                              |                   Loads SKILL.md
                              |                   or schema.json
                              |                      |
                              |                   Assembles bundle
                              |                      |
                              +──── inbox ───>    garp_request ──> Validates against
                              |   enrichment                       schema.json (warn)
                              |                      |
                              v                   Submits with warnings
                         garp_inbox                  (if any)
                         adds:
                         - skill_description
                         - response_fields

                         RECEIVER AGENT
                         ==============
                         Sees enriched inbox ──> Knows response expectations
                                                 without reading SKILL.md
```

## Integration Checkpoints

| Checkpoint | What Must Match | How Validated |
|------------|----------------|---------------|
| Skill name consistency | garp_skills `name` == garp_request `request_type` == directory name in skills/ | garp_request already validates skill directory exists |
| Field extraction parity | Fields from schema.json properties == fields from SKILL.md tables | Manual review during schema.json authoring; future: lint tool |
| Inbox enrichment source | response_fields in inbox entries == response_bundle properties from schema.json or SKILL.md | Uses same parsing logic as garp_skills |
| Validation warnings accuracy | Missing fields reported by garp_request match schema.json required array | Unit tests with known schemas and incomplete bundles |
