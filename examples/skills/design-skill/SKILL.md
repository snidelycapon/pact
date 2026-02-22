# Design a Skill

A multi-round skill for collaboratively designing a new GARP skill contract. Two people go back and forth -- proposing, questioning, refining -- until they converge on a SKILL.md ready to commit.

This skill is inherently iterative. Each round is a separate `garp_request` / `garp_respond` cycle. Use `thread_id` to link rounds into a single conversation thread.

## When To Use

- You want to create a new skill type for your team's shared repo
- You need another person's input on what fields a skill should have
- You're not sure what the right contract looks like and want to workshop it

## How Rounds Work

Each round is a new request in the same thread. The `thread_id` parameter on `garp_request` ties them together.

1. Sender submits a `design-skill` request (round 1 creates the thread)
2. Recipient responds with feedback, questions, or approval
3. If not approved, sender starts a new round with the same `thread_id`

**Round 1 (propose):** Describe the skill idea. No draft yet -- just the concept, who uses it, and when. Use the returned `request_id` as the `thread_id` for all follow-up rounds.

**Round 2+ (refine):** Send an updated `current_draft` of the SKILL.md content, noting what changed since last round.

**Final round (finalize):** When the respondent is satisfied, they respond with `status: approved` and the final SKILL.md content. The initiator then commits it to `skills/<skill_name>/SKILL.md`.

## Context Bundle Fields

| Field | Required | Description |
|-------|----------|-------------|
| skill_name | yes | Snake-case directory name for the skill (e.g. `code-review`) |
| round | yes | Round number -- start at 1, increment each cycle |
| phase | yes | `propose` (round 1), `refine` (rounds 2+), or `finalize` (last round) |
| idea | yes (propose) | What the skill is for, who uses it, when to reach for it |
| current_draft | yes (refine/finalize) | The full SKILL.md content being refined |
| changes_made | no | What you changed since the last round, addressing prior feedback |

## Response Structure

| Field | Description |
|-------|-------------|
| status | `needs_revision` -- keep going; `approved` -- done; `approved_with_changes` -- done, but use `suggested_draft` instead |
| feedback | Questions to answer, concerns to address, or suggestions for the next round |
| suggested_draft | A revised SKILL.md if the respondent wants to propose specific wording (optional) |

## Example: Round 1

**garp_request call:**
```
request_type: "design-skill"
recipient: "dan"
context_bundle: (see below)
```

**Context bundle (propose):**
```json
{
  "skill_name": "code-review",
  "round": 1,
  "phase": "propose",
  "idea": "A skill for requesting a code review on a PR or branch. The sender provides a diff URL or branch name, describes what changed and why, and flags areas they're uncertain about. The reviewer responds with approval, requested changes, or questions."
}
```

Note: no `thread_id` on round 1. The returned `request_id` (e.g. `req-20260221-143022-cory-a1b2`) becomes the thread_id for subsequent rounds.

**Response bundle:**
```json
{
  "status": "needs_revision",
  "feedback": "Good concept. A few questions: (1) Should the context include the language/framework? (2) Do we need a severity/priority field? (3) Should the response distinguish between blocking vs non-blocking feedback?"
}
```

## Example: Round 2

**garp_request call:**
```
request_type: "design-skill"
recipient: "dan"
thread_id: "req-20260221-143022-cory-a1b2"
context_bundle: (see below)
```

**Context bundle (refine):**
```json
{
  "skill_name": "code-review",
  "round": 2,
  "phase": "refine",
  "changes_made": "Added language field, split response into blocking vs advisory feedback, skipped severity since the sender can mention urgency in the description.",
  "current_draft": "# Code Review\n\nRequest a code review on a PR or set of changes.\n\n## When To Use\n..."
}
```

**Response bundle:**
```json
{
  "status": "approved",
  "feedback": "Looks good. The blocking vs advisory split is the right call.",
  "suggested_draft": null
}
```

## After Approval

Once the response comes back with `status: approved`:

1. Take the `current_draft` (or `suggested_draft` if `approved_with_changes`)
2. Write it to `skills/<skill_name>/SKILL.md` in the shared repo
3. Commit and push

The new skill is now live for the team.
