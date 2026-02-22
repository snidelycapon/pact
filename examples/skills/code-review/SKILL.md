# Code Review

Request a code review on a branch, PR, or changeset. The sender provides structured context about what changed and why, attaches the diff, and flags areas of concern. The reviewer responds with structured feedback split into blocking vs advisory categories.

## When To Use

- You finished a feature branch or bug fix and want a teammate to review before merging
- You want to flag specific areas of concern so the reviewer knows where to focus
- You need structured feedback that distinguishes blocking issues from suggestions

## Context Bundle Fields

| Field | Required | Description |
|-------|----------|-------------|
| repository | yes | Repository name (e.g. `platform-auth`) |
| branch | yes | Branch name or PR reference (e.g. `feature/oauth-refresh-fix`) |
| language | yes | Primary programming language (e.g. `TypeScript`) |
| description | yes | What changed and why -- enough context for the reviewer to understand the goal |
| areas_of_concern | no | Specific areas the sender is uncertain about and wants the reviewer to focus on |
| related_tickets | no | Related issue or ticket IDs (e.g. `["ZD-4521"]`) |

## Expected Attachments

Attachments give the reviewer direct access to the changes and supporting artifacts. Attach files using the `attachments` parameter on `garp_request`.

| Attachment | Recommended | Filename Convention | Description |
|------------|-------------|---------------------|-------------|
| Diff file | yes | `{branch-name}.diff` | The actual code changes. Generate with `git diff main...HEAD > branch-name.diff`. This is the primary artifact the reviewer reads. |
| Test results | no | `test-results.txt` | CI or local test output. Helps the reviewer verify tests pass and see coverage. |

## Response Structure

| Field | Required | Description |
|-------|----------|-------------|
| status | yes | `approved` -- good to merge; `changes_requested` -- fix blocking issues first; `questions` -- need clarification before reviewing |
| summary | yes | Overall assessment in 1-2 sentences |
| blocking_feedback | yes | Issues that must be fixed before merging (array, may be empty) |
| advisory_feedback | no | Suggestions and style notes that are non-blocking (array) |
| questions | no | Clarifying questions for the sender (array) |

## Multi-Round Reviews

Code reviews are often iterative. Use `thread_id` to link follow-up rounds into a single conversation.

1. Sender requests a review (round 1 creates the thread)
2. Reviewer responds with `changes_requested` and blocking feedback
3. Sender addresses feedback, attaches an updated diff, and sends a follow-up request with the same `thread_id`
4. Reviewer responds with `approved` when blocking issues are resolved

## Example

**Sender's request:**

```
garp_request(
  request_type: "code-review",
  recipient: "dan",
  context_bundle: { ... },
  attachments: ["oauth-refresh-fix.diff", "test-results.txt"]
)
```

**Context bundle:**
```json
{
  "repository": "platform-auth",
  "branch": "feature/oauth-refresh-fix",
  "language": "TypeScript",
  "description": "Fixes GC issue with OAuth refresh tokens by adding finally-block cleanup to the refresh cycle. The token cache was holding references after expiry, causing memory growth under sustained load.",
  "areas_of_concern": [
    "Is the finally block correct for async operations?",
    "Should we add a timeout to the cleanup?"
  ],
  "related_tickets": ["ZD-4521"]
}
```

**Reviewer's response (changes requested):**
```json
{
  "status": "changes_requested",
  "summary": "The approach is right but the error handling in the cleanup path needs work.",
  "blocking_feedback": [
    "Line 67: the catch block swallows the error -- it should re-throw after cleanup",
    "Missing test for the timeout edge case when cleanup exceeds 5s"
  ],
  "advisory_feedback": [
    "Consider extracting the cleanup logic into a shared utility since this pattern appears in 3 places"
  ],
  "questions": []
}
```

**Follow-up round (sender addresses feedback):**

```
garp_request(
  request_type: "code-review",
  recipient: "dan",
  thread_id: "req-20260221-143022-cory-a1b2",
  context_bundle: { ... },
  attachments: ["oauth-refresh-fix-v2.diff"]
)
```

```json
{
  "repository": "platform-auth",
  "branch": "feature/oauth-refresh-fix",
  "language": "TypeScript",
  "description": "Addressed review feedback: re-throw after cleanup, added timeout test. Also extracted cleanup into shared utility per advisory suggestion.",
  "areas_of_concern": [
    "Is the shared utility placement correct in src/utils/token-cleanup.ts?"
  ]
}
```

**Reviewer's response (approved):**
```json
{
  "status": "approved",
  "summary": "Clean fix. The shared utility is in the right place and the timeout test covers the edge case.",
  "blocking_feedback": [],
  "advisory_feedback": [
    "Nice cleanup extraction -- consider adding a JSDoc comment to the utility so others find it"
  ]
}
```
