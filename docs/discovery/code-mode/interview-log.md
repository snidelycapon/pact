# Interview Log -- PACT Code Mode Discovery

## Discovery Date: 2026-02-21
## Method: Codebase Evidence Analysis + User Statement Analysis

This discovery differs from the original PACT discovery (which used live multi-round interviews). The code mode discovery uses codebase evidence, architecture analysis, and the user's explicit statements as the primary evidence base. This section documents the evidence collection process and reasoning.

---

## Evidence Source 1: User's Explicit Statements

### Statement 1 (from original discovery, problem-validation.md line 144)

> "The actual system/protocol is an entry point akin to the Cloudflare Code Mode insights; and then the pacts on each side of the client (versioned & synced with each other as part of 'connecting' as a team on that workspace, ideally) dictate how the agent utilizes that flexibility consistently as part of the shared contract defined through those pacts."

**Analysis**: The user already sees PACT's pact pattern as an expression of code mode thinking. The "few tools + flexible pacts" design IS the code mode pattern, already implemented. This statement was made during the original discovery, before the MVP was built.

**Evidence type**: Past behavior (the user designed the architecture this way intentionally).

### Statement 2 (from the current request)

> "The same patterns could (should) also apply to request type discovery and usage."

**Analysis**: The user identifies a specific gap -- agents discovering and using request types. This is not a general "apply code mode" request; it is a pointed observation about a specific capability that is missing.

**Evidence type**: Direct statement of need. Somewhat future-intent ("should apply"), but grounded in the architecture the user built and uses.

### Statement 3 (from the current request)

> "They are NOT integrating Cloudflare Agents. They want the conceptual mechanisms of code mode applied to PACT's existing tools."

**Analysis**: The user is explicitly scoping away from infrastructure changes. They want the thinking, not the implementation pattern. This constrains the solution space: no code execution sandbox, no meta-tool replacement, no SDK generation as primary deliverable.

**Evidence type**: Direct constraint statement.

---

## Evidence Source 2: Codebase Analysis

### Tool Definition Audit (mcp-server.ts)

Measured the actual context cost of PACT's 7 MCP tools by examining the tool registrations in `src/mcp-server.ts`. Each tool's Zod schema parameters were counted and estimated for token cost when serialized as JSON Schema by the MCP SDK.

**Finding**: ~380 tokens raw, ~1,100-1,500 tokens serialized. This is 0.6-0.75% of a 200k context window. Context pressure from tools is not a real problem.

**Confidence**: HIGH. Direct measurement from code.

### Pact File Audit (examples/pacts/)

Read all 4 PACT.md files to assess their structure, length, and machine-parseability.

| Pact | Lines | Has "When To Use" | Has field tables | Machine-parseable |
|-------|-------|--------------------|-----------------|-------------------|
| ask | 27 | Yes | Yes (simple) | Partially -- tables are regular enough to parse |
| design-pact | 113 | Yes | Yes (complex, multi-phase) | Harder -- phase-dependent field requirements |
| sanity-check | 66 | Yes | Yes (clear) | Partially -- tables parseable, worked example not |
| code-review | 128 | Yes | Yes (clear, with attachments section) | Partially -- tables parseable, multi-round section not |

**Finding**: PACT.md files follow a consistent enough structure that metadata could be extracted programmatically (title from H1, "When To Use" section, field tables). But complex pacts have conditional requirements (phase-dependent fields in design-pact) that markdown tables cannot express precisely.

**Confidence**: HIGH. Direct analysis of files.

### Pact Loading Pattern Audit (pact-inbox.ts, pact-request.ts)

Examined how pacts are loaded and used in the current tool implementations.

**pact_request.ts (lines 46-49)**: Pacts are validated by existence only (`existsSync(pactPath)`). The pact content is never read by the server. No schema validation of context_bundle against pact expectations.

**pact_inbox.ts (lines 98-99)**: Inbox entries include `pact_path` pointing to the PACT.md file. The agent must make a separate read to learn how to respond.

**Finding**: Pacts are referenced but never consumed by the server. The agent is responsible for reading and interpreting them. There is no discovery mechanism -- you must know the pact name to use it.

**Confidence**: HIGH. Direct code analysis.

### Multi-Step Pattern Analysis

Traced the tool call sequences required for common PACT workflows by examining each handler's dependencies and the protocol lifecycle.

**Finding**: 4 patterns identified (A: respond to inbox, B: multi-round thread, C: compose and send, D: review then respond). Each requires 2-4 tool calls. There is no evidence from the 4 completed requests that agents struggle with these patterns.

**Confidence**: MEDIUM for the finding that these are not painful. Sample size is tiny (4 requests). Higher volume might reveal composition pain.

### Git Safety Analysis

Examined git operations across all 7 tool handlers to assess whether code mode's code execution pattern is safe for PACT.

**Finding**: Every tool handler performs a complete git cycle: pull, validate, read/write, add, commit, push. The push includes retry-with-rebase. If code execution allowed bundling multiple operations, a failure mid-script could leave the repo in an inconsistent state (committed but not pushed, or files added but not committed). The atomicity guarantees come from each tool handler managing its own git lifecycle -- breaking this for composability introduces risk.

**Confidence**: HIGH. Architectural analysis.

---

## Evidence Source 3: Beads Ecosystem Research

From `docs/research/beads-ecosystem-analysis.md`:

### Relevant Pattern: JSON-First Agent Interface

Beads recommends CLI over MCP when shell access is available due to "lower context overhead (~1-2k vs 10-50k tokens)". The FAQ explicitly prioritizes token economy.

**Application to code mode question**: This supports the concern about context cost, but PACT's 7 tools at ~1,100-1,500 tokens are already in the "low overhead" range. PACT does not have Beads' problem (81 fields per issue) because PACT's protocol is intentionally thin.

### Relevant Pattern: `bd prime` Context Injection

Beads' `bd prime` generates optimized workflow context summarizing priority breakdown, blocking issues, and ready work.

**Application to code mode question**: A `pact_pacts` tool is analogous to `bd prime` -- a lightweight orientation query that tells the agent what is available without loading full details. This validates the progressive discovery approach.

### Relevant Pattern: Structured Data, Flexible UIs

Beads exposes data through CLI + JSON + JSONL + SQLite. 25+ community UIs emerged.

**Application to code mode question**: The schema.json convention follows this principle -- exposing pacts as structured data (JSON Schema) alongside the human-readable format (PACT.md). This enables tooling without replacing the human-first design.

---

## Evidence Source 4: Existing Discovery Artifacts

### From problem-validation.md (original PACT discovery)

**Assumption B10**: "Pacts are the right protocol" -- Status: PARTIALLY CONFIRMED. The "ask" pact works. Complex pacts are untested with real users.

**New assumption from post-MVP**: "Agents will compose requests without excessive prompting" -- The pact file provides guidance, but the agent has to know to read the pact and follow it. This is a UX/prompting challenge.

**Application**: Both assumptions point to the same gap -- agents need better guidance on pact usage. The code mode discovery addresses this directly with pact_pacts (discovery) and schema.json (guidance).

### From opportunity-tree.md (original PACT discovery)

**O1**: Eliminate manual context assembly -- Score 12/15, INFRASTRUCTURE DELIVERED, VALUE UNTESTED.

**Application**: The code mode discovery is not about context assembly (that is the PACT protocol's job). It is about the layer above: knowing which pact to use and what fields to include. This is complementary, not overlapping.

---

## Evidence Source 5: Architecture Constraints

The PACT architecture imposes specific constraints on any code mode implementation:

1. **Stateless between tool calls** -- The MCP server creates adapters lazily but carries no state between invocations. Any "code mode" that requires maintaining state across a code execution session would violate this principle.

2. **Ports-and-adapters** -- GitPort, ConfigPort, FilePort define the infrastructure boundaries. Any new tool must work through these ports, not around them.

3. **Git as transport** -- All persistent state changes go through git. There is no in-memory state, no database, no cache. This means every operation is durable but also slow (git operations) and side-effectful (commits, pushes).

4. **HITL is mandatory** -- Every client node has a human operator. Tools should support inspectability. Bundling many operations into one opaque code execution reduces the human's ability to observe and intervene.

---

## Evidence Source 6: Usage Data

From the post-MVP re-discovery section of problem-validation.md:

- 2 completed round-trips with Dan on day 1
- Both used the "ask" pact type
- Context bundles were minimal
- Response times: ~3-4 minutes
- Zero pact selection errors (the human told the agent which type to use)

**Application**: The sample is too small to validate or refute pact discovery needs. But the pattern is clear -- humans are currently doing the pact selection. This works at scale 2 (the human knows both available pacts). It will not work at scale 20+.

---

## Questions That Remain Unanswered

| Question | Why It Matters | How To Answer |
|----------|---------------|---------------|
| Do agents actually produce better payloads with schema.json? | Validates the typed contracts hypothesis | A/B test: 5 responses with PACT.md only vs 5 with schema.json |
| Does pact_pacts reduce human intervention in request composition? | Validates the discovery hypothesis | Observation: track whether agents use pact_pacts before composing requests |
| At what pact count does discovery become painful without pact_pacts? | Determines urgency | Create 10, 20, 30 pacts and test selection accuracy |
| Does optional schema validation (warn, not reject) actually help? | Determines whether schema.json needs enforcement | Monitor: do agents self-correct after warnings? |
| Will pact authors actually create and maintain schema.json files? | Determines long-term viability of the convention | Observation over 3 months |

---

## Discovery Methodology Notes

This discovery was conducted as a codebase evidence analysis rather than a traditional interview-based discovery. The reasons:

1. **The "customer" is an agent** -- The primary user of pact discovery and typed contracts is the LLM agent, not the human. Interviewing the human about agent behavior is indirect evidence. Codebase analysis reveals what the agent actually encounters.

2. **The system is built** -- Unlike the original PACT discovery (pre-build), this is a post-MVP investigation. The evidence is in the code and usage data, not in speculative statements.

3. **Past behavior is in the commit history** -- The 4 completed requests, the pact files, the tool implementations -- these are behavioral evidence, not opinions.

The Mom Test principles still apply:
- We looked at what agents actually do (past behavior), not what they "would do" with code mode (future intent)
- We examined real tool call patterns (behavioral evidence), not hypothetical workflows
- We required the evidence to refute 3 of 5 proposed mechanisms rather than accepting the user's enthusiasm for code mode as validation

**What the user asked for**: "Apply code mode to PACT"
**What the evidence supports**: Two specific improvements inspired by code mode thinking
**What was killed**: Three mechanisms that sounded good but lack evidence of need
