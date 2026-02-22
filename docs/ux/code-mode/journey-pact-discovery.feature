Feature: Pact Discovery -- Agents Discover and Select Request Types at Runtime
  As a developer who wants to send a PACT request
  I want my agent to discover available request types without upfront knowledge
  So that I can use the right pact without memorizing the catalog or loading all pacts at startup

  Background:
    Given the PACT repo has these pacts installed:
      | pact          | description                                       |
      | ask            | General question needing another person's view     |
      | code-review    | Request a code review on a branch or changeset     |
      | sanity-check   | Validate findings on a bug investigation           |
      | design-pact   | Collaboratively design a new pact        |
    And Cory has a working MCP server configured for the PACT repo
    And the pact_pacts tool is registered

  # --- pact_pacts: List All ---

  Scenario: Agent lists all available pacts without a query
    When Cory's agent calls pact_pacts with no query
    Then the result contains 4 pacts
    And each pact entry includes:
      | field            | present |
      | name             | yes     |
      | description      | yes     |
      | when_to_use      | yes     |
      | context_fields   | yes     |
      | response_fields  | yes     |
      | pact_path       | yes     |

  Scenario: Pact listing includes field names from PACT.md
    When Cory's agent calls pact_pacts with no query
    Then the "sanity-check" pact entry has context_fields including:
      | field                 |
      | customer              |
      | product               |
      | issue_summary         |
      | involved_files        |
      | investigation_so_far  |
      | question              |
    And the "sanity-check" pact entry has response_fields including:
      | field           |
      | answer          |
      | evidence        |
      | recommendation  |

  # --- pact_pacts: Search by Query ---

  Scenario: Agent searches pacts by keyword and finds a match
    When Cory's agent calls pact_pacts with query "review code"
    Then the result contains at least 1 pact
    And the result includes the "code-review" pact
    And the "code-review" entry has description containing "code review"

  Scenario: Agent searches pacts with a query that matches no pacts
    When Maria Santos's agent calls pact_pacts with query "deploy pipeline"
    Then the result contains 0 pacts
    And the result includes no error

  Scenario: Search matches against when_to_use section
    When Cory's agent calls pact_pacts with query "second pair of eyes"
    Then the result includes the "sanity-check" pact
    Because the sanity-check when_to_use contains "second pair of eyes"

  # --- pact_pacts: Scale ---

  Scenario: Pact listing works with many pacts
    Given the PACT repo has 20 pacts installed
    When Cory's agent calls pact_pacts with no query
    Then the result contains 20 pacts
    And the response token cost is less than listing all 20 PACT.md files

  # --- schema.json: Typed Contracts ---

  Scenario: pact_pacts returns field information from schema.json when available
    Given the sanity-check pact has a schema.json with context_bundle and response_bundle schemas
    When Cory's agent calls pact_pacts with no query
    Then the "sanity-check" pact entry includes field types from schema.json
    And required fields are distinguished from optional fields

  Scenario: pact_pacts falls back to PACT.md parsing when no schema.json exists
    Given the ask pact has no schema.json
    When Cory's agent calls pact_pacts with no query
    Then the "ask" pact entry still includes context_fields and response_fields
    And the fields are extracted from the PACT.md field tables

  # --- Inbox Enrichment ---

  Scenario: Inbox entries include pact description and response fields
    Given Cory sent a sanity-check request to Dan
    When Dan's agent calls pact_inbox
    Then the inbox entry for the sanity-check request includes:
      | field              | value                                        |
      | pact_description  | Validate findings on a bug investigation     |
      | response_fields    | ["answer", "evidence", "recommendation"]     |

  Scenario: Inbox enrichment does not break when pact has no schema.json
    Given Cory sent an ask request to Dan
    And the ask pact has no schema.json
    When Dan's agent calls pact_inbox
    Then the inbox entry for the ask request includes pact_description
    And response_fields are extracted from PACT.md

  # --- Schema Validation ---

  Scenario: pact_request warns when context_bundle is missing required fields
    Given the sanity-check pact has a schema.json with required fields:
      | field                 |
      | customer              |
      | product               |
      | issue_summary         |
      | involved_files        |
      | investigation_so_far  |
      | question              |
    When Cory's agent calls pact_request with request_type "sanity-check"
    And the context_bundle is missing "customer" and "product"
    Then the request is submitted successfully (not rejected)
    And the response includes a validation_warnings array
    And the warnings mention "customer" and "product" as missing required fields

  Scenario: pact_request does not warn when all required fields are present
    Given the sanity-check pact has a schema.json
    When Cory's agent calls pact_request with request_type "sanity-check"
    And the context_bundle includes all required fields
    Then the request is submitted successfully
    And the response does not include validation_warnings

  Scenario: pact_request skips validation when no schema.json exists
    Given the ask pact has no schema.json
    When Cory's agent calls pact_request with request_type "ask"
    Then the request is submitted successfully
    And no validation is attempted
    And the response does not include validation_warnings

  # --- Backward Compatibility ---

  Scenario: Existing workflows work without pact_pacts
    Given Cory knows the pact name is "sanity-check"
    When Cory's agent calls pact_request with request_type "sanity-check" directly
    Then the request is submitted exactly as it works today
    And pact_pacts was never called
    And no behavior has changed

  Scenario: Pacts without schema.json work identically to today
    Given the ask pact has only PACT.md (no schema.json)
    When Cory's agent composes an ask request
    And the agent calls pact_request
    Then the request is submitted identically to today's behavior
    And no schema validation occurs
