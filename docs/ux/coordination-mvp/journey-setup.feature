Feature: Setup and Onboarding
  As a new team member joining a GARP workspace
  I want to get from zero to a working GARP setup
  So that I can send and receive structured requests with my team

  Background:
    Given a private GitHub repo "acme-garp" exists with the standard directory structure
    And the repo contains a skill file at "skills/sanity-check/SKILL.md"
    And Cory has a working local MCP server configured for "acme-garp"

  # --- Onboarding Journey ---

  Scenario: Alex clones the repo and configures MCP source
    Given Alex has accepted the GitHub invitation for "acme-garp"
    When Alex clones the repo to their local machine
    And Alex adds a GARP MCP source in Craft Agents with:
      | setting    | value                        |
      | GARP_REPO | /Users/alex/repos/acme-garp |
      | GARP_USER | alex                         |
    Then the MCP server starts without errors
    And the MCP server reports 4 available tools:
      | tool           |
      | garp_request  |
      | garp_inbox    |
      | garp_respond  |
      | garp_status   |

  Scenario: Alex sees a pre-seeded welcome request in their inbox
    Given Cory has submitted a welcome request addressed to Alex:
      | field        | value                                              |
      | request_id   | req-welcome-001                                    |
      | request_type | sanity-check                                       |
      | recipient    | alex                                               |
      | summary      | Welcome! Can you verify your setup works by responding to this? |
    And Alex has a configured MCP source for "acme-garp"
    When Alex asks their agent to check the GARP inbox
    Then the agent calls garp_inbox
    And the result shows 1 pending request
    And the request "req-welcome-001" shows sender "Cory" and type "sanity-check"

  Scenario: Alex responds to the welcome request completing the round-trip
    Given Alex has the welcome request "req-welcome-001" in their inbox
    When Alex asks their agent to respond to the welcome request
    Then the agent loads "skills/sanity-check/SKILL.md" for response guidance
    And the agent composes a response and presents it for review
    And Alex approves the response
    And the agent calls garp_respond with the approved response
    And the request "req-welcome-001" moves from "pending" to "completed"
    And a response file exists at "responses/req-welcome-001.json"

  Scenario: Cory verifies the round-trip by checking status
    Given Alex has responded to "req-welcome-001"
    When Cory asks their agent to check the status of "req-welcome-001"
    Then the agent calls garp_status
    And the status shows "completed"
    And the response from Alex is displayed

  # --- Error Paths ---

  Scenario: MCP server rejects invalid repo path
    Given Alex tries to configure MCP source with GARP_REPO "/nonexistent/path"
    When the MCP server attempts to start
    Then the MCP server returns an error indicating the repo path is invalid
    And no tools are exposed

  Scenario: Empty inbox when no requests exist for user
    Given the repo has no pending requests addressed to Alex
    When Alex asks their agent to check the GARP inbox
    Then the agent calls garp_inbox
    And the result shows 0 pending requests
    And the agent reports "No pending requests in your inbox"

  Scenario: Inbox check with network unavailable falls back to local state
    Given Alex has a configured MCP source for "acme-garp"
    And the git remote is unreachable
    When Alex asks their agent to check the GARP inbox
    Then the agent calls garp_inbox
    And the tool reports it is using local state (last pull)
    And any locally cached pending requests are shown
