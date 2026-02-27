---
name: try
description: Hands-on testing — try something out and report what happened
version: "1.0.0"
scope: global

subject_hint: "What to try"

when_to_use:
  - You want someone to actually run, use, or experience something you built
  - You need validation that it works outside your own machine or environment
  - You want bug reports, usability impressions, or first-contact reactions from real usage

multi_round: true

context_bundle:
  required: [what_to_try]
  fields:
    what_to_try: { type: string, description: "What to test — a feature, build, tool, or workflow" }
    how_to_access: { type: string, description: "How to get it running — URL, branch, install steps, deploy link" }
    focus_on: { type: array, description: "Specific things to exercise or pay attention to" }
    known_issues: { type: string, description: "What's already broken or unfinished — saves the tester from filing known bugs" }
    setup: { type: string, description: "Environment expectations — OS, deps, config needed" }

response_bundle:
  required: [findings]
  fields:
    findings: { type: string, description: "What happened — the testing narrative, what worked and what didn't" }
    bugs: { type: array, description: "Specific issues with reproduction steps" }
    friction: { type: array, description: "Not broken, but confusing, slow, or awkward" }
    impressions: { type: string, description: "Overall feel — what was it like to actually use this thing?" }

attachments:
  - slot: build
    required: false
    convention: "URL, branch name, zip, or deploy link"
    description: "The artifact to try, if not described inline"

defaults:
  response_mode: all
---

# Try

Peer testing between people working on independent projects. You built something, you want someone else to kick the tires and tell you what happened — not a formal review with verdicts, just "did it work? how did it feel?"

Unlike `request` (which is delegation with a deliverable), `try` is about *experiencing* something and reporting back. The tester's job is to use the thing honestly and describe what happened, not to deliver a polished result.

## Example

**Request:**
```yaml
subject: "Kanban board drag-and-drop"
context_bundle:
  what_to_try: "New drag-and-drop kanban board in my task manager app. Cards should reorder within columns and move between columns smoothly."
  how_to_access: "Branch: feat/kanban-dnd — clone and run `pnpm dev`, opens on localhost:3000. Hit the 'Board' tab."
  focus_on:
    - "Drag a card between columns — does the animation feel smooth or janky?"
    - "Try reordering within a column, especially dragging the last card to the top"
    - "Resize the browser to mobile width and try dragging — does it still work?"
  known_issues: "The 'Add Card' button doesn't work yet, ignore it. Also the column headers aren't styled."
  setup: "Node 20+, pnpm. No env vars needed, it uses mock data."
```

**Response:**
```yaml
response_bundle:
  findings: "Cross-column drag works great on desktop — smooth animation, cards land where expected. Within-column reorder has a problem: dragging the bottom card to position 1 causes a flicker where the card snaps back briefly before settling. Mobile is broken — the drag starts but the card sticks to the top-left corner of the screen instead of following my finger."
  bugs:
    - "Mobile drag positioning: card jumps to (0,0) instead of tracking touch position. Tested on Chrome mobile emulation (iPhone 14 viewport). Repro: switch to responsive mode, tap and drag any card."
    - "Within-column reorder flicker: drag card #4 to position 1 in any column. The card visually snaps to its original position for ~200ms before the state updates. Might be a React re-render race."
  friction:
    - "No visual indicator of where the card will land — a placeholder or gap would help a lot"
    - "The drag handle is the entire card, so I accidentally started drags when trying to click card titles"
  impressions: "Desktop experience is genuinely good — the physics feel natural and it's satisfying to use. Fix the mobile touch handling and the reorder flicker and this is shippable. The missing drop indicator is the biggest UX gap after the bugs."
```

**Round 2 — after fixes:**
```yaml
context_bundle:
  what_to_try: "Same kanban board — fixed the mobile touch bug and the reorder flicker. Also added a drop placeholder. Same branch, same setup."
  focus_on:
    - "Is the mobile drag fixed? Try the same iPhone 14 viewport test"
    - "Does the drop placeholder feel natural or distracting?"
  known_issues: "Column headers still unstyled."
```

## Notes

- If you don't need hands-on testing and just want someone's opinion on a screenshot or idea, use `riff` instead.
- If you're asking a specific question that doesn't require running anything, use `ask`.
- `multi_round: true` — common pattern is: send → get findings → fix bugs → send again with "try the fixes."
- `defaults.response_mode: all` because testing feedback is more valuable when thorough. If you just need a quick smoke test, say so in `focus_on`.
