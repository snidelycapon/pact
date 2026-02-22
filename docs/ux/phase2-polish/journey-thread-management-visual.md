# Journey: Thread Management — Visual Map

## Actors
- **Cory** — Sender engaged in a multi-round design-skill collaboration
- **Dan** — Recipient responding across rounds
- **Agent** — MCP tool layer (transparent to both users)

## Emotional Arc
```
Cory:  Proposing ──> Waiting ──> "What happened so far?" ──> Oriented ──> Iterating
       (round 1)    (idle)    (needs thread history)        (thread view) (round 2+)
                                    |
                               KEY TRANSITION:
                               From "I have to remember what
                               we discussed" to "the thread
                               has the full conversation"
```

## Flow

```
 MULTI-ROUND COLLABORATION                      COORDINATION REPO
 =============================                    ==================

 [1] Cory sends design-skill request (round 1)
     garp_request(type: "design-skill",
                  recipient: "dan",
                  context_bundle: {skill_name: "code-review",
                                   round: 1, phase: "propose"})
     |
     | No thread_id provided -- this is round 1
     v
 [2] garp_request auto-assigns thread_id    ──>  requests/pending/
     thread_id = request_id                        req-20260222-100000-cory-a1b2.json
     (e.g., "req-20260222-100000-cory-a1b2")      thread_id: "req-20260222-100000-cory-a1b2"
     |
     | Emotion: Confident — thread anchored automatically
     v
 [3] Dan responds to round 1                ──>  responses/
     garp_respond(request_id: "...-a1b2",          req-20260222-100000-cory-a1b2.json
       response_bundle: {status: "needs_revision",
         feedback: "Add language field..."})
     |
     v
 [4] Cory starts round 2 (new session, next day)
     garp_request(type: "design-skill",
                  recipient: "dan",
                  thread_id: "req-20260222-100000-cory-a1b2",
                  context_bundle: {round: 2, phase: "refine",
                                   current_draft: "..."})
     |                                        ──>  requests/pending/
     |                                               req-20260223-090000-cory-c3d4.json
     |                                               thread_id: "req-20260222-...-a1b2"
     v
 [5] Cory wants to see the full conversation
     "Show me the thread for the code-review design"
     |
     v
 [6] Agent calls garp_thread               <──  Scans ALL directories:
     (thread_id: "req-20260222-...-a1b2")         pending/, completed/, cancelled/
     |                                            + responses/
     v
 [7] Thread view displayed
     +----------------------------------------------------------+
     |  THREAD: req-20260222-100000-cory-a1b2                    |
     |  Skill: design-skill | Rounds: 2 | Participants: Cory, Dan|
     +----------------------------------------------------------+
     |                                                            |
     |  Round 1 — 2026-02-22 10:00 UTC                           |
     |    Cory -> Dan (completed)                                 |
     |    Proposed: code-review skill                             |
     |    Dan replied: "needs_revision — Add language field,      |
     |      split response into blocking vs advisory"             |
     |                                                            |
     |  Round 2 — 2026-02-23 09:00 UTC (pending)                 |
     |    Cory -> Dan                                             |
     |    Refined: Added language field, split feedback types     |
     |    Awaiting response                                       |
     |                                                            |
     +----------------------------------------------------------+
     |
     | Emotion: Oriented — "I can see the whole conversation,
     | I know exactly where we left off"
     v
 [8] Meanwhile, Dan checks inbox (thread-aware)
     garp_inbox returns:
     +----------------------------------------------------------+
     |  COORDINATION INBOX — 1 pending request                   |
     +----------------------------------------------------------+
     |                                                            |
     |  [1] Thread: design-skill (2 rounds)                      |
     |      From: Cory                                            |
     |      Latest: 2026-02-23 09:00 UTC                          |
     |      Round 2/refine — code-review skill                    |
     |      "Added language field, split feedback types"           |
     |                                                            |
     +----------------------------------------------------------+
     |
     | NOT shown as 2 separate items.
     | Grouped into 1 thread summary.
     | Emotion: Oriented — clear what this is about
     v
 [9] Dan opens the thread, responds, iteration continues...
```

## Step Detail

| # | Action | Tool | Emotion | Shared Artifacts |
|---|--------|------|---------|-----------------|
| 1 | Send round 1 request | garp_request | Proposing | request JSON |
| 2 | Auto-assign thread_id | garp_request (internal) | Confident | thread_id = request_id |
| 3 | Dan responds round 1 | garp_respond | - | response JSON |
| 4 | Send round 2 request | garp_request (with thread_id) | Iterating | new request JSON, same thread_id |
| 5 | Want to see conversation | Natural language | "Where did we leave off?" | - |
| 6 | Agent queries thread | garp_thread | - | All requests/responses in thread |
| 7 | Thread view displayed | Agent output | Oriented | Thread summary |
| 8 | Dan sees threaded inbox | garp_inbox | Oriented | Grouped inbox entry |
| 9 | Collaboration continues | garp_respond | - | - |

## Key Design Decisions

### Auto Thread ID (Step 2)
When no thread_id is provided, garp_request sets thread_id = request_id. This means every request is always part of a thread (even if a single-round thread). The design-skill contract already documents this convention manually; now the server enforces it.

### Thread Scan Strategy (Step 6)
garp_thread scans ALL directories (pending, completed, cancelled) and responses. A thread spans the full lifecycle. The tool does not filter by status -- it shows the complete history.

### Inbox Grouping (Step 8)
When multiple pending requests share a thread_id, garp_inbox groups them into a single entry showing the latest round. The receiver sees "Thread: design-skill (2 rounds)" instead of 2 separate inbox items. Only requests in pending/ addressed to the current user are grouped.

### Thread Summary Fields
garp_thread returns: participants (unique senders/recipients), round_count, latest_status, and chronological list of request+response pairs.
