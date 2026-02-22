Feature: Sender Journey — Compose and Submit a GARP Request
  As a tech support engineer investigating a bug
  I want to send a structured sanity-check request to a colleague
  So that they receive full context and can validate my findings without manual handoff

  Background:
    Given Cory has a working MCP server configured for the "acme-garp" repo
    And Alex is a registered user in the GARP repo
    And the skill file "skills/sanity-check/SKILL.md" exists in the repo

  # --- Happy Path ---

  Scenario: Cory composes a sanity-check request during an investigation
    Given Cory is in an agent session investigating a memory leak in "platform-auth"
    And the agent has examined "src/auth/refresh.ts" lines 45-90
    And the agent has found that refresh tokens are not being garbage collected
    When Cory says "Send a sanity check to Alex about this memory leak pattern"
    Then the agent loads "skills/sanity-check/SKILL.md"
    And the agent assembles a context bundle containing:
      | field                 | value                                                   |
      | customer              | Acme Corp                                               |
      | product               | Platform v3.2                                           |
      | involved_files        | src/auth/refresh.ts:L45-90                              |
      | investigation_so_far  | Refresh tokens not being garbage collected               |
      | question              | Does this match the session service pattern from last month? |
    And the agent presents the composed request for review

  Scenario: Cory reviews and approves the request (Plan submission pattern)
    Given the agent has composed a sanity-check request to Alex
    And the request is presented in Plan submission format showing:
      | section        | visible |
      | recipient      | yes     |
      | request_type   | yes     |
      | question       | yes     |
      | context_bundle | yes     |
    When Cory approves the request
    Then the agent calls garp_request
    And a file is created at "requests/pending/req-20260221-001.json"
    And the file contains the approved request content
    And the agent reports "Request sent to Alex"

  Scenario: Cory edits the request before sending
    Given the agent has composed a sanity-check request to Alex
    And the request is presented in Plan submission format
    When Cory edits the question to "Does this match ZD-4102 from January?"
    And Cory approves the modified request
    Then the agent calls garp_request with the edited content
    And the submitted request contains the updated question

  Scenario: Cory checks status and sees a completed response
    Given Cory submitted request "req-20260221-001" to Alex
    And Alex has responded with findings and a recommendation
    When Cory says "Check on my sanity-check to Alex"
    Then the agent calls garp_status for "req-20260221-001"
    And the status shows "completed"
    And the response is presented in Plan display format showing:
      | section        | value                                          |
      | from           | Alex                                           |
      | answer         | YES — same pattern as ZD-4102                  |
      | evidence       | Compared refresh.ts with session-service cleanup |
      | recommendation | Apply finally-block cleanup, reference ZD-4102  |

  Scenario: Cory checks status on a still-pending request
    Given Cory submitted request "req-20260221-002" to Alex
    And Alex has not yet responded
    When Cory says "What's the status of my request to Alex?"
    Then the agent calls garp_status for "req-20260221-002"
    And the status shows "pending"
    And the agent reports "No response yet from Alex"

  # --- Edge Cases ---

  Scenario: Agent asks for clarification when context is insufficient
    Given Cory is in an agent session with minimal investigation context
    When Cory says "Send a sanity check to Alex"
    Then the agent loads "skills/sanity-check/SKILL.md"
    And the agent identifies missing required fields
    And the agent asks Cory: "What specific question do you want Alex to answer?"
    And the agent asks Cory: "Which files should Alex look at?"

  Scenario: Request submitted from a different session than the investigation
    Given Cory investigated a bug in a previous session that has ended
    When Cory starts a new session and says "Send Alex a sanity check about the Acme Corp memory leak"
    Then the agent loads "skills/sanity-check/SKILL.md"
    And the agent gathers context from Cory's description
    And the agent presents a composed request for review
    And the request can be submitted without the original investigation session

  # --- Error Paths ---

  Scenario: Git push fails due to remote conflict
    Given Cory has approved a request for submission
    When the agent calls garp_request
    And git push fails because the remote has new commits
    Then the MCP server runs git pull --rebase
    And the MCP server retries git push
    And the request is submitted successfully

  Scenario: Recipient not found in repo config
    Given Cory asks to send a request to "bob" who is not in the repo
    When the agent calls garp_request with recipient "bob"
    Then garp_request returns an error: "Recipient 'bob' not found in team config"
    And no file is written to the repo
    And the agent reports the error to Cory
