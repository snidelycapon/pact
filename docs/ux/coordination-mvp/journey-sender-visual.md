# Journey: Sender — Visual Map

## Actors
- **Cory** — Tech support engineer investigating a bug with their agent
- **Alex** — Colleague who will receive the sanity-check request

## Emotional Arc
```
Cory:  Focused ──> Uncertain ──> "Need eyes on this" ──> Confident ──> Relieved
       (investigating)  (stuck)   (decides to ask)      (request sent) (response back)
                                       |
                                  KEY TRANSITION:
                                  From "I'm stuck" to
                                  "Help is structured and on the way"
```

## Flow

```
 CORY'S AGENT SESSION                         COORDINATION REPO
 ======================                        ==================

 [1] Investigating bug with agent
     - Reading files in platform-auth
     - Found memory leak pattern in refresh.ts
     - Not sure if this matches last month's issue
     |
     | Emotion: Uncertain — "Is this the same pattern?"
     v
 [2] Decides to ask Alex
     "Send a sanity check to Alex about this"
     — or —
     "Invoke the sanity-check pact for Alex"
     |
     v
 [3] Agent loads PACT.md
     pacts/sanity-check/PACT.md
     |
     | Agent reads the pact, understands what
     | fields to gather for this request type
     v
 [4] Agent gathers context from session
     - Customer: Acme Corp
     - Product: Platform v3.2
     - Files examined: refresh.ts:L45-90,
       token-manager.ts:L120-150
     - Finding: Refresh tokens not garbage collected
     - Question: "Does this match the session
       service pattern from last month?"
     |
     | Agent may ask Cory to clarify:
     | "What specific question do you want
     |  Alex to answer?"
     v
 [5] Agent composes request
     Shows Plan-style preview:
     +--------------------------------------------------+
     |  COORDINATION REQUEST — Review Before Sending     |
     +--------------------------------------------------+
     |                                                    |
     |  To: Alex                                          |
     |  Type: sanity-check                                |
     |  Priority: normal                                  |
     |                                                    |
     |  Question:                                         |
     |  "Does this memory leak in refresh.ts match        |
     |   the pattern you saw last month with the          |
     |   session service?"                                |
     |                                                    |
     |  Context Bundle:                                   |
     |  - Customer: Acme Corp (Platform v3.2)             |
     |  - Ticket: ZD-4521                                 |
     |  - Files: refresh.ts:L45-90,                       |
     |           token-manager.ts:L120-150                |
     |  - Investigation: Refresh tokens not being         |
     |    garbage collected after OAuth refresh cycle     |
     |                                                    |
     +--------------------------------------------------+
     |  [Approve]  [Edit]  [Cancel]                       |
     +--------------------------------------------------+
     |
     | Cory reviews, edits if needed, approves
     | Emotion: Confident — "This captures what I need"
     v
 [6] Agent calls pact_request                ──────>  requests/pending/
     - Writes JSON to pending/                          req-20260221-001.json
     - git add + commit + push                          (status: pending)
     |
     | Emotion: Relieved — "Help is on the way,
     | I can get back to other work"
     v
 [7] Cory continues other work
     (session ends, or pivots to another task)
     The request lifecycle is fully decoupled
     from this conversation.

     ... time passes (minutes, hours, days) ...

 [8] Cory checks status (new session or same)
     "Check on my sanity-check to Alex"
     |
     v
 [9] Agent calls pact_status               <──────  responses/
     - git pull                                        req-20260221-001.json
     - reads request + response                        (Alex's response)
     |
     v
 [10] Response presented Plan-style
     +--------------------------------------------------+
     |  COORDINATION RESPONSE — req-20260221-001         |
     +--------------------------------------------------+
     |                                                    |
     |  From: Alex                                        |
     |  Type: sanity-check                                |
     |  Status: completed                                 |
     |                                                    |
     |  Answer: YES — same pattern                        |
     |  "This is the same GC issue from ZD-4102 last      |
     |   month. The fix in session-service was to add      |
     |   explicit cleanup in the finally block. Same       |
     |   approach should work here."                       |
     |                                                    |
     |  Evidence:                                          |
     |  - Compared refresh.ts:L45-90 with                  |
     |    session-service/cleanup.ts:L30-60                |
     |  - Same object retention pattern                    |
     |                                                    |
     |  Recommendation:                                    |
     |  - Apply the same finally-block cleanup             |
     |  - Reference ZD-4102 for the fix commit             |
     |                                                    |
     +--------------------------------------------------+
     |
     | Emotion: Validated — "Confirmed, I know
     | what to do next"
     v
 [11] Cory acts on the response
      (fix the bug, escalate, file ticket, etc.)
```

## Step Detail

| # | Action | Tool | Emotion | Shared Artifacts |
|---|--------|------|---------|-----------------|
| 1 | Investigating bug with agent | Craft Agents session | Focused then uncertain | Session context (local) |
| 2 | Decides to ask Alex | Natural language or pact invocation | "Need another set of eyes" | - |
| 3 | Agent loads PACT.md | Auto-loaded from repo | - | pacts/sanity-check/PACT.md |
| 4 | Agent gathers context | Reads from session, may ask user | Collaborative | Session context -> context bundle fields |
| 5 | Agent composes request (Plan preview) | Plan submission pattern | Confident (after review) | Request JSON (draft) |
| 6 | Request submitted and pushed | pact_request | Relieved | requests/pending/req-*.json |
| 7 | Cory continues other work | - | Freed — no longer blocked | - |
| 8 | Cory checks status | Natural language | Curious | - |
| 9 | Agent pulls and reads response | pact_status | Anticipation | responses/req-*.json |
| 10 | Response presented for review | Plan-style display | Validated | Response content |
| 11 | Cory acts on response | Varies | Empowered | - |

## Key Design Decisions

### Plan Submission Pattern (Steps 5 and 10)
The request preview and response display both use the Plan submission pattern from Craft Agents. This means:
- Agent composes structured content
- User reviews in a dedicated UI panel
- User can edit, approve, or cancel
- No surprises — nothing leaves the machine without human review

### Pact Invocation (Steps 2-3)
Two ways to trigger:
1. **Direct**: User invokes the pact explicitly ("use the sanity-check pact")
2. **Inferred**: User describes the need ("ask Alex to check this") and agent matches to the right request type

Both paths load the same PACT.md which tells the agent what context to gather.

### Session Decoupling (Steps 6-8)
The request is a file in a git repo. Once pushed, it exists independently of any conversation. Cory can:
- Close the session entirely
- Start a new session days later and check status
- Never check — the request and response persist in the repo regardless

### Context Bundle Assembly (Step 4)
The agent assembles the context bundle from:
1. Information already in the current session (files read, findings made)
2. Fields defined in PACT.md (what the request type requires)
3. Clarification from the user (specific question, priority, deadline)

This is the core value proposition — the agent does the context packaging that was previously manual.
