---
name: share
description: Push context to someone, no action required
version: "1.0.0"
scope: global

subject_hint: "What's being shared"

when_to_use:
  - You want someone to have information without expecting them to act
  - You're sharing a decision, status update, or context that affects their work
  - A response would be nice but isn't needed to unblock anything

multi_round: false

context_bundle:
  required: [what]
  fields:
    what: { type: string, description: "The information being shared" }
    why_it_matters: { type: string, description: "Why the recipient should care" }
    action_if_any: { type: string, description: "Optional action the recipient might take" }

response_bundle:
  required: []
  fields:
    acknowledged: { type: boolean, description: "Whether the recipient acknowledged receipt" }
    follow_up: { type: string, description: "Any follow-up the recipient wants to raise" }

defaults:
  response_mode: none_required
---

# Share

## Example

**Request:**
```yaml
subject: "v1 auth endpoint deprecation notice"
context_bundle:
  what: "We're deprecating the v1 authentication endpoint on March 15. The v2 endpoint is live now with the same contract except tokens include a `scope` claim."
  why_it_matters: "Your billing service calls v1 auth. It will break after March 15."
  action_if_any: "Migrate to v2 before March 15. The only change is the endpoint URL."
```

**Response (optional):**
```yaml
response_bundle:
  acknowledged: true
  follow_up: "We'll migrate next sprint. Can you keep v1 alive until March 22 as a safety net?"
```

## Notes

- `defaults.response_mode: none_required` signals to agents that a response is optional. The protocol delivers the share and doesn't track whether a response arrives.
- If you need everyone in a group to acknowledge, use `check-in` instead.
