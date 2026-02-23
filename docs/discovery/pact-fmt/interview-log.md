# Interview Log: Group Envelope Primitives Evidence Sources

**Date**: 2026-02-23
**Researcher**: Scout (Product Discovery Facilitator)
**Method**: Cross-system research, web search, codebase analysis, prior discovery cross-reference
**Scope**: Evidence sources for group envelope primitives validation

---

## Evidence Quality Framework

| Rating | Definition | Example |
|---|---|---|
| **PAST BEHAVIOR** | Observed in production system, documented usage | "PagerDuty incidents: first acknowledge claims the incident" |
| **TECHNICAL FACT** | Verified against official documentation | "GitHub branch protection allows 1-10 required reviews" |
| **PATTERN MATCH** | Similar system at similar scale demonstrated this | "GitLab CODEOWNERS [2] notation for quorum approval" |
| **INFORMED OPINION** | Reasonable inference from evidence | "Planning Poker's blind estimation maps to private visibility" |
| **SPECULATION** | No direct evidence, only reasoning | "Sequential visibility might be useful for design reviews" |

---

## Source 1: GitHub / GitLab Code Review Systems

### Sources Consulted
- [GitHub CODEOWNERS documentation](https://docs.github.com/articles/about-code-owners) -- TECHNICAL FACT
- [GitHub Branch Protection Rules](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/managing-a-branch-protection-rule) -- TECHNICAL FACT
- [GitHub Approving PRs with Required Reviews](https://docs.github.com/articles/approving-a-pull-request-with-required-reviews) -- TECHNICAL FACT
- [GitLab Merge Request Approvals](https://docs.gitlab.com/user/project/merge_requests/approvals/) -- TECHNICAL FACT
- [GitLab CODEOWNERS Advanced Configuration](https://docs.gitlab.com/user/project/codeowners/advanced/) -- TECHNICAL FACT
- [GitLab Approval Rules](https://docs.gitlab.com/user/project/merge_requests/approvals/rules/) -- TECHNICAL FACT
- [Graphite: PR Approval Permissions](https://graphite.com/guides/pull-request-approval-permissions-rules-github) -- PATTERN MATCH

### Key Findings for PACT

| Finding | Quality | Relevance |
|---|---|---|
| GitHub required reviews: 1-10 configurable approvals | TECHNICAL FACT | Validates `response_mode: all` and `quorum` |
| GitHub CODEOWNERS: auto-assigns reviewers from teams | TECHNICAL FACT | Validates group addressing via team ref |
| GitLab `[N]` notation: "2 of 5" quorum in CODEOWNERS | TECHNICAL FACT | Validates `quorum_threshold` as integer |
| GitHub: any CODEOWNER can approve (not all required) | TECHNICAL FACT | Validates `response_mode: any` for owner groups |
| All review comments visible to all participants | TECHNICAL FACT | Validates `visibility: shared` as default |
| No private/blind review mechanism in either platform | TECHNICAL FACT | Validates need for `visibility: private` |
| GitHub stale review dismissal on new commits | TECHNICAL FACT | Future consideration (response invalidation) |

---

## Source 2: PagerDuty / On-Call Systems

### Sources Consulted
- [PagerDuty Escalation Policies](https://support.pagerduty.com/main/docs/escalation-policies) -- TECHNICAL FACT
- [PagerDuty Round Robin Scheduling](https://support.pagerduty.com/main/docs/round-robin-scheduling) -- TECHNICAL FACT
- [PagerDuty Incidents Documentation](https://support.pagerduty.com/main/docs/incidents) -- TECHNICAL FACT
- [PagerDuty Escalation Policies and Schedules](https://support.pagerduty.com/main/docs/escalation-policies-and-schedules) -- TECHNICAL FACT

### Key Findings for PACT

| Finding | Quality | Relevance |
|---|---|---|
| First responder to acknowledge claims the incident | TECHNICAL FACT | Validates `claimable: true` + `response_mode: any` |
| Escalation timeout (default 30 min) before next level | TECHNICAL FACT | Validates `deadline_required: true` for claiming scenarios |
| Round-robin distributes incidents across team | TECHNICAL FACT | Validates group addressing with fair distribution |
| Only one user per schedule can be on-call | TECHNICAL FACT | Validates that "any" means literally one responder |
| Acknowledge stops escalation chain | TECHNICAL FACT | Validates "first response claims" semantics |

---

## Source 3: Support Ticket Systems (Zendesk, Freshdesk)

### Sources Consulted
- [Zendesk Round-Robin Routing](https://support.zendesk.com/hc/en-us/articles/7990049158554) -- TECHNICAL FACT
- [Zendesk Routing Options](https://support.zendesk.com/hc/en-us/articles/4408831658650) -- TECHNICAL FACT
- [Freshdesk Round-Robin Assignment](https://support.freshdesk.com/support/solutions/articles/221904) -- TECHNICAL FACT
- [Freshservice Auto-Assign](https://support.freshservice.com/support/solutions/articles/157134) -- TECHNICAL FACT

### Key Findings for PACT

| Finding | Quality | Relevance |
|---|---|---|
| "Pull" model: agents assign work to themselves | TECHNICAL FACT | Validates `claimable: true` (self-assignment) |
| "Push" model: system assigns via round-robin | TECHNICAL FACT | Not relevant for PACT v1 (no server-side routing) |
| Tickets assigned to groups, claimed by individual | TECHNICAL FACT | Validates group->individual claiming pattern |
| Round-robin only for tickets, not tasks | TECHNICAL FACT | Interesting limitation -- task routing is different |

---

## Source 4: Jira / Atlassian Approval Workflows

### Sources Consulted
- [Jira Service Management Approval Workflow](https://support.atlassian.com/jira-service-management-cloud/docs/add-an-approval-to-a-workflow/) -- TECHNICAL FACT
- [Jira Approval Configuration](https://confluence.atlassian.com/adminjiraserver/configuring-jira-service-management-approvals-938847527.html) -- TECHNICAL FACT
- [Jira Set Up Approval Steps](https://support.atlassian.com/jira-software-cloud/docs/set-up-approval-steps/) -- TECHNICAL FACT
- [Automating Jira Approval Workflows](https://www.resolution.de/post/automate-approval-workflow/) -- PATTERN MATCH

### Key Findings for PACT

| Finding | Quality | Relevance |
|---|---|---|
| "All approvers" or "any approver" or "N approvers" configurable | TECHNICAL FACT | Directly validates all three: `all`, `any`, `quorum` |
| Approver groups from Insight (asset management) | TECHNICAL FACT | Validates group resolution from external config |
| Project-level workflow configuration | TECHNICAL FACT | Validates `defaults` section at pact level |
| Watchers receive notifications but don't approve | TECHNICAL FACT | Identifies gap: PACT lacks watchers/observers |

---

## Source 5: Linear Issue Tracking

### Sources Consulted
- [Linear Triage Documentation](https://linear.app/docs/triage) -- TECHNICAL FACT
- [Linear Issue Assignment](https://linear.app/docs/assigning-issues) -- TECHNICAL FACT
- [Linear Triage Intelligence](https://linear.app/docs/triage-intelligence) -- TECHNICAL FACT
- [Linear Changelog: Asks Fields and Triage Routing](https://linear.app/changelog/2025-06-05-asks-fields-and-triage-routing) -- TECHNICAL FACT

### Key Findings for PACT

| Finding | Quality | Relevance |
|---|---|---|
| Triage queue: unassigned issues claimed by team members | TECHNICAL FACT | Validates `claimable: true` pattern |
| AI-powered triage intelligence suggests assignees | TECHNICAL FACT | Future consideration for agent-assisted routing |
| Routing rules based on issue properties | TECHNICAL FACT | Validates config-driven group behavior |

---

## Source 6: Apache Software Foundation Governance

### Sources Consulted
- [Apache Voting Process](https://www.apache.org/foundation/voting.html) -- TECHNICAL FACT
- [Apache Community Development: Decision Making](https://community.apache.org/committers/decisionMaking.html) -- TECHNICAL FACT
- [Apache How Projects Use Consensus](https://community.apache.org/blog/how_apache_projects_use_consensus.html) -- TECHNICAL FACT
- [Apache HTTP Server Voting Rules](https://httpd.apache.org/dev/guidelines.html) -- TECHNICAL FACT

### Key Findings for PACT

| Finding | Quality | Relevance |
|---|---|---|
| +1 / 0 / -1 voting with binding votes from PMC | TECHNICAL FACT | Validates `response_mode: quorum` (3 +1 needed) |
| -1 is a veto (kills proposal) for code changes | TECHNICAL FACT | Identifies gap: PACT lacks veto semantics |
| Lazy consensus: 72h silence = approval | TECHNICAL FACT | Validates `none_required` + deadline pattern |
| Release votes: majority approval (more +1 than -1) | TECHNICAL FACT | Validates `quorum` with majority threshold |
| Per-project bylaws define voting rules | TECHNICAL FACT | Validates `defaults` section per pact type |

---

## Source 7: IETF RFC Process

### Sources Consulted
- [RFC 7282: On Consensus and Humming in the IETF](https://datatracker.ietf.org/doc/html/rfc7282) -- TECHNICAL FACT
- [Wikipedia: Rough Consensus](https://en.wikipedia.org/wiki/Rough_consensus) -- PATTERN MATCH
- [RFC 2026: Internet Standards Process](https://datatracker.ietf.org/doc/html/rfc2026) -- TECHNICAL FACT
- [RFC 8789: IETF Rough Consensus](https://datatracker.ietf.org/doc/rfc8789/) -- TECHNICAL FACT

### Key Findings for PACT

| Finding | Quality | Relevance |
|---|---|---|
| "Rough consensus and running code" -- not formal voting | TECHNICAL FACT | Validates quorum as "enough agreement," not exact count |
| Humming as lightweight polling | TECHNICAL FACT | Interesting but too informal for PACT |
| Chair determines when consensus is reached | TECHNICAL FACT | Validates that quorum thresholds should be concrete, not subjective |
| 72-hour minimum for geographic inclusion | TECHNICAL FACT | Validates `deadline_required` for distributed teams |

---

## Source 8: Delphi Method / Planning Poker

### Sources Consulted
- [RAND Delphi Method](https://www.rand.org/topics/delphi-method.html) -- TECHNICAL FACT
- [Wikipedia: Delphi Method](https://en.wikipedia.org/wiki/Delphi_method) -- TECHNICAL FACT
- [Mountain Goat Software: Planning Poker](https://www.mountaingoatsoftware.com/agile/planning-poker) -- PATTERN MATCH
- [cPrime: Wideband Delphi and Planning Poker](https://www.cprime.com/resources/blog/wideband-delphi-planning-poker-rapid-estimation-techniques/) -- PATTERN MATCH
- [The Software Coach: Science Behind Planning Poker](https://thesoftwarecoach.co.uk/en_US/la-ciencia-detras-del-planning-poker-delphi-y-la-teoria-que-lo-hace-efectivo/) -- INFORMED OPINION

### Key Findings for PACT

| Finding | Quality | Relevance |
|---|---|---|
| Independent estimation, simultaneous reveal | PATTERN MATCH | Validates `visibility: private` (independent assessment) |
| 20-30% more accurate estimates vs individual | PATTERN MATCH | Validates private visibility has measurable benefit |
| Avoid anchoring bias by hiding others' estimates | PATTERN MATCH | Validates private visibility for estimation pacts |
| Private phase -> shared discussion phase | PATTERN MATCH | Validates `private_then_shared` pattern (deferred to v2) |

---

## Source 9: 360-Degree Feedback Systems

### Sources Consulted
- [Primalogik: Anonymous vs Confidential 360 Feedback](https://primalogik.com/blog/anonymous-and-confidential-360-feedback/) -- TECHNICAL FACT
- [Star360Feedback: Is 360 Feedback Anonymous?](https://www.star360feedback.com/is-360-feedback-anonymous) -- TECHNICAL FACT
- [Qualtrics: 360 Degree Feedback Guide](https://www.qualtrics.com/articles/employee-experience/360-degree-feedback/) -- TECHNICAL FACT
- [Fellow: Anonymize 360 Feedback](https://help.fellow.app/en/articles/8411735-anonymize-your-360-feedback) -- TECHNICAL FACT

### Key Findings for PACT

| Finding | Quality | Relevance |
|---|---|---|
| Responses hidden from other respondents and subject | TECHNICAL FACT | Validates `visibility: private` |
| Minimum respondent threshold before revealing (3-5) | TECHNICAL FACT | Interesting: privacy requires minimum group size |
| Anonymous (nobody knows) vs confidential (HR knows) | TECHNICAL FACT | PACT: requester always sees responses; private = hidden from OTHER respondents |
| Reduces fear of retaliation, increases honesty | TECHNICAL FACT | Validates the WHY of private visibility |

---

## Source 10: Email Visibility Models

### Sources Consulted
- [Grammarly: BCC Best Practices](https://www.grammarly.com/blog/emailing/bcc-in-email/) -- TECHNICAL FACT
- [Fyxer: What is CC and BCC](https://www.fyxer.com/blog/what-is-cc-and-bcc-in-email) -- TECHNICAL FACT
- [WiseStamp: How Does BCC Work](https://www.wisestamp.com/blog/how-does-bcc-work/) -- TECHNICAL FACT

### Key Findings for PACT

| Finding | Quality | Relevance |
|---|---|---|
| To: primary actor, CC: informed observer, BCC: hidden observer | TECHNICAL FACT | Validates shared + private visibility; identifies watchers gap |
| Reply-All sends to all To + CC, not BCC | TECHNICAL FACT | Validates visibility rules for responses |
| 40+ years of email validates the visibility model | PAST BEHAVIOR | High confidence in shared/private as sufficient |

---

## Source 11: Async Communication Research

### Sources Consulted
- [Twist: Remote Team Communication Guide](https://twist.com/remote-work-guides/remote-team-communication) -- PATTERN MATCH
- [Slack: Async Communication Best Practices](https://slack.com/blog/collaboration/asynchronous-communication-best-practices) -- PATTERN MATCH
- [GitLab Handbook: Asynchronous Communication](https://handbook.gitlab.com/handbook/company/culture/all-remote/asynchronous/) -- PATTERN MATCH

### Key Findings for PACT

| Finding | Quality | Relevance |
|---|---|---|
| FYI updates with "no response required" are standard | PATTERN MATCH | Validates `response_mode: none_required` |
| Weekly summaries, project updates work without sync | PATTERN MATCH | Validates broadcast pacts |
| Response time expectations vary by channel type | PATTERN MATCH | Validates `deadline_required` as configurable |

---

## Source 12: Emergent Patterns — Multi-Agent AI Coordination (Analyst View, 2025-2026)

**Caveat**: These sources are analyst predictions for 2026, not production systems. They inform PACT's positioning but do not validate specific primitives. None of the group envelope primitives are derived from this section alone — all are independently validated by Sources 1-11.

### Sources Consulted
- [Deloitte: AI Agent Orchestration](https://www.deloitte.com/us/en/insights/industry/technology/technology-media-and-telecom-predictions/2026/ai-agent-orchestration.html) -- INFORMED OPINION
- [OneReach: MCP Multi-Agent Collaborative Intelligence](https://onereach.ai/blog/mcp-multi-agent-ai-collaborative-intelligence/) -- INFORMED OPINION
- [Kanerika: AI Agent Orchestration 2026](https://kanerika.com/blogs/ai-agent-orchestration/) -- INFORMED OPINION
- [RUH AI: AI Agent Protocols 2026](https://www.ruh.ai/blogs/ai-agent-protocols-2026-complete-guide) -- INFORMED OPINION

### Key Findings for PACT

| Finding | Quality | Relevance |
|---|---|---|
| Hub-and-spoke: central orchestrator manages agents | INFORMED OPINION | Maps to PACT: requester orchestrates recipients |
| Fan-out / collect pattern in multi-agent workflows | INFORMED OPINION | Validates group request -> collect responses pattern |
| MCP + A2A as complementary protocols | INFORMED OPINION | PACT positioned between MCP (tools) and A2A (agents) |
| 45% faster resolution with multi-agent vs single-agent | INFORMED OPINION | Validates value of group coordination for agents |

---

## Source 13: Prior PACT Discovery Documents

### Sources Cross-Referenced
- `/Users/cory/pact/docs/discovery/pact-format-spec.md` -- Format spec context
- `/Users/cory/pact/docs/discovery/problem-validation.md` -- Deployment target validation
- `/Users/cory/pact/docs/discovery/opportunity-tree.md` -- Priority scoring framework
- `/Users/cory/pact/docs/discovery/lean-canvas.md` -- Cost-benefit framework
- `/Users/cory/pact/docs/discovery/solution-testing.md` -- Git scaling patterns
- `/Users/cory/pact/docs/discovery/interview-log.md` -- Prior evidence sources

### What Was Already Validated (NOT repeated here)
- 1-to-1 pact protocol works
- Pact store: single store, flat files, metadata-driven scoping
- YAML frontmatter as machine contract
- Compressed catalog entries for token efficiency
- Deployment target: ~100 users, teams of 10-12, 20-30 repos
- Directory sharding + retry improvements for scaling

---

## Evidence Gap Summary

| Question | Status | Evidence | Remaining Gap |
|---|---|---|---|
| Do the 4 response_mode values map to real patterns? | **CLOSED** | 6 real-world systems validate all 4 modes | None |
| Do shared and private visibility cover real needs? | **CLOSED** | Email CC/BCC, 360 feedback, GitHub PRs | None for v1 |
| Is sequential visibility needed in v1? | **CLOSED (NO)** | Better modeled by multi_round | None -- deferred |
| Is private_then_shared needed in v1? | **CLOSED (NO)** | 2-phase workflow, not primitive | None -- deferred |
| Is claimable a separate concept from response_mode? | **CLOSED (YES)** | PagerDuty ack vs resolve, Jira assign vs approve | None |
| Should claiming be a separate protocol action? | **MONITORED** | v1: first response = claim. But PagerDuty ack != resolve. | Closure: if >30% of claimable pacts show "claim but delay response" pattern, add `pact_do(action: "claim")` in v2. Validate via first deployment metrics. |
| Do teams need watchers/CC recipients? | **MONITORED** | Email CC, Jira watchers validate the pattern | Closure: protocol concern (request envelope), not format. Add `watchers` array to envelope if >3 teams request stakeholder visibility in first quarter of deployment. |
| What is the quorum_threshold type? | **CLOSED** | Integer (not fraction, not keyword) | None |
| Does the catalog entry need group defaults? | **CLOSED (YES)** | ~5-7 tokens overhead, meaningful for pact selection | None |
