# US-017: Sanity-Check Pact Contract

## Problem (The Pain)
Cory is investigating a bug for Acme Corp and finds a suspicious pattern in refresh.ts. He wants Dan to look at it and confirm whether it matches a known issue. Today, Cory sends a Slack message with a markdown-formatted context dump: customer name, ticket number, file paths, his findings, and a question. Dan has to copy-paste all of this into his agent, re-explain the context, and start from scratch. The PACT protocol exists but there is no pact for this exact use case -- the original "look at this, does it make sense?" pattern that motivated the entire project.

## Who (The User)
- Cory, a developer investigating a bug who needs validation from a colleague
- Dan, a colleague with relevant domain knowledge
- Both using agents with PACT MCP servers configured

## Solution (What We Build)
A sanity-check PACT.md that defines the context bundle fields (customer, product, ticket, files, investigation, question) and response structure (answer, evidence, concerns, recommendation). This is the reference pact for the "rich context handoff" value proposition.

## Domain Examples

### Example 1: Memory Leak Investigation
Cory is investigating a memory leak for Acme Corp (Platform v3.2, ZD-4521). He found that refresh tokens are not being garbage collected in src/auth/refresh.ts lines 45-90. He wants Dan to confirm whether this matches the session service pattern from last month (ZD-4102). The sanity-check pact guides his agent to assemble: customer "Acme Corp", product "Platform v3.2", ticket "ZD-4521", files ["src/auth/refresh.ts:L45-90", "src/oauth/token-manager.ts:L120-150"], investigation "Refresh tokens not GC'd after OAuth cycle", question "Does this match the session service pattern from ZD-4102?"

### Example 2: Deployment Anomaly
Maria Santos notices that the Globex Corp staging deploy shows 3x higher memory usage than production. She sends a sanity-check to Dan with customer "Globex Corp", product "API Gateway v2.1", ticket "ZD-4890", files ["deploy/staging.yml", "monitoring/grafana-memory.png"], investigation "Staging memory at 3x prod after v2.1.3 deploy, no code changes match", question "Is this the known JVM warmup behavior or something new?"

### Example 3: Response With Concerns
Dan receives Cory's sanity-check and investigates. His response: answer "YES, same pattern as ZD-4102", evidence "Compared refresh.ts:L45-90 with session-service/cleanup.ts:L30-60, same object retention pattern", concerns "The fix in session-service was tricky -- the finally block must handle async correctly or you get a different leak", recommendation "Apply the finally-block cleanup pattern, reference the ZD-4102 fix commit."

## UAT Scenarios (BDD)

### Scenario: Sender's agent assembles context bundle from pact
Given Cory tells his agent "Send a sanity check to Dan about this memory leak"
And the agent loads pacts/sanity-check/PACT.md
When the agent assembles the context bundle
Then the bundle includes customer, product, ticket, involved_files, investigation_so_far, and question
And missing fields are prompted from Cory

### Scenario: Receiver's agent loads pact and understands expected response
Given Dan receives a sanity-check request from Cory
And the agent loads pacts/sanity-check/PACT.md
When Dan investigates and says "Let's compose a response"
Then the agent structures the response with answer, evidence, concerns, and recommendation
And the response follows the pact's "Response Structure" section

### Scenario: Pact guides investigation without constraining it
Given Dan opens a sanity-check request with full context
When Dan investigates using his agent
Then the agent has the file paths, investigation history, and specific question
And Dan can investigate freely (the pact provides guidance, not constraints)
And the response structure is a suggestion, not a rigid requirement

### Scenario: Pact handles optional fields gracefully
Given Cory sends a sanity-check with no Zendesk ticket (personal project, no ticketing)
When the agent assembles the context bundle
Then the ticket field is omitted or null
And the request is still valid and sendable

### Scenario: Pact is a single file used by both sender and receiver
Given the sanity-check PACT.md exists at pacts/sanity-check/PACT.md
When Cory's agent loads it to compose a request
And Dan's agent loads it to understand and respond
Then both agents read the same file
And the file contains sections for both composing and responding

## Acceptance Criteria
- [ ] PACT.md committed to pacts/sanity-check/ (or examples/pacts/sanity-check/)
- [ ] Context bundle fields documented: customer, product, ticket, involved_files, investigation_so_far, question (with required/optional annotations)
- [ ] Response structure documented: answer, evidence, concerns, recommendation
- [ ] "When To Use" section describes the sanity-check trigger scenario
- [ ] Sender and receiver guidance in a single file
- [ ] At least 1 worked example included in the PACT.md

## Technical Notes
- The sanity-check pact was described in the MVP shared artifact registry (A5) but a full PACT.md was not written. US-006 was the original placeholder. This story produces the actual file.
- Place at examples/pacts/sanity-check/PACT.md to match the existing pact location convention.
- The pact should follow the same structure as examples/pacts/ask/PACT.md and examples/pacts/design-pact/PACT.md.
- This is a markdown file, not code. No test infrastructure needed. Validation is human review + real usage.

## Dependencies
- None (the pact directory convention and PACT tooling already exist)
- This pact is a prerequisite for Phase 2 real-workload validation (P2, out of scope for this batch)
