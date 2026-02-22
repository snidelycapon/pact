# Lifecycle Hooks Architecture

**Date**: 2026-02-22
**Status**: Active working document
**Depends on**: `01-positioning-and-identity.md`

---

## 1. The Core Insight

PACT defines **lifecycle stages** for messages. Pacts can declare **hooks** at each stage -- team-defined declarations of what processing should happen. Whatever is executing at that stage reads the hooks scoped to it and acts accordingly.

There is no central orchestrator. There is no single execution context that runs all hooks. Each lifecycle stage has its own executor (or no executor at all). The sender's agent fires on_compose hooks because it's the thing composing the message. A routing layer fires on_route hooks because it's the thing routing. The recipient's agent fires on_read hooks because it's the thing reading.

PACT defines the lifecycle stages and the hook declaration schema. The team defines what hooks exist for each pact. The team's infrastructure decides what to do with them.

### 1.1 What PACT Defines vs. What Teams Define

**PACT defines (protocol-level):**
- The lifecycle stages: compose, send, route, deliver, read, respond, amend, cancel
- The hook declaration schema: the shape of a hook declaration (id, description, plus open fields)
- The envelope fields that hooks can read (sender, recipient, pact, status, threading)
- The envelope fields that hooks can write to (routing metadata, flags, warnings)

**Teams define (pact-level):**
- Which hooks exist for each pact, at which lifecycle stages
- What each hook should do (in whatever level of detail the executor needs)
- What the hook declarations contain (any fields beyond id and description)

**Executors implement (infrastructure-level):**
- How to interpret hook declarations
- What tools, APIs, and credentials to use
- Whether to use an LLM, a script, a webhook, or nothing
- How to handle failures

### 1.2 Why Declaring Hooks in the Pact Matters

| Property | PACT Lifecycle Hooks | Zapier/n8n | GitHub Actions | Slack Workflows |
|---|---|---|---|---|
| Declared alongside the message schema | Yes | No | No | No |
| Visible from the sending context | Yes | No | Barely | No |
| Version-controlled with the team | Yes | Separate | Separate | Separate |
| Triggered by typed message lifecycle events | Yes | Webhook | Event | Trigger |
| Team can review/modify | PR to pact | Platform UI | PR to workflow | Platform UI |
| Executor is pluggable | Yes (team chooses) | No (platform) | No (GitHub) | No (Slack) |

The key differentiator: **you don't have to leave your working context to understand what processing is declared for this message type**. Open the pact, it's all there. What infrastructure actually executes those declarations is a deployment concern, not a protocol concern.

---

## 2. Lifecycle Stages

### 2.1 The Full Lifecycle

```
on_compose  ->  on_send  ->  on_route  ->  on_deliver  ->  on_read
                                                           |
                                                           v
                                                       on_respond
                                                           |
                                                        (and/or)
                                                       on_amend
                                                       on_cancel
```

| Stage | When It Fires | Natural Executor |
|---|---|---|
| `on_compose` | While the sender is composing the message | Sender's agent |
| `on_send` | After composition, before transport delivery | Sender's agent or local daemon |
| `on_route` | When the message enters a routing layer | Routing infrastructure (if any) |
| `on_deliver` | When the message arrives in a recipient's inbox | Recipient-side infrastructure |
| `on_read` | When the recipient opens/reads the message | Recipient's agent |
| `on_respond` | When the recipient composes and sends a response | Responder's agent or daemon |
| `on_amend` | When the sender amends the original request | Amender's agent or daemon |
| `on_cancel` | When the sender cancels the request | Canceller's agent or daemon |

**Key principle**: Each stage has a "natural executor" -- the process that is already doing the work at that stage. PACT doesn't mandate that any executor exists. If no executor is configured for a stage, hooks at that stage simply don't fire. The message still flows through the lifecycle.

### 2.2 Minimal Deployment (No Hook Executors)

A team can use PACT with zero hook infrastructure:

```
Sender composes -> message written to transport -> recipient reads from inbox -> recipient responds
```

No hooks fire. No automation. Just structured, typed, auditable message exchange. This is still valuable -- the pact vocabulary, the envelope format, and the lifecycle semantics are the core protocol. Hooks are optional.

### 2.3 Sophisticated Deployment (Local Daemon + Routing Layer)

A team with a local daemon on each machine and a routing layer:

```
Sender composes
  -> on_compose hooks fire (agent validates fields, suggests recipients)
  -> on_send hooks fire (daemon enriches with PR stats, flags security files)
  -> message written to transport
  -> on_route hooks fire (routing layer fans out to team, CCs security lead)
  -> on_deliver hooks fire (inbox preview generated)
  -> recipient reads
  -> on_read hooks fire (read receipt sent to sender)
  -> recipient responds
  -> on_respond hooks fire (daemon notifies sender on Slack, updates PR status)
```

Same protocol. Different deployment. The pact is identical in both cases -- it declares the hooks. The infrastructure determines which ones actually fire.

---

## 3. Hook Declaration Schema

### 3.1 What PACT Specifies

A hook declaration has two required fields and is otherwise open:

```yaml
hooks:
  on_send:
    - id: string          # Required. Team-defined identifier for this hook.
      description: string # Required. What should happen. For humans and executors.
      # ...any other fields the team wants to declare
```

PACT specifies:
- `id` is required and must be unique within a lifecycle stage
- `description` is required and should be human-readable
- All other fields are team-defined and executor-interpreted

### 3.2 Recommended Optional Fields

These fields are not required by the protocol but are **recommended patterns** that executors are encouraged to support:

| Field | Purpose | Example |
|---|---|---|
| `condition` | When this hook should fire | `"urgency == 'blocking'"` |
| `failure` | What to do if the hook fails | `warn`, `skip`, `fail` |
| `adds_to_bundle` | Fields this hook may add to the context bundle | `[diff_stats, ci_status]` |
| `modifies_routing` | Whether this hook may change recipients | `true` |

These are conventions, not requirements. A team can declare hooks with no optional fields (just id + description) and rely on an LLM executor to interpret the description. Or a team can declare hooks with highly structured fields for a deterministic executor. PACT doesn't care.

### 3.3 Example: Code Review Pact

```yaml
---
name: "Code Review"
version: "1.2"
description: "Request a code review from a colleague"

when_to_use:
  - "When you have a PR ready for review"
  - "When you need a second opinion on an implementation approach"

context_bundle:
  required: [pr_url, summary, areas_of_concern]
  fields:
    pr_url:
      type: string
      description: "Pull request URL"
    summary:
      type: string
      description: "What changed and why"
    areas_of_concern:
      type: array
      description: "Specific areas you want the reviewer to focus on"
    urgency:
      type: string
      enum: [low, normal, high, blocking]
      default: normal
      description: "How urgently this review is needed"

response_bundle:
  required: [verdict, comments]
  fields:
    verdict:
      type: string
      enum: [approve, request-changes, comment-only]
      description: "Overall review verdict"
    comments:
      type: array
      description: "Review comments, each with file, line, severity, body"
    blocking_issues:
      type: array
      description: "Issues that must be resolved before merge"

hooks:
  on_send:
    - id: pr-metadata
      description: "Pull PR diff stats, file list, and CI status from GitHub"
      adds_to_bundle: [diff_stats, changed_files, ci_status]
      failure: warn

    - id: security-files
      description: "Flag if PR touches security-sensitive paths (auth/, payments/, crypto/, .env*)"
      condition: "changed_files overlap with auth/, payments/, crypto/, .env*"
      failure: skip

    - id: security-cc
      description: "CC security lead if security-sensitive files detected"
      condition: "security_sensitive == true"
      modifies_routing: true
      failure: warn

    - id: slack-notification
      description: "Post to #code-reviews with summary and mention reviewer"
      failure: skip

    - id: urgency-escalation
      description: "DM recipient on Slack if urgency is blocking"
      condition: "urgency == 'blocking'"
      failure: skip

  on_respond:
    - id: response-notification
      description: "Notify sender on Slack that review is complete"
      failure: skip

    - id: pr-status-update
      description: "Update PR review status on GitHub based on verdict"
      condition: "verdict == 'approve' OR verdict == 'request-changes'"
      failure: warn

  on_amend:
    - id: amendment-notification
      description: "Notify recipient that the request was updated"
      failure: skip
---

# Code Review

Request a thorough code review of a pull request...
```

Note: This example uses several recommended optional fields (condition, failure, adds_to_bundle, modifies_routing). A simpler team might declare hooks with just id and description and let their executor figure out the details.

---

## 4. Executor Patterns

PACT doesn't define executors. These are common patterns teams might use.

### 4.1 Agent-as-Executor

The sender's/recipient's agent reads the hook declarations for the current lifecycle stage and acts on them. This is the simplest pattern -- no additional infrastructure.

```
Agent is composing a message
  -> reads pact hooks for on_compose
  -> sees: id: "validate-pr-url", description: "Verify the PR URL exists and is accessible"
  -> agent interprets the hook and validates the URL
```

**Strengths**: Zero infrastructure. Works immediately. The agent uses its own tools and credentials.
**Limitations**: Only works for stages where an agent is active (compose, send, read, respond). Cannot fire hooks at routing or delivery stages without agent involvement.

### 4.2 Local Daemon

A background process on the user's machine that watches for PACT lifecycle events and fires hooks. Analogous to a local CI runner.

```
Daemon detects new outbound request committed to git
  -> reads pact hooks for on_send
  -> makes headless LLM calls, API calls, webhook calls
  -> commits enrichment results
  -> pushes
```

**Strengths**: Fires hooks without agent involvement. Uses the user's local credentials and API keys. Sender bears their own costs.
**Limitations**: Must be running. Only sees events for the local user.

### 4.3 Server-Side Hook (CI/Routing Layer)

A server-side process (GitHub Actions, a webhook receiver, a dedicated routing service) that fires hooks at routing and delivery stages.

```
Server receives push to team inbox branch
  -> reads pact hooks for on_route
  -> fans out to member inbox branches
  -> fires notification hooks
```

**Strengths**: Handles team routing, fan-out. Runs without any individual user's process. Can use shared team credentials.
**Limitations**: Requires infrastructure. The team must configure and maintain it.

### 4.4 No Executor

Perfectly valid. Hooks are declared in the pact but nothing fires them. The message flows through the lifecycle as a plain structured message. Teams can add executors later without changing their pacts.

---

## 5. Common Hook Implementation Patterns

These are **not PACT-defined action types**. They are common patterns that teams tend to implement in their hooks. Documented here as reference for teams designing their own hooks.

### 5.1 Complexity Levels

Teams naturally gravitate toward three levels of hook complexity:

**Level 1: Deterministic** (no LLM needed)
- Template-based notifications (Slack webhook with variable substitution)
- Fan-out to team members based on config
- Round-robin assignment
- Flag based on simple field matching

**Level 2: Metadata-Aware** (LLM on envelope/metadata, not content)
- "If this looks security-related, also loop in the security lead"
- "This person is on vacation per the team calendar, route to their backup"
- "This is the third request today from the same sender -- batch notification"
- Fast, cheap, low-risk

**Level 3: Content-Aware** (LLM on full content + tool calls)
- "Pull the PR diff stats from GitHub before delivering"
- "Summarize the attached files for the inbox preview"
- "Cross-reference this request against open requests to detect duplicates"
- More powerful but more expensive and slower

Teams can mix levels within a single pact. A pact might have L1 notifications and L3 enrichment.

### 5.2 Common Failure Handling Patterns

| Pattern | Behavior | Typical Use |
|---|---|---|
| `fail` | Block the entire operation | Validation hooks |
| `warn` | Continue but attach a warning to the envelope | Enrichment hooks |
| `skip` | Silently skip this hook | Notification hooks |
| `retry` | Retry N times with backoff, then fall through | Flaky external APIs |

### 5.3 Hook Execution Reports

When an executor fires hooks, it's recommended to produce an execution report that the human can see:

```
Request sent successfully.

Hook execution (on_send):
  [ok]   pr-metadata: Added diff_stats (42 files, +1203 -456)
  [ok]   security-files: Flagged security_sensitive (touches auth/middleware.ts)
  [ok]   security-cc: Added eve (security-lead) as CC recipient
  [ok]   slack-notification: Posted to #code-reviews
  [skip] urgency-escalation: Condition not met (urgency=normal)
  [warn] ci-status: GitHub API timeout -- sent without CI status
```

### 5.4 Dry Run

Executors are encouraged to support a dry-run mode that previews what hooks would do without actually executing them:

```
Hook preview (on_send, dry run):
  [would] pr-metadata: Pull PR diff stats from GitHub
  [would] security-files: Check against auth/, payments/, crypto/
  [would] security-cc: Add security-lead if flagged
  [would] slack-notification: Post to #code-reviews
  [skip]  urgency-escalation: Would skip (urgency=normal)

Estimated actions: 3 API calls, 1 Slack notification, 1 additional recipient
Send? (yes/no)
```

---

## 6. Trust Model

### 6.1 Who Defines the Hooks?

The pact lives on the shared branch (e.g., `main`). Changes go through the team's review process (PRs). This means:
- Any team member can propose new hooks or modify existing ones
- The team reviews and approves the pact change
- Once merged, the hooks are declared for all users of that pact
- This is the same trust model as CI/CD pipeline definitions

### 6.2 Who Decides Whether to Execute Hooks?

The executor at each stage. This is critical: declaring a hook in a pact does not guarantee it will fire. The executor decides.

- A sender using `--no-hooks` (or equivalent) can skip all on_send hooks
- A sender can skip specific hooks: `--skip=slack-notification`
- An executor that doesn't understand a hook's custom fields can skip it gracefully
- If no executor exists for a lifecycle stage, hooks at that stage don't fire

### 6.3 Who Pays for Hook Execution?

The executor at each stage pays for what it executes:
- on_compose / on_send: The sender's agent or daemon pays (sender's API keys, sender's LLM costs)
- on_route / on_deliver: The routing infrastructure pays (shared team credentials if applicable)
- on_read / on_respond: The recipient's agent or daemon pays
- If no executor runs, nothing is paid

This is the natural consequence of distributed execution. There is no shared cost pool unless the team explicitly creates one (e.g., a shared routing service with team-funded credentials).

---

## 7. Open Questions

### Hook Interdependence
- Can one hook's output feed into another hook's conditions? (e.g., a "flag security files" hook sets a flag that a "CC security lead" hook reads)
- If so, hooks within a stage are ordered and sequential. If not, hooks within a stage can run in parallel.
- Recommendation: allow sequential execution within a stage (hooks declared in order are executed in order), with each hook's output available to subsequent hooks.

### Hook-Generated Requests
- Can a hook create NEW PACT requests? (e.g., "if this is a code-review for auth/, also create a security-review request")
- This is powerful but risks runaway chains.
- Recommendation: defer. Don't support this in the initial spec. Revisit when real teams request it.

### Versioning
- When a pact's hooks change, what happens to in-flight requests? (e.g., a request was sent with hooks v1, but by the time the recipient responds, the on_respond hooks are v2)
- Recommendation: record the pact version in the envelope at send time. The on_respond executor can decide whether to use the version at send time or the current version.

### Testing
- How do teams test their hook declarations?
- Dry-run mode is one approach.
- Test fixtures (fake requests with expected hook behavior) is another.
- Playground mode (hooks fire but message doesn't actually send) is another.
- This is primarily an executor concern, not a protocol concern.
