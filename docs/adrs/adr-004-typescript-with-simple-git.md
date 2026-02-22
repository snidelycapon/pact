# ADR-004: TypeScript with simple-git

## Status: Accepted

## Context

The PACT MCP server needs a runtime language and a strategy for executing git operations. The user has built Craft Agents in TypeScript and the BWG Engine MCP server in Python. Both are viable.

## Decision

TypeScript (Node.js 20+) as the implementation language. `simple-git` (MIT license) as the git operations library. `@modelcontextprotocol/sdk` (MIT license) as the MCP protocol implementation.

## Alternatives Considered

### Python with GitPython

- **Pro**: User has built MCP servers in Python (BWG Engine). GitPython is mature. Python MCP SDK exists.
- **Con**: Craft Agents ecosystem is TypeScript. Source config, pact format, session tools are all TypeScript-native. Python introduces a runtime dependency that may not be present on all target machines (Node.js is more commonly pre-installed for developers). Two languages in the stack increases maintenance burden.
- **Rejection rationale**: The PACT MCP server will be configured and distributed alongside Craft Agents. Staying in the same language ecosystem reduces friction for the user (who maintains both) and for future contributors.

### TypeScript with Raw child_process

Execute `git pull`, `git push`, etc. via Node.js `child_process.exec`.

- **Pro**: Zero additional dependencies. Full control over git command construction.
- **Con**: Error handling for git operations is complex (exit codes, stderr parsing, interactive prompts). Handling edge cases (detached HEAD, merge conflicts, auth prompts) requires significant boilerplate. This is exactly what `simple-git` abstracts.
- **Rejection rationale**: `simple-git` (MIT license, 3.3M weekly npm downloads, actively maintained) provides typed methods for all needed git operations with proper error handling. Rebuilding this from raw child_process is unnecessary effort within a 5-7 day timeline.

### Deno or Bun as Runtime

- **Pro**: Bun is already used by Craft Agents for development.
- **Con**: stdio MCP server subprocess is launched by Craft Agents with `node` command. Requiring Bun or Deno as the subprocess runtime adds an installation dependency. Node.js is the safest runtime for stdio MCP distribution via npm/npx.
- **Rejection rationale**: The MCP server is distributed as an npm package and launched via `node`. Node.js 20+ is the broadest-compatibility choice. The build step can use Bun (via `tsup`), but the runtime target is Node.js.

## Consequences

### Positive

- Same language as Craft Agents -- single ecosystem for maintenance
- `simple-git` handles git edge cases (auth prompts, merge conflicts, error parsing)
- `@modelcontextprotocol/sdk` is the official MCP TypeScript SDK
- npm/npx distribution for easy installation
- Type safety for request/response envelope validation (Zod schemas)

### Negative

- Node.js must be installed on client machines (acceptable for developer target users)
- `simple-git` is an additional dependency (~150KB)

### Dependencies

| Package | Version | License | Purpose |
|---------|---------|---------|---------|
| `@modelcontextprotocol/sdk` | latest | MIT | MCP protocol implementation |
| `simple-git` | ^3.x | MIT | Git operations wrapper |
| `zod` | ^3.x | MIT | Envelope schema validation |
| `tsup` (dev) | latest | MIT | Build/bundle |
| `typescript` (dev) | ^5.x | Apache 2.0 | Type checking |
