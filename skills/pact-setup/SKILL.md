---
name: "Pact Setup"
description: "Configure PACT for any MCP client or CLI — repo path, user config, and connectivity verification"
---

# Pact Setup

Walk the user through configuring their PACT integration. Works with any MCP client (Claude Code, Cursor, Windsurf, Craft Agent) or the standalone CLI.

## What is PACT?

PACT is a lightweight, Git-based protocol for async work requests between people and AI agents. Think of it as a structured inbox — you can send requests (code reviews, questions, check-ins) to teammates, and they can respond on their own schedule.

**How it works:**
- A shared Git repository acts as the transport layer (the "pact repo")
- Pact definitions (templates) live in `pact-store/` — they describe request types with schemas, guidance, and response formats
- Requests are JSON files in `requests/pending/` — status changes happen via explicit actions
- No server, no accounts, no vendor lock-in — just Git

## Pre-flight: Detect Current State

Before asking the user anything, check for existing configuration:

### Check 1: Environment variables
```bash
echo $PACT_REPO $PACT_USER
```

### Check 2: Config file
```bash
cat ~/.pact.json 2>/dev/null
```

### Check 3: MCP client config
Check the relevant MCP client config for an existing PACT server entry:
- **Claude Desktop:** `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows)
- **Claude Code CLI:** `.mcp.json` in the project root, or `~/.claude.json` for global config
- **Cursor:** `.cursor/mcp.json` in the project root
- **Windsurf:** Check Windsurf MCP settings
- **Craft Agent:** `~/.craft-agent/workspaces/<workspace>/sources/pact/config.json`

### Scenarios

**A: Nothing configured (fresh install)**
The user needs full setup. Proceed to "Information to Gather".

**B: Env vars or ~/.pact.json exist**
Already partially configured. Check if the repo path is valid and the user ID is set. Ask what they'd like to change.

**C: MCP client config exists**
Already configured for their editor. Verify the server path exists and PACT_REPO/PACT_USER are set correctly.

## Information to Gather

Ask the user for each piece of information, one at a time. Explain what each is for. **Skip items that are already configured.**

1. **Pact repo path** — Absolute path to their local clone of the shared pact repo.
   - If they haven't cloned one yet, ask for the Git URL and help them clone it:
     ```bash
     git clone <url> ~/pact-repos/<repo-name>
     ```
   - Validate the path exists and contains a `.git` directory.

2. **User ID** — Their PACT user ID (lowercase, hyphens-for-spaces, e.g., `alice` or `cory-smith`). This identifies them as sender/recipient.

3. **Display name** (optional) — Friendly name shown to others (e.g., `Alice`, `Cory Smith`). Defaults to user ID if not set.

4. **Subscriptions** (optional) — Group inboxes to subscribe to (e.g., `+backend-team`, `+on-call`). These control which group requests appear in their inbox. They can add more later with `pact_do subscribe`.

## Setup Paths

Ask the user which setup they want. Most users want both MCP client + CLI.

### Path A: MCP Client Setup

Configure the PACT MCP server in their editor's config.

**Step 1: Build the server** (if not already built)
```bash
cd ~/pact  # or wherever the pact source lives
npm install && npm run build
```

**Step 2: Configure the MCP client**

The server entry needs:
- Command: `node`
- Args: `["<path-to-pact>/dist/index.js"]`
- Environment: `PACT_REPO`, `PACT_USER`, optionally `PACT_DISPLAY_NAME`

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):
```json
{
  "mcpServers": {
    "pact": {
      "command": "node",
      "args": ["<absolute-path-to-pact>/dist/index.js"],
      "env": {
        "PACT_REPO": "<absolute-path-to-pact-repo>",
        "PACT_USER": "<user-id>",
        "PACT_DISPLAY_NAME": "<display-name>"
      }
    }
  }
}
```

**Cursor** (`.cursor/mcp.json` in project root):
```json
{
  "mcpServers": {
    "pact": {
      "command": "node",
      "args": ["<absolute-path-to-pact>/dist/index.js"],
      "env": {
        "PACT_REPO": "<absolute-path-to-pact-repo>",
        "PACT_USER": "<user-id>"
      }
    }
  }
}
```

**Important:**
- All paths must be absolute (not `~/...`). Expand `~` to the full home directory path.
- If the user provided a display name, include `PACT_DISPLAY_NAME` in the env block.

### Path B: CLI Setup

Install the `pact` CLI for terminal-based inbox checking and background polling.

**Step 1: Build and link**
```bash
cd ~/pact  # or wherever the pact source lives
npm install && npm run build
npm link  # makes `pact` available globally
```

**Step 2: Create config file**

Write `~/.pact.json`:
```json
{
  "repo": "<absolute-path-to-pact-repo>",
  "user": "<user-id>",
  "display_name": "<display-name>",
  "poll_interval": 60
}
```

Or set environment variables instead:
```bash
export PACT_REPO=<path>
export PACT_USER=<user-id>
```

**Step 3: Verify**
```bash
pact inbox
```

### Path C: Both (Recommended)

Do both Path A and Path B. The MCP client gives you PACT tools inside your editor. The CLI gives you inbox checking and background polling from any terminal.

## Set Up Subscriptions

If the user has group subscriptions, set them up after the source is connected:

**Via MCP tools** (if connected):
Call `pact_do` with `action: "subscribe"`, `recipient: "+group-name"` for each group.

**Via CLI** (if installed):
Subscriptions are stored in `members/{user_id}.json` in the pact repo. The subscribe action handles this automatically.

## Test the Connection

### MCP Client Test
1. Call `pact_discover` — should return a catalog of available pact types
2. Call `pact_do` with `action: "inbox"` — should return inbox results (empty is fine)

### CLI Test
```bash
pact inbox
```

**Common issues:**
- "node not found" — Node.js not in PATH
- "Cannot find module" — server not built (`npm run build`)
- "PACT_REPO path does not exist" — wrong repo path
- "Not a git repository" — path doesn't point to a git repo

## Optional: Background Polling

For continuous inbox monitoring from the terminal:

```bash
# Watch mode — polls every 60 seconds
pact poll --watch

# Custom interval
pact poll --watch --interval 30

# With desktop notifications (macOS/Linux)
pact poll --watch --notify
```

To run as a background process:
```bash
nohup pact poll --watch --notify > ~/.pact-poll.log 2>&1 &
```

## Summary

Tell the user what was configured:
- Pact repo connected at `<path>`
- User ID: `<user-id>`
- MCP client configured (if applicable)
- CLI installed (if applicable)
- Subscriptions: `<list>` (if any)
- They can browse pact types with `pact_discover`
- They can send requests, respond, check status, and more via `pact_do`
- To add group subscriptions later: `pact_do` with `action: "subscribe"`, `recipient: "+group-name"`
