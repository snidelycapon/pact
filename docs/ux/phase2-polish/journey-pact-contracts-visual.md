# Journey: New Pacts — Visual Map

## Actors
- **Cory** — Sender who uses structured pact types for different coordination needs
- **Dan** — Recipient who receives pact-typed requests with clear contracts

## Emotional Arc
```
Cory:  "I need a review" ──> Structured ──> Sent ──> Clear response
       (vague need)          (pact guides   (right   (pact-typed
                              what to send)   format)  response)
                                   |
                              KEY VALUE:
                              Different coordination needs
                              get different contracts.
                              Not everything is a generic "ask."
```

## Pact: sanity-check

```
PURPOSE: "Look at this thing I found — does it make sense?"

The original validated use case. A developer investigating a bug
wants another set of eyes. Rich context bundle with customer info,
files, investigation history, and a specific question.

PATTERN: Ping-pong (one round typical, occasionally 2)

 Cory's Session                              Dan's Session
 ==============                              ==============

 [1] Investigating Acme Corp memory leak
     Found pattern in refresh.ts
     Not sure if it matches last month
     |
     v
 [2] "Send a sanity check to Dan"
     Agent loads pacts/sanity-check/PACT.md
     |
     v
 [3] Context bundle assembled:
     +------------------------------------------+
     |  customer: Acme Corp                      |
     |  product: Platform v3.2                   |
     |  ticket: ZD-4521                          |
     |  involved_files:                          |
     |    - src/auth/refresh.ts:L45-90           |
     |    - src/oauth/token-manager.ts:L120-150  |
     |  investigation_so_far:                    |
     |    "Refresh tokens not GC'd after         |
     |     OAuth refresh cycle"                  |
     |  question:                                |
     |    "Does this match the session service   |
     |     pattern from last month?"             |
     +------------------------------------------+
                                                  [4] Dan sees full context
                                                      Zero cold-start
                                                      |
                                                      v
                                                  [5] Investigates, responds:
                                                      answer: "YES, same pattern"
                                                      evidence: "Compared with..."
                                                      recommendation: "Apply
                                                        finally-block cleanup"
```

## Pact: code-review

```
PURPOSE: "Review these code changes — here's the diff and context."

A structured code review request. Differs from sanity-check in that
it centers on a specific changeset (diff, PR, branch) rather than
an investigation finding.

PATTERN: Ping-pong (may go 2-3 rounds for revision requests)

CONTEXT BUNDLE:
  +------------------------------------------+
  |  repository: platform-auth               |
  |  branch: feature/oauth-refresh-fix       |
  |  language: TypeScript                    |
  |  description:                            |
  |    "Fixes GC issue with refresh tokens.  |
  |     Adds finally-block cleanup to the    |
  |     OAuth refresh cycle."                |
  |  areas_of_concern:                       |
  |    - "Is the finally block correct for   |
  |       async operations?"                 |
  |    - "Should we add a timeout?"          |
  |  related_tickets: ["ZD-4521"]            |
  +------------------------------------------+

EXPECTED ATTACHMENTS:
  - Diff file (the actual code changes)
  - Test results (CI output, if relevant)

RESPONSE STRUCTURE:
  | Field              | Description                          |
  |status              | approved / changes_requested / questions |
  |summary             | Overall assessment                   |
  |blocking_feedback   | Issues that must be fixed            |
  |advisory_feedback   | Suggestions, style notes             |
  |questions           | Things the reviewer needs clarified  |
```

## Pact: standup (Optional)

```
PURPOSE: "What did you work on? What's next? Any blockers?"

A lightweight status-check pact. Interesting because it tests
whether PACT works for routine, low-context requests — not
just rich investigations.

PATTERN: Single round

CONTEXT BUNDLE:
  +------------------------------------------+
  |  period: "2026-02-21"                    |
  |  question: "What did you work on today?  |
  |    What's planned for tomorrow?          |
  |    Any blockers?"                        |
  +------------------------------------------+

RESPONSE STRUCTURE:
  | Field      | Description                    |
  |done        | What was completed             |
  |next        | What's planned                 |
  |blockers    | Anything blocking progress     |
```

## Key Design Decisions

### Minimum Viable Pact Set
Phase 2 commits to sanity-check and code-review. These cover the two most common coordination patterns: "validate my finding" and "review my code." Additional pacts (standup, incident-handoff) are optional stretch goals.

### Attachment Integration
code-review is designed to exercise the attachment feature. The diff file and test results are attached, not pasted into the context bundle. This validates that the write side (pact_request attachments) and read side (Phase 2 attachment consumer tooling) work together end-to-end.

### Thread Integration
code-review may go multiple rounds (reviewer requests changes, sender updates, reviewer re-reviews). This exercises thread_id for a real multi-round workflow beyond design-pact.
