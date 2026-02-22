# ADR-013: Collapsed Tool Surface

## Status: Accepted

## Context

PACT currently registers 8 MCP tools: `pact_request`, `pact_inbox`, `pact_respond`, `pact_status`, `pact_thread`, `pact_cancel`, `pact_amend`, `pact_pacts`. Each tool registration consumes ~200 tokens of agent context. At 8 tools this is manageable (~1,600 tokens), but the architecture scales O(tools) -- adding pacts-related operations, brain controls, or team management tools would push context consumption past acceptable thresholds (projected ~6,000 tokens at 30 tools, ~20% of context at 100 pacts).

The underlying handler logic is sound (179 passing tests, clean ports-and-adapters). The problem is the MCP registration surface, not the internal dispatch.

## Decision

Collapse from 8 enumerated MCP tools to 2 meta-tools:

- **`pact_discover`** -- Read-only discovery and catalog retrieval. Returns available pacts, team members, and optionally active thread summaries. Accepts an optional `query` parameter for keyword filtering. No side effects.

- **`pact_do`** -- All operations. Accepts an `action` discriminator string (`send`, `respond`, `cancel`, `amend`, `check_status`, `inbox`, `view_thread`) plus action-specific parameters. Dispatches internally to the existing handler modules.

The boundary between the two tools is: discovery (what can I do?) vs execution (do this). Read operations on live request state (`inbox`, `check_status`, `view_thread`) are placed in `pact_do` because they operate on mutable state via git pull, semantically grouping them with other stateful operations.

Internal handler modules (`pact-request.ts`, `pact-inbox.ts`, etc.) are preserved unchanged. The collapse is at the MCP registration surface only.

## Alternatives Considered

### 3 Tools: discover + read + write

Split operations into discovery, read-only operations, and write operations.

- **Pro**: Cleaner read/write separation. Agents that only need to check status don't invoke the "do" tool.
- **Pro**: Read tools could skip git push (only pull), making a clear side-effect boundary.
- **Con**: The read/write boundary is genuinely ambiguous. `inbox` does a git pull (side effect) but no push. `check_status` similarly. Both the 2-tool and 3-tool designs face this ambiguity -- it is inherent to git-backed reads, not an argument that uniquely disfavors 3 tools.
- **Con**: Three tool descriptions consume ~600 tokens vs ~400 for two. Marginal gain for additional conceptual overhead.
- **Rejection rationale**: The discover/do split is preferred over read/write because: (a) the boundary is *intent-based* ("what can I do?" vs "do this"), not *side-effect-based* (read vs write), which avoids the git-pull classification problem that affects both designs equally; (b) agents follow a natural two-step workflow -- discover capabilities, then act -- matching REST resource discovery + CRUD and reducing cognitive load; (c) ~200 fewer tokens per session for marginal conceptual gain; (d) for a solo developer, fewer tools means less MCP registration boilerplate and a smaller test surface.

### 1 Tool: pact

A single uber-tool accepting an `operation` parameter that covers all functionality.

- **Pro**: Absolute minimum context cost (~200 tokens for one tool description).
- **Pro**: Simplest MCP registration (one call to `server.tool`).
- **Con**: The tool description must document all operations (discovery, sending, responding, cancelling, etc.) in a single string. This description would be ~400+ tokens, negating the context savings.
- **Con**: Loses the semantic signal that discovery and execution are different concerns. An agent would not know whether to call `pact` to learn about pacts or to submit a request without parsing the full description.
- **Rejection rationale**: A single tool with 10+ operations stuffed into one description is worse for agent comprehension than two tools with clear purposes. The description bloat would offset the registration savings.

### Keep 8 Tools + Add Lazy Loading

Keep all 8 tools registered but implement MCP tool lazy-loading (if the SDK supports it) so descriptions are only sent when the agent requests them.

- **Pro**: No architectural change to handlers or dispatch.
- **Pro**: Context cost is amortized -- only loaded tools consume context.
- **Con**: The MCP SDK (`@modelcontextprotocol/sdk`) does not currently support lazy tool description loading. All registered tools are enumerated in `tools/list`.
- **Con**: Even if lazy loading were available, agents typically call `tools/list` at session start, loading all descriptions at once.
- **Rejection rationale**: Depends on SDK capabilities that do not exist. The fundamental scaling problem (O(tools) context cost) remains even with lazy loading because agents front-load tool discovery.

## Consequences

### Positive

- Context cost drops from ~1,600 tokens to ~400 tokens (2 tools vs 8). Scales O(1) as new actions are added to `pact_do`.
- Adding new operations (e.g., `archive`, `reassign`, `bulk_respond`) requires adding a handler and a case in the dispatcher -- no new MCP tool registration, no new context cost.
- Agents learn "discover then do" as a two-step workflow, which is a well-understood pattern (like REST resource discovery + CRUD).
- Existing handler modules, port interfaces, and 179 tests are unaffected during the build phase (parallel registration).

### Negative

- `pact_do` is a "god tool" in the MCP sense -- it handles 7+ operations through a single entry point. Agent reasoning about parameter requirements depends on the `action` value, which is less explicit than separate tool signatures.
- Error messages for missing parameters must include action context (e.g., "Missing 'request_id' for action 'respond'") since the parameter schema is a union across all actions.
- Migration requires updating test call sites from old tool names to new action-based calls (mechanical but tedious for 179 tests).
