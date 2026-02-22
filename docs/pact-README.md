# PACT -- Protocol for Agent Context Transfer

A git-backed MCP server for async human+agent coordination. Structured requests and responses flow through a shared git repo, with PACT.md contracts defining request types.

## Prerequisites

- Node.js 20+
- git (with SSH or HTTPS auth configured for the shared repo)
- A shared git repository (GitHub/GitLab private repo)
- Craft Agents (or any MCP-compatible host)

## Setup

### 1. Clone the shared PACT repo

```bash
git clone git@github.com:your-org/pact-team.git ~/pact-team
```

### 2. Initialize repo structure

If this is a new repo, create the required directories and config:

```bash
cd ~/pact-team
mkdir -p requests/pending requests/active requests/completed responses pacts
touch requests/pending/.gitkeep requests/active/.gitkeep requests/completed/.gitkeep responses/.gitkeep pacts/.gitkeep
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
git add -A && git commit -m "Initialize PACT repo structure" && git push
```

### 3. Set environment variables

| Variable | Purpose | Example |
|----------|---------|---------|
| `PACT_REPO` | Absolute path to local repo clone | `/Users/alice/pact-team` |
| `PACT_USER` | Your user ID (must match config.json) | `alice` |
| `PACT_LOG_LEVEL` | Logging verbosity (optional) | `info`, `debug`, `error` |

These are passed via the source config (step 5), not your shell profile.

### 4. Build the MCP server

From the craft-gm monorepo root:

```bash
bun run build:pact
```

This produces `dist/pact/index.js`.

### 5. Register as MCP source in Craft Agents

Add a new source in Craft Agents with this configuration:

```json
{
  "type": "mcp",
  "name": "PACT",
  "slug": "pact",
  "mcp": {
    "transport": "stdio",
    "command": "node",
    "args": ["/absolute/path/to/craft-gm/dist/pact/index.js"],
    "env": {
      "PACT_REPO": "/absolute/path/to/pact-team",
      "PACT_USER": "alice"
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
