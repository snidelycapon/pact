# ADR-003: Local stdio MCP Server Per Client

## Status: Accepted

## Context

The GARP needs client-side tooling that agents can invoke. MCP (Model Context Protocol) is the standard for exposing tools to LLM agents. Two deployment models exist: a centralized HTTP MCP server that all clients connect to, or a local stdio MCP server running as a subprocess on each client machine.

## Decision

Each client runs a local MCP server via stdio transport, started as a subprocess by Craft Agents. The server reads/writes to a local git repo clone and communicates with the agent host via JSON-RPC over stdin/stdout.

Environment variables configure identity and repo path:
- `GARP_REPO`: absolute path to local repo clone
- `GARP_USER`: user identity for inbox filtering and sender attribution

## Alternatives Considered

### Centralized HTTP MCP Server

A single MCP server hosted per team, accepting HTTP connections from all clients.

- **Pro**: Central validation, single deployment, easier to add brain service later
- **Con**: Requires server hosting, introduces network dependency for tool calls, authentication infrastructure needed, defeats the git-as-transport decision (tools would bypass git)
- **Rejection rationale**: The git repo IS the central coordination point. Adding a central HTTP MCP server creates a second coordination layer that duplicates git's role. The MCP server's job is to wrap git operations -- those operations must run locally where the git clone lives.

### Shared HTTP MCP Server on Each Machine

An HTTP MCP server running locally but using HTTP transport instead of stdio.

- **Pro**: Multiple agent platforms could connect to the same local server
- **Con**: Requires port management, process lifecycle management, no advantage when only one client (Craft Agents) exists. Adds complexity for no current benefit.
- **Rejection rationale**: Craft Agents has mature stdio MCP support. Stdio is simpler (no port conflicts, no process management -- Craft Agents starts/stops the subprocess). HTTP transport is a future option when multiple client platforms need to share one MCP server.

## Consequences

### Positive

- Zero network dependency for tool invocation (agent <-> MCP server is local stdio)
- Process lifecycle managed by Craft Agents (auto-start, auto-stop)
- No port management or discovery
- Environment variables cleanly scope identity and repo path
- Stateless between calls -- Craft Agents can restart the process freely
- Matches existing Craft Agents source patterns (Brave Search, Memory, etc. all use stdio)

### Negative

- Each user must install the MCP server locally (mitigated by npm/npx distribution)
- Each user must clone the repo and configure GARP_REPO path
- Cannot serve multiple client platforms simultaneously (addressed by HTTP transport in future)

### Risks

- **R6 (from discovery)**: MCP stdio transport works for this use case -- LOW risk. Craft Agents has mature stdio MCP support with proven reliability.
