# Journey: Skill Discovery -- Visual Map

## Actors
- **Cory** -- Developer composing a request, does not know which skill to use
- **Maria Santos** -- New team member onboarding, has never seen the skill catalog
- **Dan** -- Receiver checking inbox, needs to understand response expectations

## Emotional Arc
```
Cory:  Intent ────> Uncertain ────> Oriented ─────> Confident ────> Relieved
       (wants to     (which skill    (found it,       (fields are     (request
        ask for       fits this?)     it fits)          clear)          sent)
        help)
                          |
                     KEY TRANSITION:
                     From "I don't know what types exist"
                     to "I can see them all and pick the right one"
```

## Flow A: Sender Discovers Skills Before Composing

```
 CORY'S AGENT SESSION                          GARP REPO
 ======================                         =========

 [1] Cory wants to ask for help
     "Can someone review my auth changes?"
     |
     | Emotion: Intent -- "I need help but I'm
     | not sure what kind of request to send"
     v
 [2] Agent queries available skills
     Agent calls garp_skills
     (no query -- lists all)
     |                                    ────>  skills/
     v                                           +-- ask/SKILL.md
 [3] Agent receives skill catalog                +-- code-review/SKILL.md
     +----------------------------------------------+
     |  AVAILABLE REQUEST TYPES                      |
     +----------------------------------------------+
     |                                                |
     |  ask                                           |
     |    General question needing another             |
     |    person's perspective                         |
     |    Fields: question, background, options        |
     |                                                |
     |  code-review                                   |
     |    Request a code review on a branch            |
     |    or changeset                                 |
     |    Fields: repository, branch, description,     |
     |            areas_of_concern                     |
     |                                                |
     |  sanity-check                                  |
     |    Validate findings on a bug investigation     |
     |    Fields: customer, product, involved_files,   |
     |            investigation_so_far, question       |
     |                                                |
     |  design-skill                                  |
     |    Collaboratively design a new skill contract  |
     |    Fields: skill_name, proposal, examples       |
     |                                                |
     +----------------------------------------------+
     |
     | Emotion: Oriented -- "code-review is exactly
     | what I need"
     v
 [4] Agent selects skill, loads full contract
     Agent reads skills/code-review/SKILL.md
     (or schema.json if available)
     |
     | Now agent knows all required and optional
     | fields for context_bundle
     v
 [5] Agent assembles context bundle
     - repository: platform-auth
     - branch: feature/oauth-refresh-fix
     - description: "Fixed GC leak in refresh token cycle"
     - areas_of_concern: "async cleanup in finally block"
     |
     | Emotion: Confident -- "The skill told
     | my agent exactly what to gather"
     v
 [6] Agent composes and presents request
     (Same Plan submission pattern as today)
     |
     v
 [7] garp_request submitted                  ────>  requests/pending/
     |                                                req-{id}.json
     | Emotion: Relieved -- structured, complete
     v
```

## Flow B: Sender Searches by Intent

```
 MARIA'S AGENT SESSION                         GARP REPO
 =======================                        =========

 [1] Maria is new to the team
     "I need someone to look over my code changes"
     |
     | Emotion: Uncertain -- "I don't know what
     | request types this team has"
     v
 [2] Agent searches by intent
     Agent calls garp_skills with
     query: "review code changes"
     |                                    ────>  skills/
     v                                           (keyword match against
 [3] Filtered results returned                    names + descriptions)
     +----------------------------------------------+
     |  MATCHING REQUEST TYPES                       |
     +----------------------------------------------+
     |                                                |
     |  code-review  (best match)                     |
     |    Request a code review on a branch            |
     |    or changeset                                 |
     |    Fields: repository, branch, description,     |
     |            areas_of_concern                     |
     |                                                |
     +----------------------------------------------+
     |
     | Emotion: Oriented -- "There's a type
     | for exactly this"
     v
 [4] Agent proceeds to compose request
     (Same as Flow A, steps 4-7)
```

## Flow C: Receiver Sees Skill Summary in Inbox

```
 DAN'S AGENT SESSION                           GARP REPO
 ====================                           =========

 [1] Dan checks inbox (session start)
     Agent calls garp_inbox
     |                                    <────  requests/pending/
     v                                           req-{id}.json
 [2] Inbox returns enriched entries
     +----------------------------------------------+
     |  INBOX -- 2 pending requests                  |
     +----------------------------------------------+
     |                                                |
     |  1. [code-review] from Cory           2h ago  |
     |     "Review OAuth refresh fix"                 |
     |     Response expects: status, summary,         |
     |       blocking_feedback, advisory_feedback     |
     |                                                |
     |  2. [sanity-check] from Maria        30m ago  |
     |     "Does staging memory match known JVM       |
     |      warmup behavior?"                         |
     |     Response expects: answer, evidence,        |
     |       recommendation                           |
     |                                                |
     +----------------------------------------------+
     |
     | Emotion: Oriented -- Dan can see what
     | each request expects without reading
     | the full SKILL.md
     v
 [3] Dan picks request 2 (simpler)
     Agent loads sanity-check skill for
     full contract details
     |
     v
 [4] Dan investigates and responds
     (Same receiver journey as today)
```

## Flow D: schema.json Guides Payload Composition

```
 CORY'S AGENT SESSION                          GARP REPO
 ======================                         =========

 [1] Agent composes a sanity-check request
     Agent loads skills/sanity-check/schema.json
     |                                    ────>  skills/sanity-check/
     v                                           +-- SKILL.md
 [2] Agent reads typed contract                  +-- schema.json
     {
       "context_bundle": {
         "required": ["customer", "product",
           "issue_summary", "involved_files",
           "investigation_so_far", "question"],
         "properties": {
           "customer": { "type": "string" },
           "product": { "type": "string" },
           ...
           "zendesk_ticket": { "type": "string" }
         },
         "additionalProperties": true
       }
     }
     |
     | Agent knows EXACTLY what fields are required
     | vs optional. No markdown interpretation needed.
     v
 [3] Agent validates context bundle before sending
     - customer: "Acme Corp"          [required, present]
     - product: "Platform v3.2"       [required, present]
     - issue_summary: "..."           [required, present]
     - involved_files: [...]          [required, present]
     - investigation_so_far: "..."    [required, present]
     - question: "..."                [required, present]
     - zendesk_ticket: "ZD-4521"      [optional, present]
     |
     | All required fields present. Validation passes.
     v
 [4] Request submitted with confidence
     that the payload is well-formed
```

## Step Detail

| # | Flow | Action | Tool | Emotion | Shared Artifacts |
|---|------|--------|------|---------|-----------------|
| A1 | Sender | Wants to send a request, unsure of type | - | Intent/uncertain | - |
| A2 | Sender | Queries available skills | garp_skills | - | - |
| A3 | Sender | Receives skill catalog with names, descriptions, fields | garp_skills result | Oriented | Skill catalog listing |
| A4 | Sender | Agent loads full skill contract | filesystem (SKILL.md or schema.json) | - | Skill contract |
| A5 | Sender | Agent assembles context bundle | Agent session | Confident | context_bundle (draft) |
| A6 | Sender | Reviews composed request | Plan submission | Confident | Request (draft) |
| A7 | Sender | Submits request | garp_request | Relieved | requests/pending/req-{id}.json |
| B2 | Search | Searches skills by intent | garp_skills (with query) | - | - |
| B3 | Search | Receives filtered results | garp_skills result | Oriented | Filtered skill listing |
| C1 | Receiver | Checks inbox | garp_inbox | - | - |
| C2 | Receiver | Sees enriched inbox with skill summaries | garp_inbox result | Oriented | Inbox entries with response_fields |
| D1 | Schema | Agent loads typed schema | filesystem (schema.json) | - | schema.json |
| D2 | Schema | Agent validates payload against schema | Agent logic | Confident | Validated context_bundle |

## Key Design Decisions

### garp_skills is Additive, Not Replacing
garp_skills is a NEW tool alongside the existing 7. It does not modify any existing tool.
Agents that already know what skill to use can skip garp_skills entirely. The discovery
step is optional -- it provides a path for agents that do NOT have startup knowledge.

### schema.json is Optional, Not Required
Skills work without schema.json (same as today). When schema.json exists, it provides
machine-readable type information. When it does not, the agent reads SKILL.md as before.
No existing skill is broken by this convention.

### additionalProperties: true Preserves Flexibility
The user explicitly values "open-ended flexibility." schema.json defines required fields
(minimum contract) but allows additional fields (creative extension). This matches GARP's
existing rigid-envelope-flexible-payload philosophy.

### Skill Summary in Inbox is Metadata, Not Full Contract
Inbox entries get skill_description and response_fields -- enough for the receiver to
understand what is expected at a glance. The full SKILL.md or schema.json is still
available for deep reference. This is progressive disclosure: summary first, details
on demand.

### Validation is WARN, Not REJECT
When schema.json exists and garp_request validates the context_bundle, missing required
fields produce a WARNING in the response, not a rejection. The request still goes through.
This preserves the "dumb router" philosophy -- the protocol does not block messages,
it annotates them.
