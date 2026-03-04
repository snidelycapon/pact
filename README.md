# PACT — Protocol for Agent Context Transfer

Structured async work requests, backed by git.

You need a code review. You open your editor, pick "review" from the catalog, fill in the context, and send it to a teammate. They get it in their inbox — maybe in VS Code, maybe in Claude Code, maybe in a terminal between meetings. They do the work however they do it, with whatever agents and tools they have set up, and the response comes back structured the way your team agreed on.

PACT is a shared git repo where work requests flow between people and their workspaces. Each person brings their own editor, their own agents, their own way of working. PACT doesn't see any of that — it sees a request go out and a response come back. What happens on each side is each person's business.

## Why PACT

Teams coordinate through Slack threads, PR comments, and status meetings. None of those carry structured context. None of them give the recipient a clear picture of what's expected. And none of them bridge the gap between different tools and workflows.

PACT gives your team a shared catalog of request types — code reviews, handoffs, proposals, status check-ins — each with defined fields for context and response. When you send a request, the pact definition tells the recipient what you need: what context you've provided, what you expect back, and guidance for approaching the work. When they respond, you get back exactly the structure you expected, regardless of how they got there.

- **Workspace-agnostic** — Everyone uses whatever tools and agents they work with. PACT connects the spaces, not the tools.
- **People drive the work** — Humans decide what needs to happen. How they get it done — with agents, without, whatever — is up to them.
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

1. **Browse the catalog** — see what request types your team has defined
2. **Send a request** — pick a type, fill in the context, address it to someone
3. **Check your inbox** — see what's waiting for you
4. **Respond** — do the work, fill in the response, done

## Interfaces

**MCP server** — Two tools (`pact_discover` and `pact_do`) for any MCP-compatible host (Claude Code, Cursor, Windsurf, etc.).

**VS Code extension** — Sidebar with inbox, catalog, request detail, and send/respond forms. Lives in `integrations/vscode/`.

**CLI** — `pact inbox` and `pact poll --watch` for terminal users.

## Getting started

Ask your AI agent to use the **Pact Setup** skill (`[skill:pact-setup]`) and follow along. It will detect your environment, walk you through configuration, and verify the connection.

Or do it manually: build with `bun install && bun run build`, point `PACT_REPO` at your shared repo and `PACT_USER` at your user ID, and register `dist/index.js` as an MCP server.

## Design philosophy

PACT is a dumb pipe with a catalog. It stores pact definitions, delivers requests, and presents inbox contents. That's it.

The pact definitions encode how your team works. But the protocol doesn't enforce any of it. People read the request, decide how to handle it, and send back a response. PACT just moves files around in git.

## Development

```bash
bun install
bun test              # 301 tests
bun run typecheck
bun run build         # dist/index.js + dist/cli.js
```

## License

MIT
