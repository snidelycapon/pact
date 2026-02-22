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

| Tool | Description |
|------|-------------|
| `pact_request` | Submit a structured request to a team member |
| `pact_inbox` | Check your inbox for pending requests |
| `pact_respond` | Respond to a pending request |
| `pact_status` | Check the status of a request |
| `pact_cancel` | Cancel a pending request you sent |
| `pact_amend` | Amend a pending request you sent |
| `pact_thread` | View the full history of a request thread |

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
  requests/
    pending/               # New requests awaiting response
    active/                # Reserved for future use
    completed/             # Responded requests (moved by pact_respond)
    cancelled/             # Cancelled requests (moved by pact_cancel)
  responses/               # Response data keyed by request ID
  pacts/
    ask/
      PACT.md             # Contract for the "ask a question" request type
```

Request lifecycle: `pending/` -> `completed/` (via `pact_respond`) or `pending/` -> `cancelled/` (via `pact_cancel`). Responses are written to `responses/`. Requests support threading (`thread_id`), amendments (`pact_amend`), and file attachments.
