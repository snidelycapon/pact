---
name: share:incident-update
extends: share
description: Broadcast status updates during an active outage or major degradation
version: "1.0.0"
scope: support

when_to_use:
  - You are the Incident Commander managing an active Sev1/Sev2
  - You need to keep support teams, leadership, and engineers aligned on current status
  - You want to push updates asynchronously without disrupting the people fixing the problem

context_bundle:
  required: [incident_id, current_status, customer_impact]
  fields:
    incident_id: { type: string, description: "Tracking ID (e.g., 'INC-104')" }
    current_status: { type: string, enum: [investigating, identified, mitigating, resolved], description: "Current phase of incident response" }
    customer_impact: { type: string, description: "What users are currently experiencing (e.g., 'API is completely down', '10% of checkouts failing')" }
    latest_findings: { type: string, description: "What we know right now" }
    next_update: { type: string, description: "When the next broadcast will happen" }

response_bundle:
  required: []
  fields:
    acknowledged: { type: boolean, description: "True if received" }

defaults:
  response_mode: none_required
---

# Incident Status Update

## Example

**Request (Incident Commander):**
```yaml
context_bundle:
  incident_id: "INC-991"
  current_status: "mitigating"
  customer_impact: "All web traffic to the EU region is failing with 503 errors."
  latest_findings: "We identified a bad routing rule deployed 15 mins ago. The platform team is currently rolling back the ingress configuration."
  next_update: "In 15 minutes, or as soon as the rollback completes."
```

## Notes

- During an incident, communication is chaotic. This pact structures the updates so support teams know exactly what to tell customers without having to parse through a messy engineering Slack channel.
