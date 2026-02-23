# Problem Validation: Group Envelope Primitives

**Date**: 2026-02-23
**Researcher**: Scout (Product Discovery Facilitator)
**Method**: Mom Test principles -- past behavior of real systems, not future intent
**Scope**: Validating the 4 group envelope primitives proposed for pact-fmt

**Prior validated**: 1-to-1 pact protocol, pact store design, format spec (YAML frontmatter as machine contract). This document validates ONLY the group addressing gap.

---

## Executive Summary

| Primitive | Validation | Evidence Quality | Recommendation |
|---|---|---|---|
| `response_mode` (all, any, quorum, none_required) | **Validated** -- all 4 modes map to real coordination patterns | High | Include all 4; `any` is default |
| `visibility` (private, shared, sequential, private_then_shared) | **Partially validated** -- private + shared are strong; sequential + private_then_shared are niche | Medium | Include private + shared; defer sequential + private_then_shared |
| `claimable` | **Validated** -- maps to support/on-call claiming, distinct from response_mode | High | Include as boolean; interacts with `response_mode: any` |
| `defaults` section | **Validated** -- reduces repetition, matches how real systems configure group behavior | High | Include; scope to response_mode, visibility, deadline_required, claimable |

---

## Primitive 1: response_mode

### response_mode: all -- "Everyone must respond"

**Real-world evidence**:

1. **Code review sign-off (GitHub/GitLab)**: GitHub branch protection rules allow requiring N approving reviews (up to 10). GitLab supports `[N]` notation in CODEOWNERS requiring N approvals from a section. When all CODEOWNERS sections must approve, this is effectively `all`. [Source: GitLab CODEOWNERS docs](https://docs.gitlab.com/user/project/codeowners/advanced/), [GitHub branch protection](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/managing-a-branch-protection-rule)

2. **Compliance/regulatory approval**: SOX compliance, HIPAA reviews, and security audits often require sign-off from every designated reviewer. This is not "2 of 3" -- it is "all 3 of 3."

3. **Apache release voting**: Apache requires 3 binding +1 votes with no -1 votes (vetoes). A single -1 kills the proposal. This is stricter than `all` -- it is `all + no vetoes`. [Source: Apache Voting Process](https://www.apache.org/foundation/voting.html)

**When teams needed this**: Any gate where skipping one reviewer creates liability. Security reviews, legal sign-off, release approval.

**Evidence quality**: HIGH. Multiple production systems implement this exact pattern.

**PACT relevance**: A `code-review` pact sent to `@security-team` where ALL members must review before merge.

---

### response_mode: any -- "One response is sufficient"

**Real-world evidence**:

1. **On-call incident response (PagerDuty)**: When an incident fires, it routes to the on-call schedule. The first responder to **acknowledge** claims the incident and stops the escalation chain. One response is sufficient. [Source: PagerDuty Escalation Policies](https://support.pagerduty.com/main/docs/escalation-policies)

2. **Support ticket routing (Zendesk, Freshdesk)**: Tickets assigned to a group wait for any agent to pick them up. Round-robin or manual claim -- either way, one response resolves routing. [Source: Zendesk round-robin routing](https://support.zendesk.com/hc/en-us/articles/7990049158554)

3. **Slack channel questions**: When you post a question to `#backend-help`, you need one answer. The first person who responds resolves the ask.

4. **Email to a team distribution list**: "Does anyone know X?" -- one reply suffices.

**When teams needed this**: Questions, support requests, on-call triage, task claims from a pool.

**Evidence quality**: HIGH. This is the most common group coordination pattern in daily work.

**PACT relevance**: An `ask` pact sent to `@backend-team` where the first responder handles it. This should be the **default** response_mode because it is the most common pattern.

---

### response_mode: quorum -- "A majority must agree"

**Real-world evidence**:

1. **IETF rough consensus**: RFC 7282 defines rough consensus as "the chair determines that a technical issue has been truly considered and the working group has made an informed decision." Not unanimity, not majority vote -- but a sufficient number of informed voices. [Source: RFC 7282](https://datatracker.ietf.org/doc/html/rfc7282)

2. **Distributed systems consensus (Raft, Paxos)**: Quorum = majority of nodes. A 5-node cluster needs 3 acks to commit. This is the mathematical foundation. [Source: Google SRE Book](https://sre.google/sre-book/managing-critical-state/)

3. **GitLab "2 of 3" approvals**: GitLab CODEOWNERS supports `[2]` notation -- "2 approvals required from this group of 5 reviewers." This is a quorum pattern in code review. [Source: GitLab approval rules](https://docs.gitlab.com/user/project/merge_requests/approvals/rules/)

4. **Apache lazy consensus**: Default Apache model -- if nobody objects within 72 hours, the proposal passes. Three +1 votes with no -1 votes for code changes. [Source: Apache Voting](https://www.apache.org/foundation/voting.html)

5. **Architecture Decision Records (ADRs)**: "We need at least 3 senior engineers to sign off on this ADR before we proceed." Common in teams of 6+.

**When teams needed this**: Architectural decisions, RFC approval, design reviews where full unanimity is impractical but broad agreement is needed.

**Evidence quality**: HIGH. Well-established pattern from both software governance and distributed systems.

**PACT relevance**: A `design-pact` sent to `@architecture-team` (6 people) requiring 4 of 6 to approve. The `quorum` value should accept an integer (minimum responses) or a fraction (e.g., `0.5` for majority).

**Design question**: How to specify the quorum threshold? Options:
- Integer: `quorum: 3` (3 responses needed)
- Fraction: `quorum: 0.5` (50% of recipients)
- Keyword: `quorum: majority` (>50%)

Recommendation: Accept integer only. Fractions require knowing group size at send time, which complicates the format.

---

### response_mode: none_required -- "Broadcast / FYI"

**Real-world evidence**:

1. **Slack announcements channel**: `#team-announcements` -- no response expected. Read-only consumption.

2. **Email FYI/CC patterns**: Email CC exists specifically for "you should see this but don't need to act." BCC is for hidden FYI. [Source: Grammarly BCC guide](https://www.grammarly.com/blog/emailing/bcc-in-email/)

3. **GitLab weekly updates**: Teams post status updates for visibility. No action required from readers.

4. **Async team communication**: "Response time expectations can be set by channel, including FYI updates with no response required." [Source: Twist async communication guide](https://twist.com/remote-work-guides/remote-team-communication)

5. **Status page notifications**: Service status updates broadcast to all stakeholders. Acknowledgment is optional.

**When teams needed this**: Status updates, announcements, sharing decisions already made, notifying stakeholders of changes.

**Evidence quality**: HIGH. Universal pattern across every communication tool.

**PACT relevance**: A `status-update` pact where an agent broadcasts a summary to the team. The pact is complete on send -- no response lifecycle needed.

**Design question**: If `none_required`, does the pact auto-complete on send? Or does it stay "pending" indefinitely? Recommendation: Auto-complete to `completed` status on send. The pact exists as a record, not a request.

---

## Primitive 2: visibility

### visibility: shared -- "All responses visible to all"

**Real-world evidence**:

1. **Google Docs comments**: All comments visible to all collaborators with access. Anyone can see what others have said and respond to threads. [Source: Google Docs comments](https://support.google.com/docs/answer/65129)

2. **GitHub PR review comments**: All review comments are visible to all participants. You can see what other reviewers noted.

3. **Slack threads**: All replies in a thread are visible to all thread participants.

4. **Email Reply-All**: When someone hits Reply-All, all CC'd recipients see the response.

**When teams needed this**: Collaborative review, brainstorming, open discussion, shared problem-solving.

**Evidence quality**: HIGH. This is the default model for most collaboration tools.

**PACT relevance**: Default visibility. When Agent A and Agent B both respond to a group pact, both responses are visible to the requester and to each other.

---

### visibility: private -- "Responses hidden from other respondents"

**Real-world evidence**:

1. **360-degree feedback**: Each reviewer submits independently. Responses are anonymous and hidden from other reviewers. Results are aggregated and shown only to the subject (or HR). "Neither the person receiving the feedback nor their manager can see who provided a specific comment" in fully anonymous mode. [Source: Primalogik 360 feedback](https://primalogik.com/blog/anonymous-and-confidential-360-feedback/)

2. **Email BCC responses**: BCC recipients cannot see each other. If they reply, their response goes only to the sender. Note: email BCC is an **imperfect analogy** for PACT's `visibility: private`. In email, BCC replies are unicast (sender only). In PACT, the requester always sees all responses — `private` means respondents cannot see *each other's* responses. The closer analogy is 360 feedback where the coordinator sees all assessments but reviewers cannot.

3. **Blind peer review (academic)**: Reviewers submit independent assessments without seeing other reviewers' comments.

4. **Independent security audits**: Multiple auditors assess the same system independently to avoid groupthink.

**When teams needed this**: Performance reviews, independent assessments, security audits, any scenario where seeing others' responses would bias your own.

**Evidence quality**: HIGH. Well-established pattern in HR, academia, and security.

**PACT relevance**: A `security-review` pact sent to 3 independent reviewers. Each sees only the request and submits their assessment. The requester sees all 3 responses.

---

### visibility: sequential -- "Responses build on each other"

**Real-world evidence**:

1. **Iterative code review (DevArt Review Assistant)**: "Most code review processes are iterative... subsequent commits don't have to address everything raised in the initial code review." Each round builds on the previous. [Source: DevArt iterative review](https://docs.devart.com/review-assistant/reworking-code/what-is-iterative-review.html)

2. **Legal document redlining**: Multiple rounds of edits where each reviewer sees and builds on previous markup. "Always use Suggesting mode -- never edit directly, tag collaborators." [Source: Google Docs redlining](https://www.sirion.ai/library/contract-negotiation/redline-in-google-docs/)

3. **Multi-round design feedback**: Design reviews where feedback is gathered in rounds -- first from the tech lead, then from the team lead, then from the architect.

**When teams needed this**: Iterative refinement, hierarchical review chains, escalation workflows.

**Evidence quality**: MEDIUM. The pattern exists but it is usually handled by the workflow tool (PR revision rounds, document versions), not by the messaging protocol. The sequencing is emergent from the process, not declared upfront.

**PACT relevance**: WEAK. PACT already supports `multi_round: true` for iterative refinement. Sequential visibility is a workflow concern, not an envelope primitive. Adding it to the format spec creates complexity without clear value over `multi_round`.

**Recommendation**: DEFER. Sequential ordering is better handled by the application layer (the pact's `multi_round` flag and round progression) than by a visibility mode in the envelope.

---

### visibility: private_then_shared -- "Respond independently, then discuss"

**Real-world evidence**:

1. **Delphi method (RAND Corporation)**: "Experts provide their answers individually and privately... the facilitator summarizes the collected responses and shares them with the group for further feedback." This is the canonical example. [Source: RAND Delphi Method](https://www.rand.org/topics/delphi-method.html), [Wikipedia](https://en.wikipedia.org/wiki/Delphi_method)

2. **Planning Poker / Wideband Delphi**: "All participants show their cards at the same time... to avoid the influence of the other participants." Independent estimates are revealed simultaneously, then discussed. Studies show 20-30% more accurate estimates vs individual assessment. [Source: Mountain Goat Software](https://www.mountaingoatsoftware.com/agile/planning-poker), [cPrime](https://www.cprime.com/resources/blog/wideband-delphi-planning-poker-rapid-estimation-techniques/)

3. **Pre-read + meeting pattern**: Common in executive meetings -- everyone reads independently, then discusses. Amazon's "six-page memo" follows this pattern.

**When teams needed this**: Estimation, expert elicitation, reducing anchoring bias, any scenario where independent thinking followed by calibration produces better results.

**Evidence quality**: HIGH for the pattern itself (well-researched since RAND in the 1950s). MEDIUM for PACT relevance -- this is a 2-phase workflow, not a simple envelope mode.

**PACT relevance**: MODERATE. The pattern is real and valuable, but it requires a phase transition (private -> shared) that is a workflow concern. Implementing this as a visibility mode means the system must track which phase each response is in.

**Recommendation**: DEFER for initial implementation. The `private` mode handles the first phase. Sharing can be a separate action (change visibility from `private` to `shared` after all responses are in). This is a workflow extension, not a core primitive.

---

## Primitive 3: claimable

**Real-world evidence**:

1. **PagerDuty acknowledge**: The first responder to acknowledge an incident claims it. Escalation stops. The incident is "owned" by one person even though it was routed to a team. [Source: PagerDuty incidents](https://support.pagerduty.com/main/docs/incidents)

2. **Support ticket claiming (Zendesk, Freshdesk)**: "Pull" model -- agents assign work to themselves from a queue. "Push" model -- system assigns via round-robin. Both result in one person owning the ticket. [Source: Zendesk routing](https://support.zendesk.com/hc/en-us/articles/4408831658650)

3. **Linear triage**: Issues in triage are unassigned. A team member claims an issue by assigning it to themselves. Linear's AI can auto-suggest assignment. [Source: Linear triage docs](https://linear.app/docs/triage)

4. **Slack emoji reactions as claims**: Teams use :eyes: or :raising_hand: reactions to claim responsibility for a question in a channel.

**When teams needed this**: Support queues, on-call incident response, task pools, any scenario where a group receives work but one person should own it.

**Evidence quality**: HIGH. Universal pattern across support, ops, and project management.

**Interaction with response_mode**:

| Combination | Meaning | Real-world Example |
|---|---|---|
| `claimable: true` + `response_mode: any` | One person claims AND their response resolves the request | On-call incident: acknowledge = claim + start working |
| `claimable: true` + `response_mode: all` | One person claims ownership but everyone still responds | Bug triage: someone claims to fix it, but all reviewers still assess severity |
| `claimable: false` + `response_mode: any` | First response resolves, no explicit ownership transfer | Quick question: whoever answers first, answered |
| `claimable: false` + `response_mode: all` | Everyone responds, no single owner | 360 review: everyone submits feedback independently |

**Key insight**: `claimable` is a separate concept from `response_mode`. Claiming means "I am taking ownership of this" -- it is an action distinct from responding. A claim might happen before the response is ready (like PagerDuty acknowledge vs. resolve).

**Design question**: Should claiming be a response action or a separate action?

Options:
1. **Claim = first response**: Responding implicitly claims. Simple but conflates two concepts.
2. **Claim = separate action**: `pact_do(action: "claim")` distinct from `pact_do(action: "respond")`. More accurate but adds protocol complexity.
3. **Claim = response with status**: The response includes a `claimed: true` field. The responder can claim and respond in one step, or claim first and respond later.

Recommendation: Option 1 for v1. When `claimable: true` and `response_mode: any`, the first response claims AND resolves. This covers 90% of real-world claim scenarios without adding a new protocol action. Option 2 can be added later if "claim without responding" proves necessary.

### Claiming Concurrency & Race Conditions

When two agents respond simultaneously to a `claimable: true` pact, PACT must resolve deterministically.

**Resolution rule**: Git's append-only, commit-timestamp model provides natural ordering. Two concurrent responses create separate response files (`responses/{request_id}/{user_id}.json`). The response with the earlier `created_at` timestamp wins the claim.

**Concrete behavior**:

1. **Normal case**: Agent A responds at T1. Agent A's response is committed and pushed. Pact is claimed by Agent A. Agent B sees the claim when they pull.
2. **Concurrent case**: Agent A and Agent B both respond before either pushes. Agent A pushes first. Agent B's push triggers pull-rebase-push. After rebase, both response files exist (no git conflict — different file paths). Claim resolution is a read-time check: earlier `created_at` wins.
3. **Notification**: The losing agent discovers the claim on their next `pact_do(action: "inbox")` — the pact shows `claimed_by: <winner_user_id>`.

**Edge cases**:
- **Identical timestamps** (same second): Resolve by lexicographic ordering of `user_id`. Deterministic, no coordination needed.
- **Agent crashes after claiming**: Claim is recorded in the response file. If the claimant never produces further work, the requester can cancel and re-send. No automatic claim expiration in v1.
- **Claim-then-respond pattern** (PagerDuty acknowledge): In v1, claiming and responding are atomic. If >30% of claimable pacts show a "claim but delay response" pattern in production, add a separate `pact_do(action: "claim")` in v2. **Monitored assumption**.

---

## Primitive 4: defaults section

**Real-world evidence**:

1. **GitHub repository settings**: Branch protection rules set defaults for ALL PRs in a repo (required reviews, status checks). Individual PRs inherit these defaults. [Source: GitHub branch protection](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/managing-a-branch-protection-rule)

2. **Jira project configuration**: Workflows, field defaults, and approval rules are set at the project level. Individual issues inherit project defaults. [Source: Jira approval workflow](https://support.atlassian.com/jira-service-management-cloud/docs/add-an-approval-to-a-workflow/)

3. **Slack channel settings**: Default notification preferences, posting permissions, and workflow triggers are channel-level defaults that apply to all messages.

4. **Apache project bylaws**: Each Apache project defines its own voting rules (lazy consensus vs. majority vote vs. 3-binding-plus-no-veto). These are project-level defaults, not per-decision. [Source: Apache Community Development](https://community.apache.org/committers/decisionMaking.html)

**When teams needed this**: Any team with consistent coordination patterns. If your team always does `response_mode: all` for code reviews, declaring that once at the pact level is better than requiring it on every request.

**Evidence quality**: HIGH. Every real-world system uses project/team/channel-level defaults.

**Which fields make sense as defaults?**

| Field | As Default | Evidence |
|---|---|---|
| `response_mode` | YES | GitHub: required reviews count is a repo setting, not per-PR |
| `visibility` | YES | 360 reviews are always private; code reviews are always shared |
| `deadline_required` | YES | SLA policies are team-level, not per-ticket (PagerDuty, Jira) |
| `claimable` | YES | Support queues are always claimable; review requests never are |

**Design recommendation**: The `defaults` section belongs in pact frontmatter because it describes the pact type's intended behavior. A `code-review` pact defaults to `response_mode: all`, `visibility: shared`. A `support-request` pact defaults to `response_mode: any`, `claimable: true`. Senders can override defaults per-request if the pact allows it.

```yaml
defaults:
  response_mode: all
  visibility: shared
  deadline_required: true
  claimable: false
```

---

## Cross-Cutting Finding: Simplicity Gradient

The 4 response modes and 2 core visibility modes (private, shared) cover the vast majority of real-world coordination patterns. The additional visibility modes (sequential, private_then_shared) are real patterns but are better handled as workflows than as envelope primitives.

**Recommended v1 surface area**:

```yaml
defaults:
  response_mode: any          # any | all | quorum | none_required
  visibility: shared          # private | shared
  deadline_required: false
  claimable: false

# When response_mode: quorum
quorum_threshold: 3           # integer: minimum responses needed
```

This gives PACT 8 meaningful combinations (4 modes x 2 visibilities) that map cleanly to real-world patterns, without the complexity of 16 combinations (4 modes x 4 visibilities) where half are rarely used.

---

## Sources

### Primary (High Confidence)
- [GitHub Branch Protection Rules](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/managing-a-branch-protection-rule)
- [GitLab CODEOWNERS Advanced](https://docs.gitlab.com/user/project/codeowners/advanced/)
- [GitLab Merge Request Approval Rules](https://docs.gitlab.com/user/project/merge_requests/approvals/rules/)
- [PagerDuty Escalation Policies](https://support.pagerduty.com/main/docs/escalation-policies)
- [PagerDuty Round Robin Scheduling](https://support.pagerduty.com/main/docs/round-robin-scheduling)
- [Apache Voting Process](https://www.apache.org/foundation/voting.html)
- [RFC 7282: On Consensus and Humming in the IETF](https://datatracker.ietf.org/doc/html/rfc7282)
- [RAND Delphi Method](https://www.rand.org/topics/delphi-method.html)
- [Zendesk Round-Robin Routing](https://support.zendesk.com/hc/en-us/articles/7990049158554)

### Secondary (Medium Confidence)
- [Mountain Goat Software: Planning Poker](https://www.mountaingoatsoftware.com/agile/planning-poker)
- [Primalogik: 360 Feedback Anonymous vs Confidential](https://primalogik.com/blog/anonymous-and-confidential-360-feedback/)
- [Google Docs Comments](https://support.google.com/docs/answer/65129)
- [Linear Triage Docs](https://linear.app/docs/triage)
- [Twist: Async Communication Guide](https://twist.com/remote-work-guides/remote-team-communication)
