# ADR-015: Declarative Brain Processing Model

## Status: Accepted

## Context

GARP Tier 1 operates as a "dumb router" -- the MCP server accepts requests, writes them to git, and delivers them to recipients without processing the content. Tier 2 introduces a "brain" that can validate, enrich, route, and auto-respond to requests based on skill-specific rules.

The brain architecture must be designed now (as part of the skill format) even though the brain implementation is deferred to a later wave. The skill format needs to accommodate brain rules so that skills can declare processing behavior without a separate config layer.

Key constraints from the Beads evolution research:
- No daemon process. Beads deleted ~16,000 lines of daemon/sync complexity. The brain must be stateless.
- No separate database. Git remains the single source of truth.
- No dual-backend. The brain reads from and writes to the same git repo.
- Skill-specific, not global. Each skill declares its own processing rules.

## Decision

Brain processing is defined as an optional `brain_processing` section in the YAML frontmatter of SKILL.md. The brain is a stateless serverless function (GitHub Actions, Lambda, or equivalent) triggered by git push events that reads the skill contract and executes the declared rules.

### Pipeline Stages

Four stages, executed in order, each optional:

1. **Validation** -- Check request content beyond key-presence. Produces warnings that are appended to the request envelope. WARN not REJECT: requests are never blocked by validation. All matching rules fire.

2. **Enrichment** -- Add computed fields to the request. Written back as an amendment entry (append-only, using the existing `amendments` array in the request envelope). All matching rules fire.

3. **Routing** -- Override or supplement recipient routing. May reassign the request to a different recipient or add cc recipients. First matching rule wins.

4. **Auto-response** -- Generate an automatic response when conditions are met. Uses a template with variable substitution. The brain creates a response file and moves the request to completed. Single rule per skill (object, not array).

### Execution Model

- Triggered by git push to `requests/pending/`
- Reads the `request_type` from the incoming request envelope
- Loads `skills/{request_type}/SKILL.md`, parses YAML frontmatter
- If no `brain_processing` section exists, terminates (dumb routing preserved)
- Executes stages in order: validation, enrichment, routing, auto_response
- Writes results back to git (amendments, routing changes, or auto-responses)
- Commits and pushes
- Terminates. No persistent state.

### Writes Use Existing Mechanisms

- Validation warnings: Same `validation_warnings` field already used by `garp_request` handler
- Enrichment: Same amendment mechanism as `garp_amend` (append-only `amendments` array)
- Routing: Direct envelope modification (brain has write access to pending requests)
- Auto-response: Same response file + status transition as `garp_respond`

### Skills Without Brain Processing

Skills that omit the `brain_processing` section behave exactly as they do today. The brain function checks for the section and skips processing when absent. This preserves full backward compatibility with the dumb-router model.

## Alternatives Considered

### Separate Brain Config Directory

Place brain rules in a separate file per skill (e.g., `skills/{name}/brain.yaml`) rather than in the SKILL.md frontmatter.

- **Pro**: Separation of concerns -- skill documentation and brain rules in different files.
- **Pro**: Avoids making SKILL.md frontmatter too large.
- **Con**: Reintroduces the sync problem that the unified format was designed to eliminate. Brain rules can reference fields defined in the skill contract; if they're in separate files, references can go stale.
- **Con**: Two files to read instead of one for every brain execution. More I/O, more potential for inconsistency.
- **Con**: Skill authors must maintain two files. Cognitive load increases.
- **Rejection rationale**: The unified skill format decision (ADR-014) consolidates all skill metadata into one file. Separating brain rules undermines that decision and reintroduces sync drift.

### Imperative Brain Scripts

Instead of declarative YAML rules, allow each skill to include a TypeScript/JavaScript brain script (e.g., `skills/{name}/brain.ts`) that receives the request envelope and returns processing results.

- **Pro**: Maximum flexibility. Any logic expressible in TypeScript can be a brain rule.
- **Pro**: Familiar to developers. No DSL to learn.
- **Con**: Security risk. Arbitrary code execution from git-committed files. Any team member who can push to the repo can execute code on the brain infrastructure.
- **Con**: Testing complexity. Each brain script is a separate program that must be individually tested. Declarative rules can be validated structurally.
- **Con**: Runtime dependency. The brain must have a TypeScript/JavaScript runtime capable of executing arbitrary scripts. Declarative rules are data, not code.
- **Con**: Violates the "no daemon/no persistent state" constraint from Beads research. Scripts may introduce stateful behavior, side effects, or external API calls that are hard to constrain.
- **Rejection rationale**: Declarative rules are safer, simpler to validate, and constrained by design. The operator set (equals, contains, in, exists, gt, lt) covers the known use cases. If imperative logic is ever needed, it belongs in a separate skill-specific service, not in the brain pipeline. **Scope note**: This ADR defines the brain processing *contract format*, not the implementation. A full security review of the brain execution environment (input sanitization, sandboxing, access controls) is deferred to the implementation wave. If imperative brain logic is later deemed necessary, that decision should be captured in a separate ADR (e.g., ADR-017), not as a compromise within this declarative model.

### Global Brain Config

A single `brain-config.yaml` at the repo root defining rules for all skills, rather than per-skill declarations.

- **Pro**: Central overview of all brain processing in one file.
- **Pro**: Cross-skill rules (e.g., "all high-urgency requests across all skills get priority enrichment") are straightforward.
- **Con**: Violates the "skill-specific, not global" principle from Beads research. Adding a new skill should require no changes to global config.
- **Con**: Coupling. Global config changes affect all skills simultaneously. A typo in the global config could break brain processing for every skill.
- **Con**: Scaling. As skill count grows, a single global config file becomes unwieldy.
- **Rejection rationale**: Per-skill rules follow the same modularity principle as the skill contracts themselves. Each skill is self-contained: one directory, one SKILL.md, one set of brain rules. Adding or removing a skill has no side effects on other skills.

## Consequences

### Positive

- Brain rules are co-located with the skill they govern. Adding brain processing to a skill is a SKILL.md edit, not an infra change.
- Declarative rules are structurally validatable. A YAML schema can check that rules are well-formed before the brain executes them.
- Serverless execution model requires no persistent infrastructure. The brain is a function that runs and terminates.
- Writes use existing mechanisms (amendments, responses). No new data model or protocol change.
- Skills without `brain_processing` are unaffected. Full backward compatibility with Tier 1 dumb routing.

### Negative

- Declarative rules have limited expressiveness. Complex business logic (multi-step workflows, external API calls, conditional branching) cannot be expressed in the operator set. This is intentional -- such logic belongs in separate services.
- YAML frontmatter grows with brain rules. A skill with extensive validation, enrichment, routing, and auto-response rules may have a large frontmatter section. This is a readability concern but not a correctness concern.
- The brain contract is designed but not implemented. Until implementation, the contract format is a hypothesis. Real usage may require operator additions or structural changes.
