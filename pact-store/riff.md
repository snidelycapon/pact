---
name: riff
description: Share work-in-progress and get honest reactions, ideas, or remixes
version: "1.0.0"
scope: global

when_to_use:
  - You want a peer's honest take on something you're building
  - Feedback is creative or subjective — not a formal review with blocking issues
  - You're open to the other person riffing on it — making variants, suggesting wild ideas, or contributing code
  - You're sharing between people on independent projects, not reviewing within a shared codebase

multi_round: true

context_bundle:
  required: [the_thing, going_for]
  fields:
    the_thing: { type: string, description: "What you're sharing — describe it, link it, screenshot it" }
    going_for: { type: string, description: "What you're trying to achieve — the intent, vibe, or goal" }
    questions: { type: array, description: "Specific things you want reactions on" }
    have_at_it: { type: string, description: "What you're inviting them to do — make variants, tweak the CSS, try a different approach" }

response_bundle:
  required: [impressions]
  fields:
    impressions: { type: string, description: "Honest reaction — what hits, what feels off, what feelings it evokes" }
    ideas: { type: array, description: "Riffs and tangents — 'what if you tried...', alternatives, unexpected directions" }
    variants: { type: string, description: "If they made something — a remix, tweak, sketch, or code change" }
    steal_this: { type: string, description: "Something from their own work that might be relevant or useful here" }

attachments:
  - slot: files
    required: false
    convention: "Screenshots, code files, Figma links, or any artifact the recipient can look at or remix"
    description: "The work being shared"

defaults:
  response_mode: all
  visibility: shared
---

# Riff

Low-pressure creative feedback between peers working on their own things. You're not asking for a formal review — no verdicts, no blocking/advisory split. You're showing a friend what you're working on and saying "thoughts?"

The key difference from `review`: there's no approval gate. The recipient isn't deciding whether your work ships. They're reacting honestly, suggesting ideas, and optionally making their own versions. `visibility: shared` because there's no anchoring concern — this is a conversation, not an evaluation.

## Example

**Request:**
```yaml
context_bundle:
  the_thing: "Landing page for my CLI tool. Screenshot attached, plus the CSS and main TSX component if you want to poke at it."
  going_for: "Developer-tool energy — dark theme, monospace accents, but not cold or intimidating. Should feel like a sharp tool, not a corporate product page."
  questions:
    - "Does the hero section communicate what the tool does in 5 seconds?"
    - "The gradient on the CTA button — too much, or does it work?"
    - "Is the code example in the hero readable at this size?"
  have_at_it: "If the color palette or typography feels off, I'd love to see what you'd do differently. The Tailwind config and globals.css are in the attachments."
```

**Response:**
```yaml
response_bundle:
  impressions: "Hero communicates the core value immediately — the animated terminal demo is doing a lot of heavy lifting there, nice choice. The gradient button reads a bit 'SaaS marketing' against the otherwise restrained palette — it clashes with the developer-tool vibe you described. The code example is readable but barely — bumping it 2px would help on laptop screens."
  ideas:
    - "Try a solid button with a subtle border instead of the gradient — something like bg-zinc-100 text-zinc-900 with a ring. Keeps the sharpness."
    - "The monospace font in the nav links is great but the body copy is also monospace which makes longer paragraphs hard to scan. Maybe Inter or a clean sans for body, keep mono for code and UI elements."
    - "What if the hero code example was interactive — user can tab between 2-3 use cases? Saw this on the Bun website and it's effective."
  variants: "I forked the Tailwind config and made a version with the button change and a split type system (mono headers + sans body). Pushed to a gist — link in attachments."
  steal_this: "I just added a 'copy to clipboard' animation to my own docs site that might work for your code examples — it's a 40-line React component. Happy to send it over in a share if you want it."
```

## When to Use Riff vs. Other Pacts

| Situation | Use |
|---|---|
| "How does this look?" / "Any thoughts on this?" | **riff** |
| "Try running this and tell me if it works" | `try` — they need to hands-on test it |
| "I need a formal review before shipping" | `review` — you need verdicts and blocking issues |
| "Which of these 3 approaches should I go with?" | `ask` with `options_considered`, or `decide` for multiple opinions |
| "Here's my plan, help me refine it" | `propose` — structured iteration with assessment |

## Notes

- `have_at_it` is the field that makes this distinct from `review`. You're explicitly inviting contribution, not just evaluation. If you don't want remixes, leave it empty — the pact still works as pure feedback.
- `steal_this` exists because friends working on independent projects often have solved adjacent problems. This field makes cross-pollination explicit.
- `visibility: shared` because this is a creative exchange, not an independent evaluation. Seeing each other's ideas is the point.
- `multi_round: true` — natural flow is: share → get reactions → incorporate ideas → share updated version → more reactions. The conversation builds on itself.
