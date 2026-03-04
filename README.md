# PACT — Protocol for Agent Context Transfer

Async work requests between people and AI agents, backed by git.

PACT is a shared git repo where structured requests flow between participants. Pact definitions describe request types — code reviews, questions, handoffs, proposals — with schemas for context and responses. Agents and humans send, respond, and coordinate on their own schedule. No server, no accounts, no vendor lock-in — just git.

## Why PACT

AI agents are good at doing work. They're bad at coordinating it. When an agent needs a code review, wants to hand off a task, or needs to ask a question, there's no structured way to make that request and get a response back.

PACT gives agents (and humans) a shared inbox. Send a structured request, get a structured response. Everything flows through a git repo your team already knows how to use.

- **Works with any MCP host** — Claude Code, Cursor, Windsurf, VS Code, or anything that speaks the Model Context Protocol
- **Works without MCP too** — VS Code extension with full GUI, CLI for terminal users
- **Git is the transport** — no infrastructure to run, no services to maintain, no vendor to depend on
- **Pact definitions are the protocol** — rich templates that tell agents what context to provide and how to respond, but never enforce it

## What it looks like

```
pact-repo/
  pact-store/              Pact definitions — what kinds of requests exist
    ask.md                 "Get input that unblocks current work"
    review.md              "Structured feedback with blocking/advisory split"
    handoff.md             "Transfer ownership of in-progress work"
    ...
  requests/
    pending/               Requests awaiting response
    completed/             Responded requests
  responses/               Response data keyed by request ID
```

1. **Browse the catalog** — discover what pact types are available and what they expect
2. **Send a request** — pick a type, fill in the context, address it to someone
3. **Check your inbox** — see what's waiting for you
4. **Respond** — fill in the response, request moves to completed

## Built-in pact types

Ships with 10 pact definitions covering common async workflows:

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

Teams add their own by dropping `.md` files into `pact-store/`. Variant inheritance is supported — `review--security.md` inherits from `review.md` and overrides what it needs.

## Three ways to use it

**MCP server** — Two tools (`pact_discover` and `pact_do`) that give any MCP-compatible agent full access to the catalog, inbox, and all actions. This is the primary interface for AI agents.

**VS Code extension** — Sidebar with inbox table, catalog browser, request detail, send/respond forms, and background polling with badge counts. Lives in `integrations/vscode/` and bundles the MCP server internally.

**CLI** — `pact inbox` and `pact poll --watch` for terminal users who want inbox notifications without an editor.

## Getting started

Ask your AI agent to use the **Pact Setup** skill (`[skill:pact-setup]`) and follow along. It will detect your environment, walk you through configuration, and verify the connection.

Or do it manually: build with `bun install && bun run build`, point `PACT_REPO` at your shared repo and `PACT_USER` at your user ID, and register `dist/index.js` as an MCP server. See `examples/source-config.json` for a template.

## Design philosophy

PACT is a dumb pipe with a catalog. It stores pact definitions, delivers requests, and presents inbox contents. That's it.

The pact definitions are the smart part — rich documents that tell agents what context to provide, how to structure responses, and when to use each type. But the protocol doesn't enforce any of it. Agents read the guidance, decide what to do, and coordinate with each other. PACT just moves files around in git.

## Development

```bash
bun install
bun test              # 301 tests
bun run typecheck
bun run build         # dist/index.js + dist/cli.js
```

## License

MIT
