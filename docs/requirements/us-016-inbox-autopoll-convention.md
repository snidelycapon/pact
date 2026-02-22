# US-016: Inbox Auto-Poll Convention at Session Start

## Problem (The Pain)
Dan has 3 pending GARP requests from Cory and Maria Santos that have been sitting for hours. Dan starts a new agent session to work on something else entirely. He never thinks to check his GARP inbox because no one reminded him. The requests age silently. If Dan had been nudged at session start, he would have handled the code-review from Cory in 10 minutes.

## Who (The User)
- Dan, a developer who receives async requests
- Starts agent sessions for various tasks, not always GARP-related
- Needs a gentle reminder that requests are waiting, without being blocked

## Solution (What We Build)
Document a convention for agents to automatically check garp_inbox at the start of each session and report pending items. For Claude Code, this is a CLAUDE.md instruction. For Craft Agents, this is a source configuration pattern. No code changes to GARP itself.

## Domain Examples

### Example 1: Claude Code Auto-Check via CLAUDE.md
Dan has a CLAUDE.md in his project that includes: "At session start, check for pending GARP requests by calling garp_inbox. Report any pending items before proceeding." Dan opens Claude Code to work on a feature. The agent automatically calls garp_inbox, finds 2 pending requests, and reports: "You have 2 pending GARP requests: a code-review from Cory (3 hours ago) and an ask from Maria Santos (yesterday). Would you like to handle any of these?" Dan says "I'll get to those later" and proceeds with his feature work.

### Example 2: Empty Inbox at Session Start
Dan opens Claude Code. The agent auto-checks garp_inbox and finds 0 pending requests. The agent either says nothing or briefly notes "No pending GARP requests." Dan proceeds with his work uninterrupted.

### Example 3: Craft Agents Session Hook
Dan's Craft Agents source for GARP includes an initialization instruction that calls garp_inbox when the source is first loaded. The behavior is the same: report pending items at session start.

## UAT Scenarios (BDD)

### Scenario: Agent auto-checks inbox at session start (Claude Code)
Given Dan has a CLAUDE.md with the auto-poll instruction
And Dan has 2 pending GARP requests
When Dan starts a new Claude Code session
Then the agent calls garp_inbox before engaging with Dan's prompt
And reports 2 pending requests with sender names, types, and ages

### Scenario: Empty inbox reports nothing disruptive
Given Dan has a CLAUDE.md with the auto-poll instruction
And Dan has 0 pending GARP requests
When Dan starts a new Claude Code session
Then the agent calls garp_inbox
And either reports "No pending GARP requests" or proceeds silently

### Scenario: Auto-poll does not block the user's primary task
Given Dan starts a session and says "Help me refactor auth.ts"
And the agent auto-checks inbox and finds 1 pending request
When the agent reports the pending request
Then the agent also proceeds to help with auth.ts
And Dan is not forced to handle the GARP request first

## Acceptance Criteria
- [ ] CLAUDE.md snippet documented with exact wording for auto-poll instruction
- [ ] Craft Agents source configuration pattern documented
- [ ] Convention is non-invasive: reports pending items but does not block the user
- [ ] Empty inbox case handled gracefully (no error, no noise)
- [ ] Documentation includes at least 2 MCP host examples

## Technical Notes
- This is a documentation/convention story, not a code change. Output is documentation, not source code.
- The CLAUDE.md snippet should go in the project README or a dedicated setup guide.
- Consider whether the instruction should include a threshold: "only report if requests are older than 1 hour" to avoid noise for just-sent requests. Start simple (always report) and iterate.
- The auto-poll instruction competes with the user's actual prompt for attention. Keep the report concise: count, types, senders, ages. Not full details.

## Dependencies
- None (garp_inbox already exists and works)
- This is the lowest-effort story in Phase 2
