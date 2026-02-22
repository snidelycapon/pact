Feature: Receiver Journey — Receive, Investigate, and Respond to a Request
  As a colleague receiving a PACT request
  I want to see the full context of what is being asked and respond with structured findings
  So that the sender gets an actionable answer without us juggling context over Slack

  Background:
    Given Alex has a working MCP server configured for the "acme-pact" repo
    And Cory has submitted a sanity-check request "req-20260221-001" addressed to Alex
    And the pact file "pacts/sanity-check/PACT.md" exists in the repo

  # --- Happy Path ---

  Scenario: Alex checks inbox and sees pending requests
    When Alex asks their agent to check the PACT inbox
    Then the agent calls pact_inbox
    And the agent pulls latest from the repo
    And the result shows 1 pending request:
      | field        | value                                              |
      | request_id   | req-20260221-001                                   |
      | type         | sanity-check                                       |
      | from         | Cory                                               |
      | sent         | 2026-02-21 14:00 UTC                               |
      | summary      | Does this memory leak match the session service pattern? |

  Scenario: Alex opens a request and agent auto-loads context and pact
    Given Alex sees "req-20260221-001" in the inbox listing
    When Alex says "Open that request from Cory"
    Then the agent reads the full request JSON from "requests/pending/req-20260221-001.json"
    And the agent auto-loads "pacts/sanity-check/PACT.md" based on request type
    And the agent presents the full context bundle:
      | field                | value                                               |
      | customer             | Acme Corp                                           |
      | product              | Platform v3.2                                       |
      | question             | Does this match the session service pattern?         |
      | involved_files       | src/auth/refresh.ts:L45-90, token-manager.ts:L120-150 |
      | investigation_so_far | Refresh tokens not being garbage collected           |
      | zendesk_ticket       | ZD-4521                                             |

  Scenario: Alex investigates and composes a response
    Given Alex has opened request "req-20260221-001" with full context loaded
    And the agent has read the referenced files from the local repos
    When Alex concludes the investigation and says "Compose a response"
    Then the agent composes a response following the PACT.md response structure:
      | section        | content                                              |
      | answer         | YES - same pattern as ZD-4102                        |
      | evidence       | Compared refresh.ts:L45-90 with cleanup.ts:L30-60   |
      | recommendation | Apply finally-block cleanup, reference ZD-4102       |
    And the response is presented in Plan submission format for review

  Scenario: Alex approves the response and it is pushed back
    Given the agent has composed a response for "req-20260221-001"
    And the response is presented in Plan submission format
    When Alex approves the response
    Then the agent calls pact_respond for "req-20260221-001"
    And a response file is created at "responses/req-20260221-001.json"
    And the request file moves from "requests/pending/" to "requests/completed/"
    And the changes are committed and pushed to the remote
    And the agent confirms "Response sent to Cory"

  # --- Inbox Variations ---

  Scenario: Alex has multiple pending requests
    Given Cory has submitted "req-20260221-001" (sanity-check) addressed to Alex
    And Cory has submitted "req-20260221-003" (sanity-check) addressed to Alex
    When Alex checks the PACT inbox
    Then the inbox shows 2 pending requests ordered by creation time
    And each request shows type, sender, timestamp, and summary

  Scenario: Alex checks inbox with no pending requests
    Given there are no pending requests addressed to Alex
    When Alex checks the PACT inbox
    Then the agent reports "No pending requests in your inbox"

  # --- Edge Cases ---

  Scenario: Alex edits the response before approving
    Given the agent has composed a response for "req-20260221-001"
    And the response is presented in Plan submission format
    When Alex says "Change the recommendation to also mention monitoring the GC metrics"
    Then the agent updates the recommendation field
    And the updated response is presented for review again
    When Alex approves the updated response
    Then the agent calls pact_respond with the edited content

  Scenario: Alex adds their own direction before investigation
    Given Alex has opened request "req-20260221-001" with full context loaded
    When Alex says "Also check the token-cache module, I think that's related"
    Then the agent incorporates Alex's direction into the investigation
    And the agent reads the additional files Alex mentioned
    And the investigation proceeds with both the original context and Alex's additions

  Scenario: Alex cancels a response composition
    Given the agent has composed a response for "req-20260221-001"
    And the response is presented in Plan submission format
    When Alex cancels the response
    Then no response is written to the repo
    And the request remains in "requests/pending/"
    And Alex can continue investigating or compose a new response

  # --- Error Paths ---

  Scenario: Referenced files are in a repo Alex does not have access to
    Given request "req-20260221-001" references files in "platform-auth" repo
    And Alex has not cloned the "platform-auth" repo
    When Alex opens the request and the agent attempts to read the referenced files
    Then the agent reports that the files are not available locally
    And the agent presents the context bundle information (investigation summary, question)
    And Alex can still investigate using the textual context provided

  Scenario: Git push fails when submitting response
    Given Alex has approved a response for submission
    When the agent calls pact_respond
    And git push fails because the remote has new commits
    Then the MCP server runs git pull --rebase
    And the MCP server retries git push
    And the response is submitted successfully
    And Alex is informed the response was sent
