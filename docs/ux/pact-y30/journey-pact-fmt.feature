# Journey: Group Envelope Primitives (pact-fmt)
# Epic: pact-y30
# Date: 2026-02-23

Feature: Pact Author adds group defaults to pact definition
  As a team member editing a pact definition
  I want to add a defaults section with group behavior
  So that all future requests of this type behave correctly

  Scenario: Author adds claimable default to code-review pact
    Given a pact definition "code-review" exists with standard frontmatter
    When the author adds a defaults section with "claimable: true"
    And the author omits response_mode and visibility from defaults
    Then the pact definition is valid
    And protocol defaults apply for response_mode (any) and visibility (shared)

  Scenario: Author adds private visibility to assessment pact
    Given a pact definition "architecture-assessment" exists
    When the author adds defaults with "visibility: private" and "response_mode: all"
    Then future requests using this pact will hide responses between recipients
    And all recipients must respond before the request completes

  Scenario: Author writes pact with no defaults section
    Given a pact definition "quick-question" has no defaults section
    Then the protocol defaults apply: response_mode any, visibility shared, claimable false
    And the pact functions as a simple single-or-group request with no claiming

Feature: Sending agent creates a group request
  As an AI agent acting on behalf of a human sender
  I want to send a request to a group of recipients
  So that the right people see it with the right group behavior

  Scenario: Agent sends claimable code review to backend team
    Given the "code-review" pact has defaults claimable: true
    And "@backend-team" resolves to [Maria, Tomás, Kenji, Priya] from config.json
    When the sending agent calls pact_do(action: "send") with:
      | field          | value                                |
      | request_type   | code-review                          |
      | recipients     | [maria, tomas, kenji, priya]         |
      | group_ref      | @backend-team                        |
      | context_bundle | {repository: pact, branch: feature/oauth-cleanup} |
    Then a pending request is created with recipients [maria, tomas, kenji, priya]
    And the request has merged defaults: claimable true, response_mode any, visibility shared
    And the request has group_ref "@backend-team"

  Scenario: Agent confirms group request to sender
    Given a group request was successfully sent to @backend-team
    When the sending agent reports back to the human
    Then the confirmation includes who will see it (Maria, Tomás, Kenji, Priya)
    And the confirmation includes that it is claimable
    And the confirmation includes the request ID for status checking

  Scenario: Agent sends broadcast with no response expected
    Given the "announcement" pact has defaults response_mode: none_required
    When the sending agent sends to @backend-team
    Then the request appears in all recipients' inboxes
    And no response is expected or tracked

Feature: Receiving agent presents group requests in inbox
  As an AI agent monitoring inbox for a recipient
  I want to show group requests alongside direct requests
  So that the human has full visibility of pending work

  Scenario: Inbox shows mixed direct and group requests
    Given Kenji has 1 direct request from Priya
    And Kenji has 2 group requests via @backend-team
    When Kenji's agent calls pact_do(action: "inbox")
    Then all 3 requests appear in a single list
    And each entry shows who it was addressed to ("→ @kenji" or "→ @backend-team")
    And claimable requests show claim status (unclaimed or "Claimed by @name")

  Scenario: Claimed request stays visible to other recipients
    Given a claimable group request was sent to @backend-team
    And Kenji has claimed the request
    When Maria's agent calls pact_do(action: "inbox")
    Then the request still appears in Maria's inbox
    And it shows "Claimed by @kenji"

Feature: Receiving agent claims a group request
  As an AI agent acting on behalf of a recipient
  I want to claim a request before starting work
  So that other recipients know someone is handling it

  Scenario: Agent claims unclaimed request
    Given an unclaimed claimable request exists for @backend-team
    And Kenji asks his agent to claim it
    When the agent calls pact_do(action: "claim", request_id: "req-...")
    Then the request is marked as claimed by Kenji
    And other recipients' inboxes show "Claimed by @kenji"
    And the request remains in pending status

  Scenario: Agent proactively asks about claiming
    Given Kenji's agent shows details of a claimable unclaimed request
    Then the agent proactively asks "Would you like to claim this?"
    And waits for the human's explicit decision before claiming

  Scenario: Agent attempts to claim already-claimed request
    Given a request was claimed by Kenji 30 seconds ago
    When Maria's agent attempts to claim the same request
    Then the claim fails with an "already_claimed" error
    And the agent informs Maria: "This was just claimed by @kenji"

  Scenario: Claim happens before work begins
    Given Kenji wants to review the code in a claimable request
    When Kenji's agent processes the request
    Then the agent claims the request first
    And only after successful claim does the agent begin investigating
    And the investigation (reading code, forming review) may take significant time

Feature: Response completion by mode
  As the PACT system processing responses
  I want to complete requests according to their response_mode
  So that senders know when their request is fulfilled

  Scenario: Any mode — first response completes
    Given a group request with response_mode: any was sent to 4 recipients
    And Kenji has claimed and is working on it
    When Kenji's agent submits a response
    Then the request moves from pending to completed
    And the sender can see the response via check_status

  Scenario: All mode — request stays pending until everyone responds
    Given a group request with response_mode: all was sent to 4 recipients
    When 3 of 4 recipients have responded
    Then the request remains in pending status
    When the 4th recipient responds
    Then the request moves to completed

  Scenario: None_required mode — no response tracking
    Given a broadcast request with response_mode: none_required
    Then the request requires no responses to be considered complete
    And PACT does not track or enforce response collection

Feature: Private visibility controls response exposure
  As a requester needing independent assessments
  I want responses hidden between recipients
  So that respondents aren't influenced by groupthink

  Scenario: Private responses hidden from other respondents
    Given a request with visibility: private was sent to 4 recipients
    And Maria has submitted her response
    When Kenji's agent retrieves information about the request
    Then Kenji cannot see Maria's response
    And Maria cannot see Kenji's response (if he responds later)
    And the requester can see all responses

  Scenario: Shared responses visible to all
    Given a request with visibility: shared (the default)
    And Maria has submitted her response
    When Kenji's agent retrieves information about the request
    Then Kenji can see Maria's response

Feature: Protocol defaults and pact defaults merge correctly
  As the PACT system
  I want to merge protocol defaults with pact-level overrides
  So that pact authors only specify what differs from standard behavior

  Scenario: Pact with no defaults uses protocol defaults
    Given a pact definition with no "defaults:" section
    When a request is created using this pact
    Then response_mode is "any" (protocol default)
    And visibility is "shared" (protocol default)
    And claimable is false (protocol default)

  Scenario: Pact overrides only claimable
    Given a pact definition with defaults: { claimable: true }
    When a request is created using this pact
    Then claimable is true (from pact)
    And response_mode is "any" (protocol default — not in pact)
    And visibility is "shared" (protocol default — not in pact)

  Scenario: Pact overrides all defaults
    Given a pact definition with defaults: { response_mode: all, visibility: private, claimable: false }
    When a request is created using this pact
    Then all three values come from the pact definition
    And no protocol defaults are used

Feature: Error handling for group requests
  As the PACT system
  I want graceful handling of edge cases
  So that agents and humans aren't confused by failures

  Scenario: Race condition — simultaneous claims
    Given a claimable request is unclaimed
    When two agents submit claims within milliseconds
    Then the earlier timestamp wins
    And the losing agent receives an "already_claimed" error
    And the losing agent informs their human who claimed it

  Scenario: No one claims a claimable request
    Given a claimable request has been pending for hours with no claims
    When the sender checks status
    Then they see the request is still pending and unclaimed
    And PACT does not escalate or nudge — the human decides next steps

  Scenario: Cancel group request
    Given a group request was sent to @backend-team
    When the sender cancels the request
    Then the request moves to cancelled for all recipients
    And it no longer appears as actionable in recipients' inboxes
