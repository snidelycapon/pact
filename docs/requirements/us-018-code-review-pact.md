# US-018: Code-Review Pact Contract

## Problem (The Pain)
Cory finished a refactor on platform-auth and wants Dan to review the changes before merging. Today, Cory pastes a GitHub PR link in Slack with a message like "Can you look at this? I'm worried about the async error handling." Dan opens the PR, has no idea what the broader context is, spends 10 minutes re-reading the description, and still does not know which parts Cory is uncertain about. The review request lacks structure: no areas of concern, no related tickets, no language hints for the reviewer's agent to use.

## Who (The User)
- Cory, a developer requesting a code review on a specific changeset
- Dan, a reviewer who needs clear context about what changed, why, and where to focus
- Both using agents that can read attached diff files

## Solution (What We Build)
A code-review PACT.md that defines the context bundle fields (repository, branch, language, description, areas_of_concern, related_tickets) and response structure (status, summary, blocking_feedback, advisory_feedback, questions). The pact encourages attaching the diff and test results as files.

## Domain Examples

### Example 1: OAuth Refresh Fix Review
Cory wants Dan to review his fix for the Acme Corp memory leak (platform-auth, branch feature/oauth-refresh-fix). Context bundle: repository "platform-auth", branch "feature/oauth-refresh-fix", language "TypeScript", description "Fixes GC issue with refresh tokens by adding finally-block cleanup to the OAuth refresh cycle", areas_of_concern ["Is the finally block correct for async operations?", "Should we add a timeout to the cleanup?"], related_tickets ["ZD-4521"]. He attaches auth-refactor.diff (the actual changes) and test-results.txt (CI output).

### Example 2: Review Approval With Advisory Notes
Dan reviews the diff, finds no blocking issues, but has a style suggestion. Response: status "approved", summary "Clean fix, matches the session-service pattern from ZD-4102", blocking_feedback [] (empty), advisory_feedback ["Consider extracting the cleanup logic into a shared utility since this pattern appears in 3 places"], questions [].

### Example 3: Review Requesting Changes
Dan reviews a different PR and finds a real issue. Response: status "changes_requested", summary "The approach is right but the error handling needs work", blocking_feedback ["Line 67: the catch block swallows the error -- it should re-throw after cleanup", "Missing test for the timeout edge case"], advisory_feedback ["Consider using a named function for the cleanup callback for readability"], questions ["Is the 30s timeout value from a config or hardcoded?"].

## UAT Scenarios (BDD)

### Scenario: Sender assembles code-review request with attachments
Given Cory tells his agent "Request a code review from Dan for the oauth-refresh-fix branch"
And the agent loads pacts/code-review/PACT.md
When the agent assembles the context bundle
Then the bundle includes repository, branch, language, description, and areas_of_concern
And the agent prompts for any missing required fields
And the agent attaches the diff file using pact_request's attachment parameter

### Scenario: Reviewer receives structured review context
Given Dan receives a code-review request from Cory
When Dan's agent loads the request and PACT.md
Then Dan sees: what repo and branch, what language, what changed and why, specific areas of concern
And the agent can read the attached diff file via the path from pact_status

### Scenario: Reviewer responds with structured feedback
Given Dan has reviewed the code changes
When Dan tells his agent to compose a response
Then the agent structures the response with status, summary, blocking_feedback, advisory_feedback, and questions
And the status field is one of: approved, changes_requested, questions

### Scenario: Multi-round review using thread_id
Given Cory requested a review and Dan responded with "changes_requested"
When Cory addresses the feedback and requests re-review
Then Cory sends a follow-up request with the same thread_id
And Dan sees the thread history including the original review feedback

### Scenario: Pact documents expected attachments
Given a developer reads pacts/code-review/PACT.md
Then the pact includes an "Expected Attachments" section
And it lists diff file and test results as recommended attachments

## Acceptance Criteria
- [ ] PACT.md committed to examples/pacts/code-review/
- [ ] Context bundle fields documented: repository, branch, language, description, areas_of_concern, related_tickets
- [ ] Response structure documented: status (approved/changes_requested/questions), summary, blocking_feedback, advisory_feedback, questions
- [ ] "Expected Attachments" section documents diff file and test results
- [ ] "When To Use" section describes the code-review trigger scenario
- [ ] Single file with sender and receiver guidance
- [ ] At least 1 worked example in the PACT.md
- [ ] Pact exercises attachment feature (diff file as attachment)

## Technical Notes
- Place at examples/pacts/code-review/PACT.md.
- Follow the same structure as design-pact/PACT.md (the most complex existing pact).
- The "Expected Attachments" section is a new convention for pacts. It tells the sender's agent what files to attach and tells the receiver what to expect. This convention should be documented so future pact authors can use it.
- code-review is designed to validate the full Phase 2 feature set: attachments (US-012), threads (US-009/010/011 for multi-round reviews), and lifecycle (US-014 for amending a review request with additional context).

## Dependencies
- US-012 (attachment consumer tooling) for the receiver to access attached diff files
- US-010 (auto thread_id) for multi-round review support
- The pact itself has no code dependencies -- it is a markdown file
