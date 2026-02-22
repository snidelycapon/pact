# Journey: Setup & Onboarding — Visual Map

## Actors
- **Cory** — Product creator, sets up the GARP repo and MCP server
- **Alex** — Testing partner, onboards as second user

## Emotional Arc
```
Cory:    Confident ──────────────────────────────────────────> Validated
Alex:    Curious ──────> "That's it?" ──────> "Oh, it works" > Bought-in
```

## Flow

```
 CORY (setup)                          ALEX (onboarding)
 ============                          ==================

 [1] Create private GitHub repo
     garp-repo/
       config.json
       requests/pending/
       requests/active/
       requests/completed/
       responses/
       skills/sanity-check/
         SKILL.md
              |
              |  GitHub invite
              v
                                       [3] Accept repo invite
 [2] Seed a welcome request
     requests/pending/
       req-welcome-001.json
     (git commit + push)
                                       [4] Clone repo locally
              |                             $ git clone ...
              |
              |                        [5] Configure MCP source
              |                            in Craft Agents:
              |                            "Add GARP server,
              |                             point at repo path"
              |
              |                        [6] First session:
              |                            "Check my inbox"
              |
              |                            +----------------------------------+
              |                            | garp_inbox                      |
              |                            |                                  |
              |                            | > git pull                       |
              |                            | > scan pending/ for user: alex   |
              |                            |                                  |
              |                            | 1 pending request:               |
              |                            |   req-welcome-001                |
              |                            |   from: Cory                     |
              |                            |   type: sanity-check             |
              |                            |   "Welcome! Can you verify       |
              |                            |    your setup works by           |
              |                            |    responding to this?"          |
              |                            +----------------------------------+
              |
              |                              Emotion: "Oh, it works."
              |
              |                        [7] Respond to welcome request
              |                            Agent loads SKILL.md,
              |                            composes response,
              |                            Alex reviews & approves
              |
              |                            (git commit + push)
              |
 [8] Check status
     garp_status req-welcome-001
     > git pull
     > reads response

     Emotion: "Round-trip confirmed."
```

## Step Detail

| # | Actor | Action | Tool | Emotion | Duration |
|---|-------|--------|------|---------|----------|
| 1 | Cory | Create GitHub repo with directory structure | git/GitHub | Confident — routine task | 5 min |
| 2 | Cory | Seed a welcome request for Alex | garp_request | Anticipation | 2 min |
| 3 | Alex | Accept GitHub repo invitation | GitHub UI | Curious | 1 min |
| 4 | Alex | Clone repo locally | git clone | Routine | 1 min |
| 5 | Alex | Add MCP source in Craft Agents pointing at repo | Craft Agents UI | Slight uncertainty — "is this all?" | 2 min |
| 6 | Alex | Start session, check inbox | garp_inbox | Discovery — "oh, there's something here" | 1 min |
| 7 | Alex | Respond to welcome request | garp_respond | Confirmation — "this actually works" | 3 min |
| 8 | Cory | Check status, see Alex's response | garp_status | Validated — round-trip complete | 1 min |

## Total Onboarding Time: ~15 minutes (Alex), ~10 minutes prep (Cory)

## Friction Points

1. **Step 5 — MCP configuration**: Alex needs to know the repo path and their user ID. The config must be correct on first try or the inbox scan will return nothing (silent failure).
2. **Step 6 — First inbox check**: If Alex checks before Cory has seeded the welcome request, they see an empty inbox. No harm, but the "it works" moment is delayed.
3. **Git authentication**: Alex must have git credentials configured for the private repo. For developers this is routine, but it is a prerequisite.

## TUI Mockup — Alex's First Inbox Check (Step 6)

```
Alex > Check my GARP inbox

  [Agent calls garp_inbox]

  Pulling latest from GARP repo...

  +--------------------------------------------------+
  |  COORDINATION INBOX — 1 pending request           |
  +--------------------------------------------------+
  |                                                    |
  |  req-welcome-001                                   |
  |  Type: sanity-check                                |
  |  From: Cory                                        |
  |  Sent: 2026-02-21 14:00 UTC                        |
  |  Summary: "Welcome! Can you verify your setup      |
  |            works by responding to this?"            |
  |                                                    |
  +--------------------------------------------------+

  Would you like me to open this request?
```

## Correction from Discovery

**Discovery docs proposed**: Separate sender.md and receiver.md skill files per request type.
**User clarified**: One SKILL.md file per request type. Both sender and receiver load the same file. The skill defines the contract for composition AND interpretation.

This simplifies onboarding — there is one file to understand per request type, not two.
