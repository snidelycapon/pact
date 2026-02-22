# Convention: Inbox Auto-Poll at Session Start

## Overview

Agents connected to GARP should automatically check for pending requests when a session begins. Without this, pending requests age silently -- the recipient never thinks to check unless prompted. Auto-polling solves this by making the agent call `garp_inbox` at session start, reporting any pending items before the user's primary task begins.

This is a host-side convention. No code changes to GARP are required. The `garp_inbox` tool already exists and returns pending requests with sender, type, age, and summary information.

## Host Configuration

### Claude Code (CLAUDE.md)

Add the following to your project's `CLAUDE.md`:

```markdown
## GARP Auto-Poll

At session start, check for pending GARP requests by calling garp_inbox.
If there are pending requests, report them concisely (count, types, senders, ages)
before proceeding with the user's primary task. Do not block the user.
If the inbox is empty, proceed silently without mentioning it.
```

Place this in the top-level section of `CLAUDE.md` so it applies to every session. Claude Code reads `CLAUDE.md` at the start of each conversation and follows the instructions automatically.

### Craft Agents / Custom MCP Hosts

For platforms that support source initialization hooks, configure `garp_inbox` as a startup action in the source definition.

**Craft Agents source configuration with init instruction:**

```json
{
  "type": "mcp",
  "name": "GARP",
  "transport": "stdio",
  "command": "node",
  "args": ["dist/index.js"],
  "env": {
    "GARP_REPO": "/path/to/coordination-repo",
    "GARP_USER": "dan"
  },
  "init_instruction": "When this source loads, call garp_inbox to check for pending requests. Report any pending items concisely before proceeding."
}
```

For hosts without a dedicated `init_instruction` field, add the auto-poll directive to the agent's system prompt or session-start configuration:

```
On session start, invoke garp_inbox from the GARP source.
Report pending items concisely. Do not block the user's primary task.
```

## Behavior Guidelines

Agents implementing auto-poll should follow these rules:

1. **Report concisely.** Summarize pending items in 1-2 lines: count, request type, sender name, and age. Do not dump full request details.

2. **Do not block the user.** The auto-poll report is informational. After reporting, proceed with whatever the user asked for. Never force the user to handle requests before their primary task.

3. **Handle empty inbox gracefully.** When `garp_inbox` returns zero pending requests, either proceed silently or include a brief note like "No pending GARP requests." Prefer silence to reduce noise.

4. **Show age in human-readable form.** Use relative times: "3 hours ago", "yesterday", "2 days ago". Not ISO timestamps.

5. **Group by thread when applicable.** If `garp_inbox` returns thread groups (multiple rounds on the same thread), report the thread as one item with the round count.

## Example Output

### Pending requests found

```
You have 2 pending GARP requests:
- Code review from Cory (3 hours ago)
- Sanity check from Maria Santos (yesterday)

Proceeding with your request.
```

### Empty inbox

```
No pending GARP requests. Proceeding with your request.
```

Or simply proceed without mentioning the inbox at all.

### Thread group in inbox

```
You have 1 pending GARP request:
- Ask thread from Cory (2 rounds, latest 1 hour ago)
```
