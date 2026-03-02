---
name: request:investigate
extends: request
description: Ask an engineer or agent to find the root cause of an anomalous behavior or user report
version: "1.0.0"
scope: support

when_to_use:
  - A user has reported a bug, but the cause isn't obvious
  - You see a spike in a metric but no explicit alerts are firing
  - You need someone to dig into logs, traces, or code to understand "why did this happen?"

context_bundle:
  required: [symptoms, timeline]
  fields:
    symptoms: { type: string, description: "What exactly is going wrong? (e.g., 'Users can't reset passwords', 'High latency on /search')" }
    timeline: { type: string, description: "When did this start happening?" }
    impact: { type: string, enum: [critical, high, medium, low], description: "Severity of the issue" }
    evidence_links: { type: array, description: "Links to Zendesk tickets, Datadog dashboards, Sentry traces, etc." }
    known_changes: { type: string, description: "Any recent deployments, feature flags toggled, or config changes" }

response_bundle:
  required: [status, findings]
  fields:
    findings: { type: string, description: "Summary of what was discovered in the logs/code" }
    root_cause: { type: string, description: "The underlying technical reason for the issue (if found)" }
    next_steps: { type: string, description: "Recommended action (e.g., 'Drafting a hotfix', 'Not a bug, updating docs')" }
    workaround: { type: string, description: "Temporary fix for the user while the bug is being addressed" }
---

# Investigation Request

## Example

**Request (Support to Engineering):**
```yaml
context_bundle:
  symptoms: "Multiple enterprise customers reporting that exporting their invoice history to CSV results in a 504 Gateway Timeout."
  timeline: "Started around 10am EST today."
  impact: "high"
  evidence_links:
    - "https://sentry.io/org/project/issues/12345"
    - "Zendesk Ticket #9942"
  known_changes: "We enabled the new 'Async Export' feature flag for 10% of users this morning."
```

**Response (Engineer):**
```yaml
response_bundle:
  status: "done"
  findings: "The Sentry trace shows an OOM (Out of Memory) error on the worker pods processing the CSV generation."
  root_cause: "The new Async Export logic is loading the entire dataset into memory before streaming it to S3, rather than streaming it row-by-row."
  next_steps: "I've disabled the feature flag to stop the bleeding. I will create a bug ticket to rewrite the export using Node streams."
  workaround: "Users can still use the old synchronous export for now since the flag is off."
```

## Notes

- Separates the *investigation* phase from the *fix* phase (`request:bug-fix`).
- Helps support teams gather the right initial context so engineers don't have to play "20 questions" to start debugging.
