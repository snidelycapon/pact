# PACT — Agent Primer

> Copy the block below into your AGENTS.md, CLAUDE.md, or system prompt.

---

```markdown
## PACT — Async Coordination

You have access to PACT, a git-backed protocol for async requests between humans and agents. **You are the engine.** PACT is a dumb pipe — it stores, delivers, and presents. It does not enforce, validate, route, or coordinate. You read pact definitions, decide behavior, compose bundles, and coordinate with others.

### Tools

**`pact_discover`** — Browse available pact types.
- Returns a catalog of pact definitions (name, description, when_to_use, required fields).
- Each pact definition tells you what `context_bundle` and `response_bundle` fields to use. Read them carefully.
- Optional params: `query` (keyword filter), `scope` (e.g. "global"), `format` ("compressed" for token savings).

**`pact_do`** — Perform an action. Pass `action` plus action-specific fields:

| Action | Purpose | Key fields |
|--------|---------|------------|
| `send` | Send a request | `request_type`, `recipient` or `recipients[]`, `context_bundle`, optional: `deadline`, `thread_id`, `group_ref`, `attachments[]` |
| `inbox` | Check your inbox | *(none)* |
| `respond` | Respond to a request | `request_id`, `response_bundle` |
| `check_status` | Check a sent request | `request_id` |
| `view_thread` | View conversation history | `thread_id` |
| `amend` | Update a pending request | `request_id`, `fields`, optional: `note` |
| `cancel` | Cancel a pending request | `request_id`, optional: `reason` |
| `subscribe` | Subscribe to a list inbox | `recipient` (the list ID, e.g. `+backend-team`) |

### Workflow

1. **Discover** — Call `pact_discover` to see what pact types are available.
2. **Pick a pact** — Read the pact's `when_to_use` and field definitions. Choose the right one.
3. **Send** — Address any user or group by their ID string. Compose `context_bundle` per the pact, then `pact_do` with `action: "send"`.
4. **Check inbox** — Periodically call `pact_do` with `action: "inbox"`. You see requests addressed to your user ID or any inbox you're subscribed to.
5. **Respond** — Read the request, compose `response_bundle` per the pact definition, then `pact_do` with `action: "respond"`.

### Addressing & Subscriptions

- **Send to anyone.** Address requests to any ID string — a person (`cory`), a role (`on-call`), a list (`+backend-team`). PACT delivers without validation.
- **`+` prefix = list/group.** By convention, IDs starting with `+` are subscribable lists (e.g. `+backend-team`, `+on-call`). Plain IDs (e.g. `cory`) are individual users. PACT does not enforce this — it's a naming convention agents honor.
- **IDs are normalized.** Lowercase, hyphens-for-spaces. `Cory` → `cory`, `+Backend Team` → `+backend-team`.
- **Your inbox = your user ID + subscriptions.** Your primary inbox is your `PACT_USER`. You can subscribe to additional inboxes (e.g. `+backend-team`) via the `subscribe` action. All subscribed inboxes are checked together.
- **Subscribers can respond.** If you received a request via subscription, you can respond to it — you don't need to be named directly.
- **No team registry.** PACT has no concept of "who exists." Discover teammates through your organization's tools (GitHub, Slack, org wiki, etc.) or just address them by convention.

### Key Rules

- **Bundles are freeform.** `context_bundle` and `response_bundle` are `Record<string, unknown>`. The pact definition describes what fields to include — follow it, but the protocol won't reject you if you don't.
- **Frontmatter is guidance.** Fields like `response_mode`, `visibility`, `claimable`, and `defaults` in pact definitions are advice for you to interpret and honor. PACT does not enforce them.
- **No access control.** Git has no file-level ACL. Everyone with repo access can see everything. Treat `visibility: private` as a convention you respect, not a security boundary.
- **Check your inbox proactively.** PACT won't notify you. You need to check.
- **Be a good citizen.** Respond to requests addressed to you. Include the fields the pact asks for. Follow the pact's guidance on multi-round, deadlines, and coordination.
```
