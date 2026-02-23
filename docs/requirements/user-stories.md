# User Stories: pact-fmt (Group Envelope Primitives)

**Epic**: pact-y30
**Date**: 2026-02-23
**Author**: Luna (nw-product-owner)
**Journey**: docs/ux/pact-y30/journey-pact-fmt-visual.md

---

## US-1: Group Defaults in Pact Definitions

### Problem (The Pain)
Tomás is a backend team lead at a 12-person engineering org who defines pact types for his team. When he creates a `code-review` pact, he has no way to specify that reviews should be claimable — every team member using the pact has to coordinate manually who's taking each review, leading to duplicate work or reviews falling through the cracks.

### Who (The User)
- Team member who writes or edits pact definition files (PACT.md)
- Comfortable with YAML frontmatter (they already write pact context/response bundles)
- Motivated by reducing coordination overhead for their team

### Solution (What We Build)
A `defaults:` section in pact YAML frontmatter where authors specify group behavior (response_mode, visibility, claimable). Fields that match protocol defaults are omitted — convention over configuration.

### Domain Examples

#### Example 1: Claimable code review (happy path)
Tomás edits `pacts/code-review/PACT.md` and adds `defaults: { claimable: true }`. He omits response_mode and visibility because the protocol defaults (any, shared) are exactly what he wants. Next time Cory's agent sends a code review to @backend-team, the request is automatically claimable.

#### Example 2: Private architecture assessment
Maria creates `pacts/arch-assessment/PACT.md` with `defaults: { visibility: private, response_mode: all }`. When the CTO's agent sends an assessment request, each team member responds independently without seeing others' takes. The CTO sees all responses.

#### Example 3: FYI broadcast pact
Kenji defines `pacts/announcement/PACT.md` with `defaults: { response_mode: none_required }`. Announcements sent with this pact appear in inboxes but expect no response.

### UAT Scenarios (BDD)

#### Scenario: Pact with claimable default
Given Tomás has a pact definition "code-review" with defaults `{ claimable: true }`
When Cory's agent calls pact_discover(keyword: "code-review")
Then the returned metadata includes defaults with claimable: true
And response_mode defaults to "any" (protocol default)
And visibility defaults to "shared" (protocol default)

#### Scenario: Pact with no defaults section
Given Kenji has a pact definition "quick-question" with no defaults section
When an agent calls pact_discover(keyword: "quick-question")
Then the returned metadata includes protocol defaults: response_mode "any", visibility "shared", claimable false

#### Scenario: Pact with all defaults specified
Given Maria has a pact definition with defaults `{ response_mode: all, visibility: private, claimable: false }`
When an agent discovers this pact
Then all three values come from the pact definition, not protocol defaults

### Acceptance Criteria
- [ ] PactMetadata schema includes optional `defaults` field with response_mode, visibility, claimable
- [ ] pact_discover returns merged defaults (protocol + pact-level) for each pact
- [ ] Pact files with no defaults section return protocol defaults
- [ ] Only valid enum values accepted: response_mode ∈ {any, all, none_required}, visibility ∈ {shared, private}, claimable ∈ {true, false}

### Technical Notes
- Breaking change to PactMetadata interface (additive — new optional field)
- pact-loader.ts needs to parse `defaults:` from YAML frontmatter
- pact-discover.ts needs to merge protocol defaults with pact defaults before returning
- Depends on: pact-format-spec.md update (pact-fmt task)

---

## US-2: Send Group Requests to Multiple Recipients

### Problem (The Pain)
Cory is a developer who needs a code review from his backend team. Currently he can only send a request to one person — he has to guess who's available, and if that person is busy, the review sits idle. He wants to send one request to the whole team and let someone volunteer.

### Who (The User)
- Developer whose agent sends requests on their behalf
- Works on a team of 10-12 people organized into groups
- Motivated by getting faster responses without manual coordination

### Solution (What We Build)
Extend the RequestEnvelope to support `recipients: UserRef[]` (replacing singular `recipient`), with an optional `group_ref` string for display. The sending agent resolves group membership from config.json and addresses all members.

### Domain Examples

#### Example 1: Code review to backend team (happy path)
Cory says "Can someone on backend review my OAuth changes?" His agent resolves @backend-team to [Maria, Tomás, Kenji, Priya], sends a code-review request to all four, and confirms: "Sent to @backend-team (4 people). Claimable — first to claim owns the review."

#### Example 2: Direct request (backward compatibility)
Priya says "Ask Kenji about the rate limiter config." Her agent sends to recipients: [kenji] with no group_ref. This is a standard single-recipient request — no group semantics apply.

#### Example 3: Broadcast announcement
Tomás says "Tell the backend team we're deploying at 3pm." His agent sends an announcement (response_mode: none_required) to @backend-team. Everyone sees it, no response needed.

### UAT Scenarios (BDD)

#### Scenario: Send group request with recipients array
Given Cory's agent has resolved @backend-team to [maria, tomas, kenji, priya]
When the agent calls pact_do(action: "send") with recipients [maria, tomas, kenji, priya] and group_ref "@backend-team"
Then a pending request is created with recipients [maria, tomas, kenji, priya]
And the request includes group_ref "@backend-team"
And defaults_applied reflects the merged pact + protocol defaults

#### Scenario: Single recipient (backward compatible)
Given Priya's agent sends to recipients [kenji] with no group_ref
Then the request functions identically to the current single-recipient model

#### Scenario: Recipient validation
Given @backend-team includes "carlos" who is not in config.json
When the agent attempts to send with recipients including "carlos"
Then the send fails with a validation error for unknown user ID

#### Scenario: Merged defaults applied at send time
Given the "code-review" pact has defaults { claimable: true }
When a request is sent using this pact
Then defaults_applied on the request shows { response_mode: "any", visibility: "shared", claimable: true }

### Acceptance Criteria
- [ ] RequestEnvelope schema accepts `recipients: UserRef[]` (replacing singular `recipient`)
- [ ] Optional `group_ref: string` field on RequestEnvelope for display purposes
- [ ] `defaults_applied` object written to request envelope with resolved values
- [ ] All user_ids in recipients validated against config.json
- [ ] Single-recipient requests work with `recipients: [user]` (backward compatible behavior)

### Technical Notes
- **Breaking schema change**: `recipient: UserRef` → `recipients: UserRef[]`
- schemas.ts: Update RequestEnvelope Zod schema
- pact-request.ts: Accept recipients array, validate all, write to envelope
- Existing tests must migrate from `recipient` to `recipients`
- Depends on: US-1 (defaults in PactMetadata)

---

## US-3: Group Requests in Inbox

### Problem (The Pain)
Kenji checks his inbox and only sees requests addressed directly to him. He has no way to see code review requests sent to @backend-team — those requests are invisible to him even though he's a team member. The team misses requests because no one knows they're pending.

### Who (The User)
- Team member whose agent regularly checks inbox
- Part of one or more groups (e.g., @backend-team, @on-call)
- Motivated by not missing relevant requests and seeing clear status

### Solution (What We Build)
Inbox filtering matches the current user against the `recipients[]` array (not just a single recipient field). Results include group_ref and claim_status as first-class metadata on every entry.

### Domain Examples

#### Example 1: Mixed inbox with group and direct requests
Kenji's inbox shows: (1) a claimable code-review from Cory → @backend-team, unclaimed; (2) a direct ask from Priya → @kenji; (3) a design-pact from Maria → @backend-team, claimed by Tomás. All three appear together with addressing and claim status visible.

#### Example 2: Claimed request stays visible
Tomás claimed the design-pact 4 hours ago. When Kenji checks inbox, he still sees the request — but it shows "Claimed by @tomas" so he knows someone's on it.

#### Example 3: Non-claimable group request
A team-wide architecture assessment (response_mode: all, claimable: false) appears in everyone's inbox with no claim indicators — just "Awaiting your response."

### UAT Scenarios (BDD)

#### Scenario: Group request appears in recipient's inbox
Given a code-review request was sent to recipients [maria, tomas, kenji, priya]
When Kenji's agent calls pact_do(action: "inbox")
Then the request appears in Kenji's inbox results

#### Scenario: Inbox entry includes group addressing metadata
Given a group request has group_ref "@backend-team"
When the request appears in Kenji's inbox
Then the entry includes group_ref "@backend-team" for display

#### Scenario: Inbox entry includes claim status
Given a claimable request was claimed by Tomás
When the request appears in Kenji's inbox
Then the entry includes claimed: true and claimed_by: { user_id: "tomas", display_name: "Tomás" }

#### Scenario: Non-claimable request has no claim metadata
Given a request with claimable: false is in Kenji's inbox
Then the inbox entry does not include claim status fields

### Acceptance Criteria
- [ ] Inbox query matches current user against `recipients[]` array
- [ ] Inbox entries include `group_ref` when present
- [ ] Inbox entries include `claimed`, `claimed_by`, `claimed_at` when the request is claimable
- [ ] Claimed requests remain visible to all recipients (not filtered out)
- [ ] Direct requests (single recipient, no group_ref) continue to work unchanged

### Technical Notes
- pact-inbox.ts: Change filter from `recipient.user_id === ctx.userId` to `recipients[].some(r => r.user_id === ctx.userId)`
- Inbox response format: add group_ref and claim fields to each entry
- Depends on: US-2 (recipients array on envelope)

---

## US-4: Claim a Group Request Before Working

### Problem (The Pain)
Maria sees a code review request in her inbox that was sent to @backend-team. She starts reading the code, spends 20 minutes forming review comments — only to discover Kenji already submitted a review 10 minutes ago. She wasted time because there was no way to signal "I'm working on this."

### Who (The User)
- Team member whose agent presents claimable requests
- Wants to signal ownership before investing work time
- Motivated by avoiding duplicate effort and wasted agent tokens

### Solution (What We Build)
A new `claim` action in pact_do that marks a request as claimed by the current user. Claims are exclusive — second claim attempts fail with an informative error. The agent proactively asks the human before claiming, then claims before starting work.

### Domain Examples

#### Example 1: Successful claim (happy path)
Kenji's agent shows him the code review request. Agent asks "This is claimable and unclaimed. Would you like to claim it?" Kenji says yes. Agent calls pact_do(action: "claim"). Claim succeeds. Agent then starts investigating the code changes. Maria's inbox now shows "Claimed by @kenji."

#### Example 2: Failed claim (race condition)
Maria tells her agent to claim the same code review. But Kenji claimed it 30 seconds ago. Maria's agent gets "already_claimed" error. Agent tells Maria: "This was just claimed by Kenji." Maria moves on to another request.

#### Example 3: Claim on non-claimable request
Priya's agent tries to claim an architecture assessment (claimable: false). The system returns an error: "This request is not claimable." The agent shouldn't attempt this — but the system enforces it as a safety net.

### UAT Scenarios (BDD)

#### Scenario: Successful exclusive claim
Given an unclaimed request with claimable: true
When Kenji's agent calls pact_do(action: "claim", request_id: "req-20260223-093000-cory-a1b2")
Then the request is updated with claimed: true, claimed_by: kenji, claimed_at: current timestamp
And the request remains in pending status

#### Scenario: Claim race condition
Given Kenji claimed req-20260223-093000-cory-a1b2 at 09:31:15
When Maria's agent calls pact_do(action: "claim") for the same request at 09:31:45
Then the action fails with error type "already_claimed"
And the error includes claimed_by: "kenji"

#### Scenario: Claim non-claimable request
Given a request with claimable: false (from defaults_applied)
When any agent calls pact_do(action: "claim") for this request
Then the action fails with error type "not_claimable"

#### Scenario: Agent proactively offers claim
Given Kenji's agent is presenting details of a claimable unclaimed request
Then the agent should proactively suggest claiming before starting work
And should wait for explicit human confirmation

#### Scenario: Claim happens before investigation
Given Kenji confirmed he wants to claim a code review
When the agent processes the claim-and-review sequence
Then pact_do(action: "claim") is called first
And only after successful claim does the agent begin reading code and forming review

### Acceptance Criteria
- [ ] New action "claim" in pact_do action dispatcher
- [ ] Claim writes claimed, claimed_by, claimed_at to request envelope
- [ ] Claim on already-claimed request returns already_claimed error with claimer info
- [ ] Claim on non-claimable request returns not_claimable error
- [ ] Claim does not change request status (stays pending)
- [ ] Request envelope updated atomically via git (claim + commit)

### Technical Notes
- New file: src/tools/pact-claim.ts (or added to action dispatcher)
- action-dispatcher.ts: Register "claim" action
- schemas.ts: Add claim fields to RequestEnvelope
- Concurrency: Git's atomic file write + commit handles race conditions at the transport level
- Depends on: US-2 (recipients array), US-3 (claim status in inbox)

---

## US-5: Response Completion by Mode and Visibility Filtering

### Problem (The Pain)
When Cory sends a request to the whole backend team, he doesn't know when the request is "done." If he wanted one review (anyone is fine), the first response should complete it. If he wanted everyone to sign off, it should stay open until all respond. Currently, every request completes on first response — there's no way to express different completion semantics.

Additionally, when Maria sends an architecture assessment wanting independent takes, respondents can see each other's responses — there's no way to prevent groupthink.

### Who (The User)
- Sender who needs different completion semantics for different request types
- Sender who needs privacy between respondents for honest assessments
- Motivated by getting the right coordination behavior without manual tracking

### Solution (What We Build)
Response processing checks `defaults_applied.response_mode` to determine when a request moves to completed. Visibility filtering on response retrieval hides private responses from other respondents.

### Domain Examples

#### Example 1: Any mode — first response completes (happy path)
Cory's code review has response_mode: any. Kenji claims and responds. The request moves to completed immediately. Tomás, Maria, and Priya see it's completed when they next check inbox.

#### Example 2: All mode — everyone must respond
Maria's architecture assessment has response_mode: all, sent to 4 people. Kenji responds, then Priya, then Tomás. Request stays pending. When Cory (the 4th) responds, it moves to completed.

#### Example 3: Private visibility — hidden responses
Same architecture assessment has visibility: private. Kenji responds. When Priya checks the request, she cannot see Kenji's response. Maria (the requester) can see all responses.

### UAT Scenarios (BDD)

#### Scenario: Any mode completes on first response
Given a group request with response_mode: any and 4 recipients
When the first recipient responds
Then the request moves from pending to completed

#### Scenario: All mode stays pending until all respond
Given a group request with response_mode: all and 4 recipients
When 3 of 4 recipients have responded
Then the request remains pending
When the 4th recipient responds
Then the request moves to completed

#### Scenario: None_required mode has no completion requirement
Given a broadcast with response_mode: none_required
Then the request does not require responses to be considered fulfilled
And any voluntary responses are accepted but do not trigger completion

#### Scenario: Private visibility hides responses between recipients
Given a request with visibility: private
And Maria (requester) sent it to [kenji, priya, tomas, cory]
And Kenji has responded
When Priya views the request via check_status
Then Priya cannot see Kenji's response
When Maria views the request via check_status
Then Maria can see Kenji's response

#### Scenario: Shared visibility shows all responses
Given a request with visibility: shared
And Kenji has responded
When Priya views the request
Then Priya can see Kenji's response

### Acceptance Criteria
- [ ] pact_do:respond checks response_mode to determine if request should move to completed
- [ ] response_mode "any": complete on first response
- [ ] response_mode "all": complete when response count == recipients count
- [ ] response_mode "none_required": never auto-completes based on responses
- [ ] check_status and view_thread filter responses based on visibility and requesting user
- [ ] Private: only requester and individual respondent see each response
- [ ] Shared: all responses visible to all participants

### Technical Notes
- pact-respond.ts: Response mode logic before moving request to completed
- pact-status.ts, pact-thread.ts: Visibility filtering on response retrieval
- Multiple responses stored in responses/ directory (one file per respondent)
- Depends on: US-2 (defaults_applied on envelope), US-4 (claim before respond for claimable)

---

## Story Dependency Graph

```
US-1 (Pact Defaults)
  ↓
US-2 (Group Send)
  ↓
US-3 (Group Inbox) ← US-2
  ↓
US-4 (Claim) ← US-2, US-3
  ↓
US-5 (Response Mode + Visibility) ← US-2, US-4
```

## Sizing Estimate

| Story | Effort | Scenarios | Scope |
|-------|--------|-----------|-------|
| US-1 | 1-2 days | 3 | Schema + loader + discover |
| US-2 | 2-3 days | 4 | Schema change + send logic + validation |
| US-3 | 1-2 days | 4 | Inbox filter change + metadata |
| US-4 | 2-3 days | 5 | New action + concurrency + error handling |
| US-5 | 2-3 days | 5 | Response mode logic + visibility filtering |
| **Total** | **8-13 days** | **21** | |
