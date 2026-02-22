Feature: Request Lifecycle Operations — Cancel and Amend
  As a request sender
  I want to cancel or amend a pending request
  So that I can recover from mistakes without manual git operations

  Background:
    Given Cory has a configured MCP server with GARP_USER "cory"
    And the GARP repo has a requests/cancelled/ directory

  # --- Cancel ---

  Scenario: Sender cancels a pending request
    Given Cory sent request "req-20260222-140000-cory-a1b2" to Dan
    And the request is in requests/pending/
    When Cory calls garp_cancel with request_id "req-20260222-140000-cory-a1b2"
    Then the request file is moved to requests/cancelled/
    And the status field in the JSON is updated to "cancelled"
    And the commit message is "[garp] cancelled: req-20260222-140000-cory-a1b2"
    And the change is pushed to the remote

  Scenario: Non-sender cannot cancel a request
    Given Cory sent request "req-20260222-140000-cory-a1b2" to Dan
    And Dan has a configured MCP server with GARP_USER "dan"
    When Dan calls garp_cancel with request_id "req-20260222-140000-cory-a1b2"
    Then garp_cancel returns an error: "Only the sender can cancel a request"
    And the request remains in requests/pending/ unchanged

  Scenario: Cannot cancel a completed request
    Given request "req-20260222-140000-cory-a1b2" has been completed by Dan
    And the request is in requests/completed/
    When Cory calls garp_cancel with request_id "req-20260222-140000-cory-a1b2"
    Then garp_cancel returns an error: "Request is already completed and cannot be cancelled"

  Scenario: Cancel a request that does not exist
    When Cory calls garp_cancel with request_id "req-nonexistent"
    Then garp_cancel returns an error: "Request req-nonexistent not found"

  # --- Amend ---

  Scenario: Sender amends a pending request with additional context
    Given Cory sent request "req-20260222-140000-cory-a1b2" to Dan
    And the request's context_bundle contains question "Is this a memory leak?"
    When Cory calls garp_amend with:
      | field           | value                       |
      | request_id      | req-20260222-140000-cory-a1b2 |
      | amendment.fields | {"zendesk_ticket": "ZD-4521"} |
      | amendment.note   | Added missing ticket reference |
    Then the request JSON now contains an amendments array with 1 entry
    And the amendment entry includes amended_at, amended_by "cory", and the new fields
    And the original context_bundle is unchanged
    And the commit message is "[garp] amended: req-20260222-140000-cory-a1b2"

  Scenario: Multiple amendments append in order
    Given Cory sent request "req-20260222-140000-cory-a1b2" to Dan
    And Cory has already amended once (adding zendesk_ticket)
    When Cory amends again with note "Added file reference" and fields {"involved_files": ["auth.ts"]}
    Then the amendments array has 2 entries in chronological order
    And amendment 1 contains zendesk_ticket
    And amendment 2 contains involved_files

  Scenario: Non-sender cannot amend a request
    Given Cory sent request "req-20260222-140000-cory-a1b2" to Dan
    When Dan calls garp_amend for "req-20260222-140000-cory-a1b2"
    Then garp_amend returns an error: "Only the sender can amend a request"

  # --- Status Consistency ---

  Scenario: Status field matches directory after respond
    Given Cory sent request "req-20260222-140000-cory-a1b2" to Dan
    When Dan calls garp_respond for "req-20260222-140000-cory-a1b2"
    Then the request file in requests/completed/ has status "completed" (not "pending")

  Scenario: Cancelled request visible in garp_status
    Given Cory cancelled request "req-20260222-140000-cory-a1b2"
    When anyone calls garp_status for "req-20260222-140000-cory-a1b2"
    Then the status shows "cancelled"
    And the original request data is still accessible
