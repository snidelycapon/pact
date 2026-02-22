# Journey: Attachment Consumer — Visual Map

## Actors
- **Cory** — Sender who attached files to a request
- **Dan** — Receiver who needs to read the attached files
- **Agent** — MCP tool layer

## Emotional Arc
```
Dan:   Inbox ──> "There are files?" ──> "Where are they?" ──> Reading ──> Informed
       (sees       (sees attachment      (gets file paths)    (agent reads  (full
        request)    count but no paths)                        content)      context)
                         |
                    CURRENT GAP:
                    Attachment metadata exists
                    but receiver has no way to
                    access the actual files.
                    Phase 2 closes this gap.
```

## Flow

```
 DAN'S AGENT SESSION                             COORDINATION REPO
 ====================                              ==================

 [1] Dan checks inbox
     pact_inbox returns:
     +----------------------------------------------------------+
     |  COORDINATION INBOX — 1 pending request                   |
     +----------------------------------------------------------+
     |                                                            |
     |  [1] req-20260222-140000-cory-a1b2                        |
     |      Type: code-review                                     |
     |      From: Cory                                            |
     |      Sent: 2026-02-22 14:00 UTC                            |
     |      Summary: "Review auth refactor in platform-auth"      |
     |      Attachments: 2 files                                  |
     |        - auth-refactor.diff (PR diff for review)           |
     |        - test-results.txt (CI output showing failures)     |
     |                                                            |
     +----------------------------------------------------------+
     |
     | NEW: Inbox now shows attachment filenames and descriptions
     | Previously showed only "attachment_count: 2"
     v
 [2] Dan wants to see the full request details
     "Show me the status of that code review request"
     |
     v
 [3] Agent calls pact_status                <──  requests/pending/
     Returns full request with attachment paths:     req-20260222-...-a1b2.json
     +----------------------------------------------------------+    attachments/
     |  CODE-REVIEW REQUEST — req-20260222-...-a1b2              |      req-20260222-...-a1b2/
     +----------------------------------------------------------+        auth-refactor.diff
     |                                                            |        test-results.txt
     |  From: Cory                                                |
     |  Summary: Review auth refactor in platform-auth            |
     |                                                            |
     |  Attachments:                                              |
     |    [1] auth-refactor.diff                                  |
     |        "PR diff for review"                                |
     |        Path: /path/to/repo/attachments/                    |
     |              req-20260222-...-a1b2/auth-refactor.diff      |
     |                                                            |
     |    [2] test-results.txt                                    |
     |        "CI output showing failures"                        |
     |        Path: /path/to/repo/attachments/                    |
     |              req-20260222-...-a1b2/test-results.txt        |
     |                                                            |
     +----------------------------------------------------------+
     |
     | NEW: Status now includes absolute file paths
     | The agent can read these files directly
     v
 [4] Dan's agent reads the attachments
     Agent uses the file paths to read attachment content.
     No manual path assembly. The paths are right there.
     |
     | Emotion: Informed — "I have everything I need
     | to start the review"
     v
 [5] Dan investigates and responds normally
```

## Step Detail

| # | Action | Tool | What Changed (Phase 2) |
|---|--------|------|----------------------|
| 1 | Check inbox | pact_inbox | Shows attachment filenames + descriptions (not just count) |
| 2 | Request details | Natural language | - |
| 3 | Full request view | pact_status | Includes absolute file paths for each attachment |
| 4 | Read attachments | Agent file read | Agent uses paths from pact_status output |
| 5 | Investigate + respond | pact_respond | No change |

## Key Design Decisions

### Inbox Shows Metadata, Status Shows Paths
pact_inbox is a summary view -- it shows attachment filenames and descriptions for triage decisions. pact_status is the detail view -- it includes full absolute paths so the agent can read attachment content. This avoids bloating the inbox response.

### Absolute Paths
Attachment paths are returned as absolute filesystem paths (repo_path + attachments/{request_id}/{filename}). This lets the agent read them directly without path assembly.

### Pact Attachment Expectations
Pacts can optionally document expected attachments in an "Expected Attachments" section. This tells the sender's agent what files to attach and tells the receiver's agent what to expect.
