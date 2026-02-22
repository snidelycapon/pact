# Journey: Inbox Auto-Poll at Session Start — Visual Map

## Actors
- **Dan** — Recipient who should be notified of pending requests without asking
- **Agent** — MCP-connected agent that auto-checks inbox

## Emotional Arc
```
Dan:   Session start ──> Aware ──> Decides ──> Working
       (agent auto-       (inbox    (triage)   (on request
        checks inbox)      summary)             or own work)
            |
       KEY IMPROVEMENT:
       Dan never forgets to check.
       The agent just does it.
```

## Flow

```
 DAN'S AGENT SESSION                             COORDINATION REPO
 ====================                              ==================

 [1] Dan starts a new agent session
     (Opens Claude Code, starts Craft Agents, etc.)
     |
     v
 [2] Agent auto-invokes pact_inbox          <──  requests/pending/
     (configured via CLAUDE.md or                  2 pending requests
      system prompt instruction)
     |
     v
 [3] Agent reports inbox summary
     "You have 2 pending PACT requests:
      - Code review from Cory (2 hours ago)
      - Sanity check from Maria (yesterday)
      Would you like to handle any of these?"
     |
     | Emotion: Aware — "I didn't have to ask.
     | The agent already checked for me."
     v
 [4] Dan decides what to do
     - Handle a request now
     - Acknowledge and defer ("I'll get to those later")
     - Ignore and do other work
```

## Configuration Patterns

### Pattern A: CLAUDE.md Convention (Claude Code)
```markdown
# CLAUDE.md

## Session Start
When starting a new session, check for pending PACT requests
by calling pact_inbox. Report any pending items before proceeding
with the user's request.
```

### Pattern B: Pact Contract Pattern
A "session-start" pact or convention document that agents
read at session start. Not a PACT code change -- a usage pattern.

### Pattern C: MCP Host Hook
For platforms that support session-start hooks (e.g., Craft Agents
custom sources), configure pact_inbox as an initialization action.

## Key Design Decisions

### No Code Changes Required
This is entirely a convention/documentation improvement. The pact_inbox
tool already exists and works. The improvement is making agents call it
automatically instead of waiting for the user to ask.

### Non-Intrusive
The auto-check is a suggestion, not a blocker. If the agent reports
"0 pending requests," it moves on silently. The user is never forced
to handle requests before doing other work.

### Multiple Host Support
The convention should be documented for at least Claude Code (CLAUDE.md)
and Craft Agents (source config). Each host has a different mechanism,
but the pattern is the same: "call pact_inbox at session start."
