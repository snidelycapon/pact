Feature: Attachment Consumer Tooling — Read Side
  As a request recipient
  I want to see attachment details in my inbox and access file paths in status
  So that my agent can read attached files without manual path assembly

  Background:
    Given Dan has a configured MCP server for the shared GARP repo
    And a pending request "req-20260222-140000-cory-a1b2" exists from Cory to Dan
    And the request has 2 attachments:
      | filename           | description                    |
      | auth-refactor.diff | PR diff for review             |
      | test-results.txt   | CI output showing test failures |
    And attachment files exist at "attachments/req-20260222-140000-cory-a1b2/"

  # --- Inbox Attachment Details ---

  Scenario: Inbox shows attachment filenames and descriptions
    When Dan calls garp_inbox
    Then the inbox entry for "req-20260222-140000-cory-a1b2" includes:
      | field              | value                          |
      | attachment_count   | 2                              |
    And the entry includes an attachments list with:
      | filename           | description                    |
      | auth-refactor.diff | PR diff for review             |
      | test-results.txt   | CI output showing test failures |

  Scenario: Inbox for request with no attachments shows empty list
    Given a pending request "req-20260222-150000-cory-e5f6" exists with no attachments
    When Dan calls garp_inbox
    Then the inbox entry for "req-20260222-150000-cory-e5f6" has attachment_count 0
    And no attachments list is present

  # --- Status Attachment Paths ---

  Scenario: Status includes absolute file paths for attachments
    When Dan calls garp_status for "req-20260222-140000-cory-a1b2"
    Then the result includes an attachment_paths field with:
      | filename           | path                                                                |
      | auth-refactor.diff | /absolute/repo/path/attachments/req-20260222-140000-cory-a1b2/auth-refactor.diff |
      | test-results.txt   | /absolute/repo/path/attachments/req-20260222-140000-cory-a1b2/test-results.txt   |
    And each path is an absolute filesystem path the agent can read directly

  Scenario: Status for request without attachments omits attachment_paths
    Given a pending request "req-20260222-150000-cory-e5f6" exists with no attachments
    When Dan calls garp_status for "req-20260222-150000-cory-e5f6"
    Then the result does not include attachment_paths

  # --- Agent Reads Attachments ---

  Scenario: Agent reads attachment content using paths from status
    Given Dan's agent has called garp_status and received attachment paths
    When the agent reads the file at the auth-refactor.diff path
    Then the agent has the full diff content available for review
    And Dan can discuss the diff content in their agent session
