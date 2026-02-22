# US-003: Check GARP Inbox (garp_inbox)

## Problem (The Pain)
Alex is a tech support engineer who receives async work requests from colleagues. Today these arrive as Slack messages with markdown attachments -- unstructured, easy to miss, impossible for her agent to parse directly. She needs a way to see what requests are waiting for her, with enough summary information to decide what to handle now.

## Who (The User)
- Alex, colleague receiving GARP requests
- Starts her agent session and wants to know if anyone needs something from her
- Needs a quick summary to triage: what type, who sent it, how urgent, what's the ask

## Solution (What We Build)
An MCP tool `garp_inbox` that pulls the latest from the GARP repo, scans `requests/pending/` for files where the recipient matches the current user, and returns a list of pending requests with summary information.

## Domain Examples

### Example 1: One Pending Sanity-Check Request
Alex starts a new Craft Agents session and says "Check my GARP inbox." The agent calls garp_inbox. The tool runs `git pull`, scans `requests/pending/`, finds `req-20260221-143022-cory.json` addressed to user_id "alex" with type "sanity-check" from Cory. Returns: 1 pending request with ID, type, sender display name, creation timestamp, and the question from the context bundle.

### Example 2: Empty Inbox
Alex checks her inbox but no one has sent her anything. garp_inbox returns 0 pending requests. The agent reports "No pending requests in your inbox."

### Example 3: Multiple Requests from Different Senders
Alex has two pending requests: one sanity-check from Cory about a memory leak, and another sanity-check from Dana about a deployment issue. garp_inbox returns both, ordered by creation time (oldest first). Alex can see at a glance what each one is about and decide which to handle first.

## UAT Scenarios (BDD)

### Scenario: Retrieve pending requests for the current user
Given the GARP repo contains:
  | file                              | recipient | sender | type          | created_at          |
  | requests/pending/req-001.json     | alex      | cory   | sanity-check  | 2026-02-21T14:00:00Z |
And GARP_USER is set to "alex"
When the agent calls garp_inbox
Then the tool runs git pull
And returns 1 pending request with:
  | field        | value                |
  | request_id   | req-001              |
  | request_type | sanity-check         |
  | sender       | Cory                 |
  | created_at   | 2026-02-21T14:00:00Z |

### Scenario: Empty inbox returns zero results
Given the GARP repo has no pending requests addressed to "alex"
And GARP_USER is set to "alex"
When the agent calls garp_inbox
Then the tool runs git pull
And returns 0 pending requests

### Scenario: Only show requests addressed to the current user
Given the GARP repo contains:
  | file                              | recipient | sender |
  | requests/pending/req-001.json     | alex      | cory   |
  | requests/pending/req-002.json     | cory      | alex   |
  | requests/pending/req-003.json     | alex      | dana   |
And GARP_USER is set to "alex"
When the agent calls garp_inbox
Then the tool returns 2 pending requests (req-001 and req-003)
And req-002 is NOT included (addressed to cory, not alex)

### Scenario: Requests ordered by creation time
Given Alex has 3 pending requests created at different times
When the agent calls garp_inbox
Then the requests are returned ordered by created_at ascending (oldest first)

### Scenario: Inbox check with git pull failure falls back to local state
Given GARP_USER is set to "alex"
And the git remote is unreachable
When the agent calls garp_inbox
Then the tool attempts git pull and it fails
And the tool scans the local repo state (last successful pull)
And returns any locally known pending requests
And includes a warning that results may be stale

## Acceptance Criteria
- [ ] garp_inbox runs git pull before scanning
- [ ] Only returns requests where recipient.user_id matches GARP_USER
- [ ] Returns request_id, request_type, sender display_name, created_at for each result
- [ ] Returns a summary field from the context bundle (question or issue_summary) for triage
- [ ] Results ordered by created_at ascending
- [ ] Returns count of 0 with no error when inbox is empty
- [ ] Falls back to local state with warning when git pull fails

## Technical Notes
- The summary field extracted from context_bundle is best-effort: try `question`, then `issue_summary`, then first 200 chars of the bundle. The MCP server does not know the skill schema.
- git pull should have a timeout to avoid hanging the tool call when the network is slow.
- garp_inbox does NOT move files or change state -- it is a read-only operation.
- Consider including the skill file content in the response payload so the agent does not need a separate file read to auto-load the skill. This is a DESIGN wave decision.
