# PACT -- Protocol for Agent Context Transfer

A git-backed MCP server for async human+agent coordination. Structured requests and responses flow through a shared git repo, with PACT.md contracts defining request types.

PACT works with any MCP-compatible host -- Claude Code, Cursor, Windsurf, custom agents, or anything else that speaks the Model Context Protocol.

## Prerequisites

- Node.js 20+
- git (with SSH or HTTPS auth configured for the shared repo)
- A shared git repository (GitHub/GitLab private repo)
- Any MCP-compatible host

## Setup

### 1. Create or join a shared PACT repo

**New repo** -- use the init script:

```bash
./scripts/pact-init.sh new ~/pact-team "My Team" alice/Alice bob/Bob
```

This creates the directory structure, `config.json`, and seeds an `ask` pact. The script will offer to push to a remote.

**Existing repo** -- clone it:

```bash
./scripts/pact-init.sh join git@github.com:your-org/pact-team.git ~/pact-team
```

### 2. Build the MCP server

```bash
cd ~/pact
bun install
bun run build
```

This produces `dist/index.js`.

### 3. Register as an MCP server

Add PACT to your MCP host's configuration. The exact location depends on your host:

| Host | Config location |
|------|----------------|
| Claude Code | `~/.claude/settings.json` or project `.mcp.json` |
| Cursor | Cursor settings > MCP |
| VS Code (Copilot) | `.vscode/mcp.json` |
| Custom / other | Consult your host's MCP documentation |

The server configuration follows the standard MCP stdio format:

```json
{
  "mcpServers": {
    "pact": {
      "command": "node",
      "args": ["/absolute/path/to/pact/dist/index.js"],
      "env": {
        "PACT_REPO": "/absolute/path/to/pact-team",
        "PACT_USER": "alice"
      }
    }
  }
}
```

Replace the paths and user ID with your own values. See `examples/source-config.json` for a template.

## Available Tools

PACT exposes two MCP tools:

| Tool | Description |
|------|-------------|
| `pact_discover` | Browse the pact catalog, look up pact definitions, and list team members |
| `pact_do` | Execute an action (see below) |

### Actions (`pact_do`)

| Action | Description |
|--------|-------------|
| `send` | Submit a structured request to one or more recipients |
| `inbox` | Check your inbox for pending requests |
| `respond` | Respond to a pending request |
| `check_status` | Check the status of a request |
| `view_thread` | View the full history of a request thread |
| `cancel` | Cancel a pending request you sent |
| `amend` | Amend a pending request you sent |

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PACT_REPO` | Yes | -- | Absolute path to local clone of the shared PACT git repo |
| `PACT_USER` | Yes | -- | Your user ID, must match an entry in config.json |
| `PACT_LOG_LEVEL` | No | `info` | Log verbosity: `debug`, `info`, `error` |

## Development

```bash
bun install
bun test              # Run all tests
bun run typecheck     # TypeScript type checking
bun run build         # Build dist/index.js
```

## Repo Structure

The shared git repo follows this layout:

```
pact-team/
  config.json              # Team membership
  pact-store/              # Pact definitions (flat .md files with YAML frontmatter)
    ask.md
    review.md
    propose.md
    ...
  requests/
    pending/               # New requests awaiting response
    completed/             # Responded requests
    cancelled/             # Cancelled requests
  responses/               # Response data keyed by request ID
    {request_id}.json      # Single-recipient response
    {request_id}/          # Multi-recipient responses (one file per responder)
      {user_id}.json
  attachments/             # File attachments keyed by request ID
    {request_id}/
      {filename}
```

Request lifecycle: `pending/` -> `completed/` (via respond) or `pending/` -> `cancelled/` (via cancel). Requests support multiple recipients, threading (`thread_id`), amendments, and file attachments.
