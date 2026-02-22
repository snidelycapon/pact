Feature: Thread Management — Multi-Round Conversations
  As a user engaged in a multi-round collaboration
  I want to see the full conversation history and have threads managed automatically
  So that I can track where a conversation left off without manual bookkeeping

  Background:
    Given Cory and Dan both have configured MCP servers for the shared PACT repo
    And the pact file "pacts/design-pact/PACT.md" exists in the repo

  # --- Auto Thread ID ---

  Scenario: First request in a conversation auto-assigns thread_id
    Given Cory sends a design-pact request to Dan with no thread_id
    And the context_bundle contains pact_name "code-review", round 1, phase "propose"
    When pact_request creates the request envelope
    Then the envelope's thread_id equals the generated request_id
    And the committed JSON file contains the thread_id field

  Scenario: Follow-up request preserves the provided thread_id
    Given Cory previously sent request "req-20260222-100000-cory-a1b2" (round 1)
    When Cory sends a new design-pact request with thread_id "req-20260222-100000-cory-a1b2"
    And the context_bundle contains round 2, phase "refine"
    Then the new request's thread_id is "req-20260222-100000-cory-a1b2"
    And the new request has its own unique request_id

  # --- pact_thread Tool ---

  Scenario: View thread history for a multi-round conversation
    Given the PACT repo contains these requests in thread "req-20260222-100000-cory-a1b2":
      | request_id                          | status    | round | created_at           |
      | req-20260222-100000-cory-a1b2       | completed | 1     | 2026-02-22T10:00:00Z |
      | req-20260223-090000-cory-c3d4       | pending   | 2     | 2026-02-23T09:00:00Z |
    And a response exists for "req-20260222-100000-cory-a1b2" from Dan
    When Cory calls pact_thread with thread_id "req-20260222-100000-cory-a1b2"
    Then the result contains 2 entries ordered chronologically
    And entry 1 shows round 1 (completed) with Dan's response
    And entry 2 shows round 2 (pending) with no response
    And participants lists Cory and Dan
    And round_count is 2

  Scenario: View thread for a single-round completed request
    Given request "req-20260222-100000-cory-a1b2" is completed with a response
    And no other requests share that thread_id
    When Cory calls pact_thread with thread_id "req-20260222-100000-cory-a1b2"
    Then the result contains 1 entry showing the request and response
    And round_count is 1

  Scenario: Thread not found returns empty result
    Given no requests exist with thread_id "req-nonexistent"
    When Cory calls pact_thread with thread_id "req-nonexistent"
    Then the result contains 0 entries
    And a message indicates "No requests found for this thread"

  # --- Thread-Aware Inbox ---

  Scenario: Inbox groups pending requests by thread
    Given Dan has these pending requests:
      | request_id                    | thread_id                     | round | sender |
      | req-20260222-100000-cory-a1b2 | req-20260222-100000-cory-a1b2 | 1     | Cory   |
      | req-20260223-090000-cory-c3d4 | req-20260222-100000-cory-a1b2 | 2     | Cory   |
      | req-20260223-110000-cory-e5f6 | req-20260223-110000-cory-e5f6 | 1     | Cory   |
    When Dan calls pact_inbox
    Then the inbox shows 2 items (not 3)
    And item 1 is a thread group with thread_id "req-20260222-...-a1b2" showing "2 rounds"
    And item 2 is a standalone request "req-20260223-...-e5f6"
    And the thread group shows the latest round's summary

  Scenario: Inbox shows standalone requests normally when no thread grouping applies
    Given Dan has 1 pending request with a unique thread_id (no other requests in that thread)
    When Dan calls pact_inbox
    Then the inbox shows 1 item displayed as a normal request (not grouped)
