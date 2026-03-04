# PACT — Protocol for Agent Context Transfer

Structured async work requests, backed by git.

You're in the middle of some work. You need a code review, a second opinion, or a sanity check. You tell your agent to send a review pact to a colleague. It already has the context from what you've been working on — it drafts the request, presents it to you for a look, and syncs it over. On the other side, your colleague sees a clear subject and request type. Their agent sees a structured context bundle with everything it needs to help them respond. The handoff between your workspace and theirs just happened without anyone copy-pasting, context-switching, or writing a summary from scratch.

PACT is a shared git repo that moves structured work requests between people and their workspaces. Each request has two layers: the parts for the human (subject, request type, what's being asked) and the parts for the agent (context bundle, response schema, guidance). Together, they make sure that when work crosses from one person's brain-and-machine setup into another's, nothing important gets lost in translation.

## Why PACT

People work with agents now. Each person has their own editor, their own agents, their own way of getting things done — a workspace that's part human judgment and part machine capability. The problem is getting work *between* those workspaces without losing context or creating busywork.

Slack threads lose structure. PR comments lose context. Status meetings lose everyone's time. None of them are designed for the way people actually work now — where the agent sitting next to you has all the context, but no way to hand it cleanly to the agent sitting next to your colleague.

PACT gives your team a shared catalog of request types — code reviews, handoffs, proposals, status check-ins — each defining what context to provide and what response to expect. The human decides what needs to happen. The agent drafts the request from the work context it already has. The human reviews and sends. On the other side, the recipient's agent has structured context to help them do the work, and the response comes back in the shape everyone agreed on.

- **Workspace-agnostic** — PACT connects workspaces, not tools. Everyone uses whatever editor, agents, and workflow they already have.
- **Agent-native** — Requests carry structured context bundles designed for agents to consume, alongside human-readable subjects and descriptions.
- **Git is the transport** — No infrastructure, no accounts, no vendor. Pull to sync, push to deliver.

## Pact definitions

The real power is in the pact definitions — markdown files with YAML frontmatter that your team writes and shares. Each one describes a kind of work request: what context to include, what response to expect, when to use it, and guidance for whoever is responding.

A small team might use the 10 built-in types and never customize anything. A larger org might have hundreds of deeply customized definitions encoding how they actually work — how security reviews get done, what context a production incident needs, what your on-call handoff process looks like. Because definitions live in a shared git repo, everyone works from the same playbook and changes sync automatically.

Built-in types to get started:

| Pact | Description |
|------|-------------|
| `ask` | Get input that unblocks current work |
| `check-in` | Async status round across a group |
| `decide` | Collective decision with structured options |
| `handoff` | Transfer ownership of in-progress work |
| `propose` | Workshop an idea through structured iteration |
| `request` | Ask someone to do something and deliver a result |
| `review` | Structured feedback with blocking/advisory split |
| `riff` | Share work-in-progress and get honest reactions |
| `share` | Push context to someone, no action required |
| `try` | Hands-on testing — try something out and report what happened |

Add your own by dropping `.md` files into `pact-store/`. Variant inheritance lets you specialize — `review--security.md` inherits from `review.md` and overrides what it needs.

## How it works

```
pact-repo/
  pact-store/              Pact definitions — your team's catalog
    ask.md
    review.md
    review--security.md
    ...
  requests/
    pending/               Requests awaiting response
    completed/             Responded requests
  responses/               Response data keyed by request ID
```

1. **Browse the catalog** — your agent shows you what request types your team has defined
2. **Send a request** — tell your agent what you need and who to send it to; it drafts the request from your work context
3. **Check your inbox** — see what's waiting for you, with your agent ready to help
4. **Respond** — your agent has the structured context to help you do the work; approve the response and it syncs back

## Interfaces

**MCP server** — Two tools (`pact_discover` and `pact_do`) for any MCP-compatible host (Claude Code, Cursor, Windsurf, etc.).

**VS Code extension** — Sidebar with inbox, catalog, request detail, and send/respond forms. Lives in `integrations/vscode/`.

**CLI** — `pact inbox` and `pact poll --watch` for terminal users.

## Getting started

Ask your AI agent to use the **Pact Setup** skill (`[skill:pact-setup]`) and follow along. It will detect your environment, walk you through configuration, and verify the connection.

Or do it manually: build with `bun install && bun run build`, point `PACT_REPO` at your shared repo and `PACT_USER` at your user ID, and register `dist/index.js` as an MCP server.

## Design philosophy

PACT is a dumb pipe with a catalog. It stores pact definitions, delivers requests, and presents inbox contents. That's it.

The pact definitions encode how your team works. But the protocol doesn't enforce any of it. Each person and their workspace decide how to handle what comes in. PACT just moves files around in git.

## Development

```bash
bun install
bun test              # 301 tests
bun run typecheck
bun run build         # dist/index.js + dist/cli.js
```

## License

MIT
