# ADR-002: Single SKILL.md Per Request Type

## Status: Accepted

## Context

Request types in the GARP are defined by skill contracts that tell agents how to compose requests (sender side) and how to handle/respond to them (receiver side). The discovery documents originally proposed paired files (`sender.md` + `receiver.md` per request type). During UX journey design, the user explicitly corrected this to a single file.

## Decision

One `SKILL.md` file per request type, stored at `skills/{request-type}/SKILL.md` in the GARP repo. The file contains sections for both sender behavior ("Composing a Request") and receiver behavior ("Handling a Request" + "Response Structure"). Both agents load the same file.

## Alternatives Considered

### Paired Sender/Receiver Files (original discovery proposal)

`skills/{type}/sender.md` + `skills/{type}/receiver.md`

- **Pro**: Each side sees only its own instructions (reduced noise in context window)
- **Con**: Two files to maintain per request type, risk of contract drift (sender expects fields that receiver does not document), double the distribution surface
- **Rejection rationale**: User explicitly corrected this. A single file is the canonical contract. Both sides reading the same document ensures consistency. The token cost of loading the full file (~500-1000 tokens for a well-structured skill) is negligible.

### JSON Schema per Request Type

`skills/{type}/schema.json` defining context_bundle and response_bundle as JSON Schema.

- **Pro**: Machine-parseable, enables programmatic validation
- **Con**: LLM agents work better with natural language instructions than JSON Schema. The MCP server is explicitly type-agnostic -- it does not validate context_bundle. JSON Schema would create a false promise of enforcement without a validator.
- **Rejection rationale**: This is the Code Mode pattern: the protocol is flexible, the skill provides structure via natural language guidance. JSON Schema adds complexity without matching the architectural intent. Skills are guidance, not enforcement (at Tier 1). Tier 2 brain service could optionally validate against schemas.

## Consequences

### Positive

- Single source of truth per request type
- Both sender and receiver agents see the full contract, preventing drift
- Simpler repo structure (1 file vs 2 per type)
- Follows Craft Agents SKILL.md conventions exactly
- Zero parsing by MCP server -- skills are agent-level guidance

### Negative

- Receiver agent loads sender instructions (and vice versa) -- small token overhead
- No machine-enforceable schema at Tier 1 (agents may produce non-conforming payloads)

### Risks

- **B10**: Skill contracts produce inconsistent agent behavior -- MEDIUM risk, highest-risk assumption in MVP. Mitigated by testing with 5+ round-trips during walking skeleton validation.
- **B13**: Type-agnostic protocol produces garbage payloads -- MEDIUM risk. Mitigated by receiver skill instructions that handle malformed input gracefully.
