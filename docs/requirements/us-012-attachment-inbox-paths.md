# US-012: Attachment Details in Inbox and Status (garp_inbox + garp_status modification)

## Problem (The Pain)
Dan receives a code-review request from Cory that includes a diff file and test results as attachments. The inbox shows "attachment_count: 2" but no filenames, descriptions, or file paths. Dan's agent knows attachments exist but cannot tell Dan what they are or read them. Dan has to ask the agent to guess the file paths or manually navigate the repo's attachments/ directory. The write side of attachments works; the read side is missing.

## Who (The User)
- Dan, a developer receiving requests with attached files
- Working through an agent that needs file paths to read content
- Needs to know what is attached (inbox triage) and where to find it (investigation)

## Solution (What We Build)
Modify garp_inbox to include attachment filenames and descriptions in each inbox entry. Modify garp_status to include absolute file paths for each attachment so the agent can read them directly.

## Domain Examples

### Example 1: Inbox Shows Attachment Metadata for Triage
Dan checks his inbox and sees a code-review request from Cory with "2 attachments: auth-refactor.diff (PR diff for review), test-results.txt (CI output showing failures)." Dan now knows what Cory attached without opening the full request. He can decide whether to handle it now based on what files are involved.

### Example 2: Status Provides Absolute Paths for Agent File Access
Dan opens the code-review request and his agent calls garp_status. The result includes attachment_paths with absolute paths like "/Users/dan/acme-garp/attachments/req-20260222-140000-cory-a1b2/auth-refactor.diff". The agent reads the diff file directly using this path. No path guessing or manual navigation needed.

### Example 3: Request With No Attachments
Dan opens a simple ask request from Maria Santos that has no attachments. The inbox entry shows attachment_count 0 and no attachments list. garp_status returns the request without an attachment_paths field. The agent proceeds normally.

## UAT Scenarios (BDD)

### Scenario: Inbox entry includes attachment filenames and descriptions
Given a pending request "req-20260222-140000-cory-a1b2" to Dan with attachments:
  | filename           | description                     |
  | auth-refactor.diff | PR diff for review              |
  | test-results.txt   | CI output showing test failures |
When Dan calls garp_inbox
Then the inbox entry includes an attachments array with:
  | filename           | description                     |
  | auth-refactor.diff | PR diff for review              |
  | test-results.txt   | CI output showing test failures |
And attachment_count is 2

### Scenario: Status includes absolute file paths for attachments
Given a pending request "req-20260222-140000-cory-a1b2" to Dan with 2 attachments
And the GARP repo is at "/Users/dan/acme-garp"
When Dan calls garp_status for "req-20260222-140000-cory-a1b2"
Then the result includes attachment_paths:
  | filename           | path                                                                          |
  | auth-refactor.diff | /Users/dan/acme-garp/attachments/req-20260222-140000-cory-a1b2/auth-refactor.diff |
  | test-results.txt   | /Users/dan/acme-garp/attachments/req-20260222-140000-cory-a1b2/test-results.txt   |

### Scenario: Request with no attachments omits attachment fields gracefully
Given a pending request "req-20260222-150000-maria-g7h8" to Dan with no attachments
When Dan calls garp_inbox
Then the inbox entry has attachment_count 0
And no attachments array is present
When Dan calls garp_status for "req-20260222-150000-maria-g7h8"
Then no attachment_paths field is present in the result

### Scenario: Attachment paths use the configured repo path
Given the GARP repo is configured at "/Users/dan/work/acme-garp"
And a request has attachment "design-doc.md"
When Dan calls garp_status for that request
Then the attachment path starts with "/Users/dan/work/acme-garp/attachments/"

## Acceptance Criteria
- [ ] garp_inbox entries include attachment filenames and descriptions (not just count)
- [ ] garp_status includes absolute file paths for each attachment
- [ ] Absolute paths are constructed from repoPath + attachments/{request_id}/{filename}
- [ ] Requests without attachments omit attachment metadata gracefully (no empty arrays)
- [ ] Existing inbox and status behavior unchanged for requests without attachments

## Technical Notes
- Inbox change: in handleGarpInbox (src/tools/garp-inbox.ts), the InboxEntry already has `attachment_count`. Add an optional `attachments?: Array<{filename: string, description: string}>` field. Populate from the request envelope's attachments array.
- Status change: in handleGarpStatus (src/tools/garp-status.ts), add an `attachment_paths?: Array<{filename: string, description: string, path: string}>` field to GarpStatusResult. Construct paths using `join(ctx.repoPath, 'attachments', requestId, filename)`.
- The attachment files already exist on disk (written by garp_request). This story only surfaces them to the read side.

## Dependencies
- None (attachment write side already exists in garp_request)
- Beneficial to implement before US-017 (code-review skill) which exercises attachments
