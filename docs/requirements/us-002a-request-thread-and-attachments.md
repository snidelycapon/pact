# US-002a: Thread ID and Attachments on garp_request (Protocol Extension)

**Extends**: US-002 (Submit a GARP Request)

## Problem (The Pain)
Cory is investigating a memory leak with his agent and needs to send a sanity-check request to Alex. The basic request envelope carries structured context, but Cory also needs to: (1) link this request to a previous conversation thread so Alex can see the history, and (2) attach a log file and config snippet that are too large or complex for JSON fields. Without thread linking, multi-round conversations become disconnected. Without attachments, Cory has to paste file contents into the context bundle or describe them in prose, losing fidelity.

## Who (The User)
- Cory, a tech support engineer sending a follow-up request in an ongoing conversation
- Needs to reference a prior thread so the recipient sees the full history
- Needs to attach non-JSON artifacts (logs, diffs, config files) alongside the structured request

## Solution (What We Build)
Extend `garp_request` to accept two optional parameters:
1. **thread_id** — a string that groups related requests into a conversation. When provided, it is included in the request envelope. When omitted, the envelope omits the field (no thread association).
2. **attachments** — an array of `{filename, description, content}` objects. Each attachment's content is written to `attachments/{request_id}/{filename}` on disk. The envelope includes attachment metadata (filename + description, not content). All files are committed atomically with the request envelope in a single git commit.

## Domain Examples

### Example 1: Follow-Up Request with Thread ID
Cory sent a sanity-check request to Alex yesterday (req-20260221-143022-cory-a1b2). Alex responded but Cory has a follow-up question. Cory's agent calls garp_request with `thread_id: "req-20260221-143022-cory-a1b2"`. The new request gets its own unique request_id but shares the thread_id, linking the conversation.

### Example 2: Request with Log File Attachment
Cory is investigating a crash in Acme Corp's Platform v3.2. His agent has captured a 200-line error log. Instead of pasting the log into context_bundle, the agent calls garp_request with an attachment: `{filename: "crash.log", description: "Application error log from 2026-02-21 14:30 UTC", content: "...log contents..."}`. The file is written to `attachments/req-20260221-150000-cory-b2c3/crash.log` and committed with the request.

### Example 3: Request with Multiple Attachments
Cory sends a code review request to Alex with two attachments: a diff file and test output. Both files are written to the `attachments/{request_id}/` directory and the envelope's `attachments` array lists both with their descriptions.

### Example 4: Simple Request Without Thread or Attachments
Cory sends a quick one-off question. No thread_id, no attachments. The envelope is identical to the original US-002 behavior — no thread_id key, no attachments key.

## UAT Scenarios (BDD)

### Scenario: Request with explicit thread_id includes it in envelope
Given Cory has a configured MCP server and Alex is a team member
When the agent calls garp_request with thread_id "req-20260221-143022-cory-a1b2"
Then the JSON envelope in requests/pending/ contains thread_id "req-20260221-143022-cory-a1b2"
And the thread_id is preserved exactly as provided

### Scenario: Request with attachments writes files and includes metadata
Given Cory has a configured MCP server and Alex is a team member
When the agent calls garp_request with attachments:
  | filename   | description            | content          |
  | crash.log  | Application error log  | Error at line 42 |
  | config.yml | Deployment config      | env: production  |
Then files exist at attachments/{request_id}/crash.log and attachments/{request_id}/config.yml
And the envelope contains an attachments array with filename and description (not content)
And all files (envelope + attachments) are committed in a single atomic commit
And the commit is pushed to the remote

### Scenario: Request without thread_id or attachments omits those fields
Given Cory calls garp_request with only required fields (request_type, recipient, context_bundle)
When the request envelope is written
Then the JSON file does not contain a "thread_id" key
And the JSON file does not contain an "attachments" key
And the behavior is identical to original US-002

## Acceptance Criteria
- [ ] garp_request accepts optional thread_id parameter and includes it in the envelope when provided
- [ ] garp_request accepts optional attachments array with {filename, description, content}
- [ ] Attachment files are written to attachments/{request_id}/{filename} on disk
- [ ] Attachment metadata (filename + description, NOT content) is included in the envelope
- [ ] All files (envelope JSON + attachment files) are committed in a single atomic git commit
- [ ] When thread_id is not provided, the envelope omits the thread_id field entirely
- [ ] When attachments are not provided, the envelope omits the attachments field entirely
- [ ] Existing tests for garp_request without thread_id or attachments continue to pass

## Technical Notes
- The `AttachmentInput` interface includes `content: string` for the file body. The `AttachmentSchema` in the envelope only has `{filename, description}` — content is stripped before writing the envelope.
- Attachment files are written via `FilePort.writeText()` which creates directories recursively.
- The `filesToAdd` array includes both the envelope path and all attachment paths, ensuring atomic commit.
- Thread_id is conditionally spread: `...(params.thread_id ? { thread_id: params.thread_id } : {})`.

## Dependencies
- None (extends existing US-002 implementation)
- US-010 will further extend this by auto-assigning thread_id when not provided
- US-012 will surface attachment metadata on the read side (inbox + status)
