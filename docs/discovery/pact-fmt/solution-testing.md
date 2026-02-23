# Solution Testing: Group Primitives Across Real-World Systems

**Date**: 2026-02-23
**Researcher**: Scout (Product Discovery Facilitator)
**Method**: Cross-system comparison of group coordination primitives
**Scope**: Mapping PACT's proposed primitives to 6 real-world systems

---

## Comparison Matrix

| System | Response Collection | Visibility | Claiming | Defaults | Evidence Quality |
|---|---|---|---|---|---|
| **Email** | Implicit (no enforcement) | CC=shared, BCC=private | N/A | N/A | HIGH (40+ years) |
| **Slack** | Implicit (social norms) | Channel=shared, DM=private | Emoji reactions | Channel settings | HIGH |
| **GitHub PRs** | Configurable (1-10 approvals) | Shared (all comments visible) | Self-assign review | Branch protection rules | HIGH |
| **Jira** | Configurable (all or any approver) | Shared (all comments visible) | Ticket assignment | Project workflow config | HIGH |
| **Google Docs** | Implicit (comments open) | Shared (all comments visible) | @mention assignment | Document sharing settings | HIGH |
| **RFC/Governance** | Formal (quorum/consensus) | Shared (public mailing lists) | N/A | Per-project bylaws | HIGH |

---

## System 1: Email (CC, BCC, Reply-All)

### Primitives Used

| Email Feature | Maps to PACT Primitive | Notes |
|---|---|---|
| To: field | Primary recipient(s) | Must act |
| CC: field | `visibility: shared` | Informed, visible to all |
| BCC: field | `visibility: private` | Informed, hidden from others |
| Reply-All | Shared response visibility | All CC'd see the response |
| Reply (not Reply-All) | Private response to sender | Only sender sees response |
| Distribution list | Group addressing | `@team` as recipient |
| No enforcement of responses | `response_mode: none_required` (default) | Email has no response tracking |

### What PACT Can Learn

**Strengths to adopt**:
- **To/CC/BCC visibility model is universally understood.** PACT's `visibility: shared` = CC, `visibility: private` = BCC. This mapping gives users instant mental models.
- **Distribution lists as group addressing.** Email groups are the original `@team` pattern.

**Weaknesses to avoid**:
- **No response tracking.** Email has no concept of "all must respond." You send a request to 5 people and have no idea who has or has not responded without manual follow-up. PACT's `response_mode` is a direct improvement over this gap.
- **Reply-All storms.** Uncontrolled visibility leads to noise. PACT should make visibility an explicit choice, not an accident.
- **No claiming.** When you email a team, there is no mechanism for one person to claim ownership. Multiple people may start working on the same thing.

### Missing in PACT

Email's **To vs CC distinction** (primary actor vs informed observer) is not modeled in PACT's current group addressing proposal. PACT has "recipients" but no "watchers" or "CC" equivalent. This may be a useful addition: `recipients` (must respond per response_mode) vs `watchers` (FYI, no response expected).

---

## System 2: Slack (Channels, Threads, Reactions)

### Primitives Used

| Slack Feature | Maps to PACT Primitive | Notes |
|---|---|---|
| Channel message | `response_mode: any` + `visibility: shared` | Anyone can respond, all see responses |
| DM group | `visibility: shared` (within group) | Private to the group |
| Thread | Multi-round conversation | Sequential responses, all visible |
| @channel mention | Group addressing (all members) | Broadcast to channel |
| @here mention | Group addressing (online members) | Available-only broadcast |
| Emoji reaction | Lightweight claim/ack | :eyes: = "I'm looking", :white_check_mark: = "done" |
| Workflow Builder approvals | `response_mode: any` or `all` | Approve/Decline buttons |

### What PACT Can Learn

**Strengths to adopt**:
- **Emoji reactions as lightweight claims.** Slack teams naturally use reactions to signal "I'm on it" without a full response. PACT's `claimable` flag formalizes this pattern.
- **@channel vs @here distinction.** @channel notifies everyone; @here notifies online members only. This is a delivery mechanism difference, not a response_mode difference. Not needed in PACT (git is inherently async).
- **Workflow Builder approvals.** Slack added structured approval workflows (Approve/Decline buttons) because unstructured channel messages were insufficient for coordination. This validates PACT's approach of structured requests over freeform messages.

**Weaknesses to avoid**:
- **Thread visibility chaos.** Slack threads are sometimes visible in the channel, sometimes not, depending on "Also send to channel" checkbox. PACT should have clear, deterministic visibility.
- **No response tracking for channel messages.** Like email, Slack channel messages have no enforcement of responses.

### Missing in PACT

Slack's **reactions as lightweight acknowledgment** are interesting. PACT's claim mechanism could support a "seen/ack" status without a full response. This is lower priority but worth noting for future iterations.

---

## System 3: GitHub (PRs, CODEOWNERS, Branch Protection)

### Primitives Used

| GitHub Feature | Maps to PACT Primitive | Notes |
|---|---|---|
| Required reviews (1-10) | `response_mode: all` or `quorum` | Configurable minimum |
| CODEOWNERS auto-review request | Group addressing | Auto-assigns reviewers from team |
| "Require review from Code Owners" | `response_mode: all` (from each owner group) | One from each CODEOWNERS section |
| `[2]` section notation (GitLab) | `response_mode: quorum` with threshold | "2 of N" pattern |
| All comments visible | `visibility: shared` | No private review option |
| Dismiss stale approvals on push | Response invalidation | Not modeled in PACT |
| Self-request review | `claimable: true` (reversed) | Reviewer claims review, not task |

### What PACT Can Learn

**Strengths to adopt**:
- **CODEOWNERS as group addressing with role-based routing.** GitHub automatically requests reviews from the right group based on file paths. PACT's `registered_for` + `scope` already models this.
- **Configurable approval threshold.** GitHub's 1-10 required reviews maps directly to `response_mode: quorum` with a threshold. GitLab's `[N]` notation is even more granular.
- **Multiple independent approval groups.** A PR can require 1 approval from `@frontend` AND 1 from `@security`. This is a **multi-group request** pattern -- one request addressed to multiple groups with independent response_mode per group.

**Weaknesses to avoid**:
- **No private review.** GitHub has no mechanism for blind/independent review. All comments are visible immediately. This is fine for code review (which benefits from shared context) but not for independent assessments.
- **Stale approval invalidation.** When new commits are pushed, previous approvals are dismissed. PACT does not need this for v1 (it would require amendment tracking), but it validates the concept of response lifecycle management.

### Missing in PACT

**Multi-group addressing with per-group response_mode.** GitHub PRs can require approvals from multiple independent groups (security team + frontend team). PACT's current proposal sends to one group with one response_mode. Supporting multi-group with different modes per group would be powerful but complex.

Recommendation: DEFER multi-group for v1. A sender can create multiple pacts (one per group) to achieve the same effect. Atomic multi-group requests are a v2 feature.

---

## System 4: Jira / Linear (Tickets, Triage, Approval Workflows)

### Primitives Used

| Feature | Maps to PACT Primitive | Notes |
|---|---|---|
| Jira "all approvers" | `response_mode: all` | Every listed approver must approve |
| Jira "any approver" | `response_mode: any` | One approval sufficient |
| Jira "N approvers" | `response_mode: quorum` | Configurable count |
| Ticket assignment | `claimable: true` | One person owns the ticket |
| Watchers | Informed observers (no response) | Like email CC |
| Linear triage queue | `claimable: true` + `response_mode: any` | Unassigned pool, claim to own |
| Linear auto-assign routing | System-driven claim | AI suggests assignee |
| Project-level workflow config | `defaults` section | Approval rules set per project |

### What PACT Can Learn

**Strengths to adopt**:
- **Jira's explicit "all vs any vs N approvers" configuration** maps precisely to PACT's `response_mode` enum. This is direct validation that the proposed primitives match real-world needs.
- **Linear's triage queue** is the canonical example of `claimable: true`: work arrives for a team, one person claims it. This validates `claimable` as a first-class primitive.
- **Project-level workflow defaults** validate PACT's `defaults` section. Jira configures approval requirements at the workflow level, not per-ticket.

**Weaknesses to avoid**:
- **Over-configurable workflows.** Jira's workflow engine is notoriously complex. PACT should keep the primitives simple (4 response modes, 2 visibility modes, 1 boolean claim flag) rather than building a workflow engine.

### Missing in PACT

**Watchers / observers** -- Jira distinguishes between assignees (must act), reporters (created the request), and watchers (want to see updates). PACT currently has "recipients" but no "watchers." This aligns with the email CC finding above.

---

## System 5: Google Docs (Comments, Suggestions, Resolve)

### Primitives Used

| Feature | Maps to PACT Primitive | Notes |
|---|---|---|
| Anyone can comment | `response_mode: none_required` | Comments are optional, not requested |
| All comments visible | `visibility: shared` | No private comments (without add-on) |
| @mention to assign | Directed request within shared context | Like a pact within a document |
| Resolve comment | Response completion | Comment lifecycle management |
| Suggesting mode | Structured response (accept/reject) | Typed responses, not freeform |
| Private Comments add-on | `visibility: private` | Not built-in -- required marketplace add-on |

### What PACT Can Learn

**Strengths to adopt**:
- **Comment resolution as lifecycle management.** Google Docs tracks comment state (open -> resolved). This validates PACT's request lifecycle (pending -> completed).
- **Suggesting mode as structured response.** Suggestions have accept/reject semantics, not just freeform text. This validates PACT's typed response bundles.

**Weaknesses to avoid**:
- **No built-in private comments.** Google Docs had to add private comments via a marketplace add-on, suggesting the platform underestimated this need. PACT should include `visibility: private` from the start.

### Missing in PACT

Nothing significant. Google Docs is primarily a real-time collaboration tool, not an async coordination protocol. Its patterns are already well-covered by PACT's primitives.

---

## System 6: RFC / Governance Processes (IETF, Apache)

### Primitives Used

| Feature | Maps to PACT Primitive | Notes |
|---|---|---|
| IETF rough consensus | `response_mode: quorum` (soft) | Chair judgment, not hard count |
| IETF humming | Lightweight polling | Binary signal, not structured response |
| Apache +1/0/-1 voting | `response_mode: quorum` with veto | 3 +1 required, any -1 vetoes |
| Apache lazy consensus | `response_mode: none_required` + timeout | Silence = approval after 72h |
| Public mailing list | `visibility: shared` | All discussion visible |
| 72-hour voting period | `deadline_required: true` | Time-boxed response window |

### What PACT Can Learn

**Strengths to adopt**:
- **Apache's lazy consensus validates `none_required` with a deadline.** "If nobody objects within 72 hours, it passes" is a powerful pattern. In PACT terms: `response_mode: none_required` + `deadline_required: true` + a deadline timestamp.
- **Apache's veto model validates that `response_mode: all` is not just "everyone responds" but "everyone must agree."** A single -1 blocks progress. This is important for security review use cases.
- **72-hour voting periods validate `deadline_required`** as a meaningful default.

**Weaknesses to avoid**:
- **IETF's "rough consensus" is subjective.** The chair decides when consensus is reached. PACT should use concrete thresholds (integer quorum counts), not subjective assessment.
- **Veto mechanics are complex.** Apache's -1 is a binding veto with specific rules. PACT should not build veto semantics in v1 -- a simple `response_mode: all` (everyone must respond positively) is sufficient.

### Missing in PACT

**Lazy consensus (silence = approval).** Apache's model of "72 hours with no objection = approved" is powerful for low-ceremony decisions. In PACT, this could be modeled as `response_mode: none_required` with a `deadline`. After the deadline, if no responses exist, the pact auto-completes as approved. This is a valuable pattern that PACT's primitives can already express with the right lifecycle logic.

---

## Synthesis: Primitive Coverage Across Systems

| PACT Primitive | Email | Slack | GitHub | Jira | Google Docs | RFC/Gov |
|---|---|---|---|---|---|---|
| `response_mode: all` | -- | -- | Required reviews | All approvers | -- | Apache voting |
| `response_mode: any` | Implicit | Channel Q&A | -- | Any approver | -- | -- |
| `response_mode: quorum` | -- | -- | N required reviews | N approvers | -- | IETF rough consensus |
| `response_mode: none_required` | FYI/CC | @channel announce | -- | Watchers | Comment (optional) | Lazy consensus |
| `visibility: shared` | CC/Reply-All | Channel/Thread | All comments visible | All comments visible | All comments visible | Public mailing list |
| `visibility: private` | BCC | DM | -- | -- | Add-on only | -- |
| `claimable` | -- | Emoji reaction | Self-assign | Ticket assignment | @mention assign | -- |
| `defaults` | -- | Channel settings | Branch protection | Project workflow | Sharing settings | Project bylaws |

### Key Observations

1. **`response_mode: any` is the most universal pattern** -- every system supports it, usually as the default. It should be PACT's default too.

2. **`visibility: shared` is the default everywhere.** Only email (BCC) and 360 feedback actively use private visibility. PACT should default to shared.

3. **Claiming is widespread but informal.** Only Jira/Linear have formal claim mechanisms. PagerDuty has acknowledge. Everything else uses informal signals (emoji, assignment). PACT formalizing this is a genuine improvement.

4. **Defaults are universal.** Every system configures group behavior at a level above individual requests. PACT's `defaults` section is well-validated.

5. **No system combines all 4 primitives.** Email has visibility but no response tracking. GitHub has response tracking but no private visibility. Jira has claiming but basic visibility. PACT's combination of all 4 primitives in a single format is novel and fills a real gap.

---

## Primitives PACT Is Missing (Potential v2)

| Gap | Where It Exists | Priority for PACT |
|---|---|---|
| **Watchers / CC recipients** (informed but not required to respond) | Email CC, Jira watchers | MEDIUM -- useful for stakeholder visibility |
| **Multi-group addressing** (different response_mode per group) | GitHub PR (security team + frontend team) | LOW -- can use multiple pacts |
| **Veto semantics** (-1 blocks even with majority +1) | Apache voting | LOW -- `response_mode: all` covers most cases |
| **Lazy consensus** (silence = approval after deadline) | Apache governance | LOW -- achievable with `none_required` + deadline logic |
| **Response invalidation** (dismiss stale responses) | GitHub PR (dismiss on push) | LOW -- not needed for v1 |

---

## Sources

- [GitHub Branch Protection](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/managing-a-branch-protection-rule)
- [GitHub CODEOWNERS](https://docs.github.com/articles/about-code-owners)
- [GitLab Merge Request Approvals](https://docs.gitlab.com/user/project/merge_requests/approvals/)
- [GitLab CODEOWNERS Advanced](https://docs.gitlab.com/user/project/codeowners/advanced/)
- [Jira Approval Workflow](https://support.atlassian.com/jira-service-management-cloud/docs/add-an-approval-to-a-workflow/)
- [Linear Triage](https://linear.app/docs/triage)
- [Linear Issue Assignment](https://linear.app/docs/assigning-issues)
- [PagerDuty Escalation Policies](https://support.pagerduty.com/main/docs/escalation-policies)
- [PagerDuty Round Robin](https://support.pagerduty.com/main/docs/round-robin-scheduling)
- [Zendesk Round-Robin Routing](https://support.zendesk.com/hc/en-us/articles/7990049158554)
- [Apache Voting Process](https://www.apache.org/foundation/voting.html)
- [RFC 7282: IETF Rough Consensus](https://datatracker.ietf.org/doc/html/rfc7282)
- [Google Docs Comments](https://support.google.com/docs/answer/65129)
- [RAND Delphi Method](https://www.rand.org/topics/delphi-method.html)
- [Grammarly: BCC Best Practices](https://www.grammarly.com/blog/emailing/bcc-in-email/)
- [Slack Workflow Builder](https://slack.com/help/articles/360035692513-Guide-to-Slack-Workflow-Builder)
- [Mountain Goat Software: Planning Poker](https://www.mountaingoatsoftware.com/agile/planning-poker)
