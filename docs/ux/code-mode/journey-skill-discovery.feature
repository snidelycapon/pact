Feature: Skill Discovery -- Agents Discover and Select Request Types at Runtime
  As a developer who wants to send a GARP request
  I want my agent to discover available request types without upfront knowledge
  So that I can use the right skill without memorizing the catalog or loading all skills at startup

  Background:
    Given the GARP repo has these skills installed:
      | skill          | description                                       |
      | ask            | General question needing another person's view     |
      | code-review    | Request a code review on a branch or changeset     |
      | sanity-check   | Validate findings on a bug investigation           |
      | design-skill   | Collaboratively design a new skill contract        |
    And Cory has a working MCP server configured for the GARP repo
    And the garp_skills tool is registered

  # --- garp_skills: List All ---

  Scenario: Agent lists all available skills without a query
    When Cory's agent calls garp_skills with no query
    Then the result contains 4 skills
    And each skill entry includes:
      | field            | present |
      | name             | yes     |
      | description      | yes     |
      | when_to_use      | yes     |
      | context_fields   | yes     |
      | response_fields  | yes     |
      | skill_path       | yes     |

  Scenario: Skill listing includes field names from SKILL.md
    When Cory's agent calls garp_skills with no query
    Then the "sanity-check" skill entry has context_fields including:
      | field                 |
      | customer              |
      | product               |
      | issue_summary         |
      | involved_files        |
      | investigation_so_far  |
      | question              |
    And the "sanity-check" skill entry has response_fields including:
      | field           |
      | answer          |
      | evidence        |
      | recommendation  |

  # --- garp_skills: Search by Query ---

  Scenario: Agent searches skills by keyword and finds a match
    When Cory's agent calls garp_skills with query "review code"
    Then the result contains at least 1 skill
    And the result includes the "code-review" skill
    And the "code-review" entry has description containing "code review"

  Scenario: Agent searches skills with a query that matches no skills
    When Maria Santos's agent calls garp_skills with query "deploy pipeline"
    Then the result contains 0 skills
    And the result includes no error

  Scenario: Search matches against when_to_use section
    When Cory's agent calls garp_skills with query "second pair of eyes"
    Then the result includes the "sanity-check" skill
    Because the sanity-check when_to_use contains "second pair of eyes"

  # --- garp_skills: Scale ---

  Scenario: Skill listing works with many skills
    Given the GARP repo has 20 skills installed
    When Cory's agent calls garp_skills with no query
    Then the result contains 20 skills
    And the response token cost is less than listing all 20 SKILL.md files

  # --- schema.json: Typed Contracts ---

  Scenario: garp_skills returns field information from schema.json when available
    Given the sanity-check skill has a schema.json with context_bundle and response_bundle schemas
    When Cory's agent calls garp_skills with no query
    Then the "sanity-check" skill entry includes field types from schema.json
    And required fields are distinguished from optional fields

  Scenario: garp_skills falls back to SKILL.md parsing when no schema.json exists
    Given the ask skill has no schema.json
    When Cory's agent calls garp_skills with no query
    Then the "ask" skill entry still includes context_fields and response_fields
    And the fields are extracted from the SKILL.md field tables

  # --- Inbox Enrichment ---

  Scenario: Inbox entries include skill description and response fields
    Given Cory sent a sanity-check request to Dan
    When Dan's agent calls garp_inbox
    Then the inbox entry for the sanity-check request includes:
      | field              | value                                        |
      | skill_description  | Validate findings on a bug investigation     |
      | response_fields    | ["answer", "evidence", "recommendation"]     |

  Scenario: Inbox enrichment does not break when skill has no schema.json
    Given Cory sent an ask request to Dan
    And the ask skill has no schema.json
    When Dan's agent calls garp_inbox
    Then the inbox entry for the ask request includes skill_description
    And response_fields are extracted from SKILL.md

  # --- Schema Validation ---

  Scenario: garp_request warns when context_bundle is missing required fields
    Given the sanity-check skill has a schema.json with required fields:
      | field                 |
      | customer              |
      | product               |
      | issue_summary         |
      | involved_files        |
      | investigation_so_far  |
      | question              |
    When Cory's agent calls garp_request with request_type "sanity-check"
    And the context_bundle is missing "customer" and "product"
    Then the request is submitted successfully (not rejected)
    And the response includes a validation_warnings array
    And the warnings mention "customer" and "product" as missing required fields

  Scenario: garp_request does not warn when all required fields are present
    Given the sanity-check skill has a schema.json
    When Cory's agent calls garp_request with request_type "sanity-check"
    And the context_bundle includes all required fields
    Then the request is submitted successfully
    And the response does not include validation_warnings

  Scenario: garp_request skips validation when no schema.json exists
    Given the ask skill has no schema.json
    When Cory's agent calls garp_request with request_type "ask"
    Then the request is submitted successfully
    And no validation is attempted
    And the response does not include validation_warnings

  # --- Backward Compatibility ---

  Scenario: Existing workflows work without garp_skills
    Given Cory knows the skill name is "sanity-check"
    When Cory's agent calls garp_request with request_type "sanity-check" directly
    Then the request is submitted exactly as it works today
    And garp_skills was never called
    And no behavior has changed

  Scenario: Skills without schema.json work identically to today
    Given the ask skill has only SKILL.md (no schema.json)
    When Cory's agent composes an ask request
    And the agent calls garp_request
    Then the request is submitted identically to today's behavior
    And no schema validation occurs
