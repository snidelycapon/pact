# GARP -- Git-based Agent Request Protocol

A git-backed MCP server for async human+agent coordination. Structured requests and responses flow through a shared git repo, with SKILL.md contracts defining request types.

GARP works with any MCP-compatible host -- Claude Code, Cursor, Windsurf, custom agents, or anything else that speaks the Model Context Protocol.

## Prerequisites

- Node.js 20+
- git (with SSH or HTTPS auth configured for the shared repo)
- A shared git repository (GitHub/GitLab private repo)
- Any MCP-compatible host

## Setup

### 1. Create or join a shared GARP repo

**New repo** -- use the init script:

```bash
./scripts/garp-init.sh new ~/garp-team "My Team" alice/Alice bob/Bob
```

This creates the directory structure, `config.json`, and seeds an `ask` skill contract. The script will offer to push to a remote.

**Existing repo** -- clone it:

```bash
./scripts/garp-init.sh join git@github.com:your-org/garp-team.git ~/garp-team
```

### 2. Build the MCP server

```bash
cd ~/garp
bun install
bun run build
```

This produces `dist/index.js`.

### 3. Register as an MCP server

Add GARP to your MCP host's configuration. The exact location depends on your host:

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
    "garp": {
      "command": "node",
      "args": ["/absolute/path/to/garp/dist/index.js"],
      "env": {
        "GARP_REPO": "/absolute/path/to/garp-team",
        "GARP_USER": "alice"
      }
    }
  }
}
```

Replace the paths and user ID with your own values. See `examples/source-config.json` for a template.

## Available Tools

| Tool | Description |
|------|-------------|
| `garp_request` | Submit a structured request to a team member |
| `garp_inbox` | Check your inbox for pending requests addressed to you |
| `garp_respond` | Submit a response to a pending request |
| `garp_status` | Check the status of a sent or received request |

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GARP_REPO` | Yes | -- | Absolute path to local clone of the shared GARP git repo |
| `GARP_USER` | Yes | -- | Your user ID, must match an entry in config.json |
| `GARP_LOG_LEVEL` | No | `info` | Log verbosity: `debug`, `info`, `error` |

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
garp-team/
  config.json              # Team membership
  requests/
    pending/               # New requests awaiting response
    active/                # Reserved for future use
    completed/             # Responded requests (moved by garp_respond)
  responses/               # Response data keyed by request ID
  skills/
    ask/
      SKILL.md             # Contract for the "ask a question" request type
```

Request lifecycle: `pending/` -> `completed/` via `git mv`, with a response written to `responses/`.
