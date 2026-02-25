# PACT — First Principles

**PACT is a dumb pipe with a catalog.** It is not a communications server, coordination engine, workflow orchestrator, or message broker. It stores pact definitions, presents them when asked, and delivers requests faithfully. That's it.

## The Apathy Principle

PACT does not have opinions about how it's used. It does not recommend, route, suggest, prefer, enforce, validate, or police. It does not auto-complete requests, count responses, manage visibility, or track claiming. **The agents are the engine.** Agents read pact definitions, decide what to do, compose requests, interpret responses, and coordinate with each other. PACT just moves files around in git.

## What PACT Does

1. **Catalog** — Stores pact definitions (flat `.md` files with YAML frontmatter). Presents them via `pact_discover`. Agents read the catalog to decide which pact to use.
2. **Deliver** — Accepts a request envelope, writes it to disk, commits, pushes. Accepts a response, writes it, moves the request to completed, commits, pushes.
3. **Present** — Shows inbox contents, request status, thread history. Read-only queries over files on disk.

## What PACT Does NOT Do

- **Enforce behavior** — Pact frontmatter (response_mode, visibility, claimable, defaults) is *agent guidance*, not runtime enforcement. The pact says "this is claimable"; the agent decides whether to honor that. PACT passes it through.
- **Manage groups** — If a request has multiple recipients, PACT delivers to all of them. It does not track who claimed, count responses, auto-complete based on response_mode, or filter by visibility. Agents handle coordination.
- **Validate bundles** — `context_bundle` and `response_bundle` are `Record<string, unknown>`. The pact definition describes what should go in them. The protocol passes them through untouched.
- **Access control** — Git has no file-level ACL. Everyone with repo access sees everything. "Visibility: private" is agent self-discipline, not a security boundary.

## Architecture Reminders

- ~2,200 LOC TypeScript, ports-and-adapters, modular monolith
- 2 MCP tools (`pact_discover`, `pact_do`), 9 actions (send, inbox, respond, check_status, view_thread, cancel, amend, subscribe, unsubscribe)
- Git is the transport. Files on disk are the state. Commits are atomic operations.
- Pact definitions are the only "smart" part — they're rich documents that tell agents how to behave. The protocol just serves them.

## When You're Tempted to Add Protocol Logic

Ask: "Is this a transport concern or an agent concern?"

- **Transport**: Writing files, reading files, moving files between directories, committing, pushing, pulling, inbox filtering by recipient. → PACT does this.
- **Agent**: Deciding which pact to use, composing bundles, interpreting defaults, coordinating multi-recipient workflows, honoring visibility, claiming work, counting responses. → Agents do this.

If you find yourself writing enforcement logic, completion tracking, merge functions, or behavioral state machines inside PACT, stop. You're building a mailserver. Put the guidance in the pact definition and let the agents figure it out.
