# GARP -- Git-based Agent Request Protocol

A git-backed MCP server for async human+agent coordination. Structured requests and responses flow through a shared git repo, with SKILL.md contracts defining request types.

## Prerequisites

- Node.js 20+
- git (with SSH or HTTPS auth configured for the shared repo)
- A shared git repository (GitHub/GitLab private repo)
- Craft Agents (or any MCP-compatible host)

## Setup

### 1. Clone the shared GARP repo

```bash
git clone git@github.com:your-org/garp-team.git ~/garp-team
```

### 2. Initialize repo structure

If this is a new repo, create the required directories and config:

```bash
cd ~/garp-team
mkdir -p requests/pending requests/active requests/completed responses skills
touch requests/pending/.gitkeep requests/active/.gitkeep requests/completed/.gitkeep responses/.gitkeep skills/.gitkeep
```

Create `config.json` in the repo root:

```json
{
  "team_name": "Your Team",
  "version": 1,
  "members": [
    { "user_id": "alice", "display_name": "Alice" },
    { "user_id": "bob", "display_name": "Bob" }
  ]
}
```

Commit and push:

```bash
git add -A && git commit -m "Initialize GARP repo structure" && git push
```

### 3. Set environment variables

| Variable | Purpose | Example |
|----------|---------|---------|
| `GARP_REPO` | Absolute path to local repo clone | `/Users/alice/garp-team` |
| `GARP_USER` | Your user ID (must match config.json) | `alice` |
| `GARP_LOG_LEVEL` | Logging verbosity (optional) | `info`, `debug`, `error` |

These are passed via the source config (step 5), not your shell profile.

### 4. Build the MCP server

From the craft-gm monorepo root:

```bash
bun run build:garp
```

This produces `dist/garp/index.js`.

### 5. Register as MCP source in Craft Agents

Add a new source in Craft Agents with this configuration:

```json
{
  "type": "mcp",
  "name": "GARP",
  "slug": "garp",
  "mcp": {
    "transport": "stdio",
    "command": "node",
    "args": ["/absolute/path/to/craft-gm/dist/garp/index.js"],
    "env": {
      "GARP_REPO": "/absolute/path/to/garp-team",
      "GARP_USER": "alice"
    }
  }
}
```

Replace the paths and user ID with your own values. See `examples/source-config.json` for a template.

## Available Tools

| Tool | Description |
|------|-------------|
| `garp_request` | Submit a structured request to a team member |
| `garp_inbox` | Check your inbox for pending requests |
| `garp_respond` | Respond to a pending request |
| `garp_status` | Check the status of a request |
| `garp_cancel` | Cancel a pending request you sent |
| `garp_amend` | Amend a pending request you sent |
| `garp_thread` | View the full history of a request thread |

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GARP_REPO` | Yes | -- | Absolute path to local clone of the shared GARP git repo |
| `GARP_USER` | Yes | -- | Your user ID, must match an entry in config.json |
| `GARP_LOG_LEVEL` | No | `info` | Log verbosity: `debug`, `info`, `error` |

## Repo Structure

The shared git repo follows this layout:

```
garp-team/
  config.json              # Team membership
  requests/
    pending/               # New requests awaiting response
    active/                # Reserved for future use
    completed/             # Responded requests (moved by garp_respond)
    cancelled/             # Cancelled requests (moved by garp_cancel)
  responses/               # Response data keyed by request ID
  skills/
    ask/
      SKILL.md             # Contract for the "ask a question" request type
```

Request lifecycle: `pending/` -> `completed/` (via `garp_respond`) or `pending/` -> `cancelled/` (via `garp_cancel`). Responses are written to `responses/`. Requests support threading (`thread_id`), amendments (`garp_amend`), and file attachments.
