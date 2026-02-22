# Journey: Receiver — Visual Map

## Actors
- **Alex** — Colleague receiving a sanity-check request from Cory
- **Cory** — Request sender (off-screen in this journey)

## Emotional Arc
```
Alex:  Idle ──> Aware ──> Oriented ──> Investigating ──> Confident ──> Done
       (nothing   (inbox   ("I see what    (working      (found the   (response
        pending)   alert)   Cory needs")    the problem)  answer)      sent)
                     |
                KEY MOMENT:
                Reading the request with full context.
                Zero cold-start. Agent already knows
                what to look at.
```

## Flow

```
 ALEX'S AGENT SESSION                          COORDINATION REPO
 ======================                         ==================

 [1] Alex starts a session (or checks inbox)
     "Check my PACT inbox"
     |
     v
 [2] Agent calls pact_inbox              <──────  requests/pending/
     - git pull                                     req-20260221-001.json
     - scan pending/ for user: alex
     |
     v
 [3] Inbox displayed
     +--------------------------------------------------+
     |  COORDINATION INBOX — 1 pending request           |
     +--------------------------------------------------+
     |                                                    |
     |  [1] req-20260221-001                              |
     |      Type: sanity-check                            |
     |      From: Cory                                    |
     |      Sent: 2026-02-21 14:00 UTC                    |
     |      Question: "Does this memory leak match        |
     |                 the session service pattern?"       |
     |      Customer: Acme Corp (Platform v3.2)           |
     |                                                    |
     +--------------------------------------------------+
     |
     | Alex decides to handle this now
     | Emotion: Aware — "Cory needs eyes on something"
     v
 [4] Alex opens the request
     "Open that request from Cory"
     |
     v
 [5] Agent loads the full request + PACT.md
     The PACT.md auto-loads based on request_type
     |
     | The agent now has:
     | - The pact (how to handle this type)
     | - The full context bundle (customer, files,
     |   investigation, specific question)
     | - Guidance on expected response format
     v
 [6] Full request presented
     +--------------------------------------------------+
     |  SANITY-CHECK REQUEST — req-20260221-001          |
     +--------------------------------------------------+
     |                                                    |
     |  From: Cory                                        |
     |  Customer: Acme Corp — Platform v3.2               |
     |  Ticket: ZD-4521                                   |
     |                                                    |
     |  Question:                                         |
     |  "Does this memory leak in refresh.ts match        |
     |   the pattern you saw last month with the          |
     |   session service?"                                |
     |                                                    |
     |  Context:                                          |
     |  - Files: src/auth/refresh.ts:L45-90               |
     |           src/oauth/token-manager.ts:L120-150      |
     |  - Finding: Refresh tokens not being garbage       |
     |    collected after OAuth refresh cycle              |
     |  - Related: ZD-4521 (Zendesk)                      |
     |                                                    |
     +--------------------------------------------------+
     |
     | Emotion: Oriented — "I know exactly what Cory
     | needs me to look at"
     |
     | NO COLD START. The agent has full context.
     v
 [7] Alex investigates with agent assistance
     "Let me look at refresh.ts and compare with
      the session service cleanup from last month"
     |
     | This is a normal agent conversation.
     | Alex's agent reads the files, compares patterns,
     | uses local tools. Alex provides direction.
     |
     | The PACT.md is guiding the agent's understanding
     | of what kind of answer is expected.
     |
     | Emotion: Investigating — focused work
     v
 [8] Alex is satisfied with findings
     "OK, this is definitely the same pattern.
      Let's compose a response."
     |
     v
 [9] Agent composes response
     Uses PACT.md guidance for response structure:
     - Answer (direct yes/no/maybe + explanation)
     - Evidence (what was found)
     - Concerns (anything else to flag)
     - Recommendation (next steps)
     |
     v
 [10] Response presented Plan-style
     +--------------------------------------------------+
     |  COORDINATION RESPONSE — Review Before Sending    |
     +--------------------------------------------------+
     |                                                    |
     |  To: Cory (re: req-20260221-001)                   |
     |  Type: sanity-check                                |
     |                                                    |
     |  Answer: YES — same pattern                        |
     |  "This is the same GC issue from ZD-4102 last      |
     |   month. The fix in session-service was to add      |
     |   explicit cleanup in the finally block."           |
     |                                                    |
     |  Evidence:                                          |
     |  - Compared refresh.ts:L45-90 with                  |
     |    session-service/cleanup.ts:L30-60                |
     |  - Same object retention pattern in both            |
     |                                                    |
     |  Recommendation:                                    |
     |  - Apply the same finally-block cleanup             |
     |  - Reference ZD-4102 commit for the fix pattern     |
     |                                                    |
     +--------------------------------------------------+
     |  [Approve]  [Edit]  [Cancel]                       |
     +--------------------------------------------------+
     |
     | Alex reviews, edits if needed, approves
     | Emotion: Confident — "This is a clear answer"
     v
 [11] Agent calls pact_respond             ──────>  responses/
      - Writes response JSON                          req-20260221-001.json
      - Moves request to completed/
      - git add + commit + push                       requests/completed/
      |                                                req-20260221-001.json
      | Emotion: Done — task complete,
      | response is on its way back to Cory
      v
 [12] Alex continues with other work
      (or checks inbox for more requests)
```

## Step Detail

| # | Action | Tool | Emotion | Shared Artifacts |
|---|--------|------|---------|-----------------|
| 1 | Check inbox | Natural language | Routine | - |
| 2 | Agent pulls and scans | pact_inbox | - | requests/pending/*.json |
| 3 | Inbox listing displayed | Agent output | Aware | Inbox listing |
| 4 | Opens specific request | Natural language | Engaged | - |
| 5 | Agent loads request + PACT.md | Auto-load on request type | - | PACT.md + request JSON |
| 6 | Full request presented | Agent output | Oriented (zero cold-start) | Full context bundle |
| 7 | Investigation with agent | Normal agent session | Focused | Local files + context |
| 8 | Decides response is ready | Natural language | Satisfied | Investigation findings |
| 9 | Agent composes response | PACT.md guided | - | Response draft |
| 10 | Response shown Plan-style | Plan submission UI | Confident | Response JSON (draft) |
| 11 | Response approved and pushed | pact_respond | Done | responses/req-*.json |
| 12 | Moves on | - | Complete | - |

## Key Design Decisions

### Zero Cold-Start (Steps 5-6)
This is the core value proposition for the receiver. When Alex opens the request:
- The PACT.md loads automatically based on request type
- The full context bundle is present (customer, files, findings, question)
- The agent already knows what to investigate and what kind of answer is expected
- Alex does NOT need to: copy-paste from Slack, re-explain context, manually load files

Compare to current workflow: receive markdown on Slack, open new session, paste context,
agent has to re-parse everything, Alex has to explain what they need to do.

### Same Pact File, Both Sides (Step 5)
Alex loads the SAME PACT.md that Cory used to compose the request. This means:
- Both sides understand the same contract
- The pact defines both "how to compose" and "how to respond"
- Alex's agent knows what response fields are expected because the pact says so
- No misalignment between what sender sent and what receiver expects

### Normal Investigation Mode (Step 7)
The investigation itself is a normal agent conversation. Alex is not in a special "coordination mode" — they are just doing their usual work, but with better starting context. The pact provides guidance, not constraints.

### Plan Pattern for Response (Steps 10-11)
Same as the sender side: nothing leaves the machine without human review. Alex sees the composed response, can edit any part, and explicitly approves before push.

## Friction Points

1. **Step 2 — Polling model**: Alex must actively check their inbox. There is no push notification at Tier 1. If Alex does not check, the request sits indefinitely.
   - Mitigation (MVP): Agent checks inbox at session start as a habit or routine
   - Mitigation (Tier 2): Brain service sends Slack/email notification

2. **Step 5 — Pact auto-loading**: If the request type references a pact that does not exist locally (repo out of sync), the agent cannot load it.
   - Mitigation: pact_inbox runs git pull first, which syncs pacts

3. **Step 7 — Local file access**: The context bundle references files in repos Alex may not have cloned (e.g., platform-auth).
   - Mitigation: This is a human decision — Alex needs access to the relevant repos. The PACT does not solve repo access, just context delivery.

## Beads Parallel

The user referenced [Beads](https://github.com/steveyegge/beads) as inspiration for inbox and workflow patterns. The receiver journey parallels Beads' multi-agent handoff model:
- Structured incoming work item with context
- Agent loads context and begins work
- Human guides and approves
- Structured response flows back

Key difference: Beads is local multi-agent within one machine. This PACT is distributed across machines with git as transport, and HITL is mandatory at every node (not optional).
