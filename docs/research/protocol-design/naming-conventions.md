# PACT Naming Conventions & Terminology Guide

**Date**: 2026-02-22
**Status**: Decided. Ready for consistency sweep.
**Tracks**: [pact-0ok](beads://pact-0ok)

---

## 1. The Name: PACT

**Full expansion**: Protocol for Agent Context Transfer

**Why this name**:
- **Protocol** — it IS a protocol, not a service or product
- **Agent** — agents are the transfer mechanism (like "HyperText" in HTTP names the mechanism, not the user)
- **Context** — context bundles are the core payload; structured context is what moves between workspaces
- **Transfer** — moving typed context between workspaces, transport-agnostic

**Why NOT the old name**: "Protocol for Agent Context Transfer" contradicted transport agnosticism and misframed the agent as the principal rather than the interface.

### Usage Model

PACT works like "email" — one word at three zoom levels, with context disambiguating:

| Zoom Level | Example | What It Means |
|---|---|---|
| The system | "PACT changed how teams work" | The protocol as a whole |
| An instance | "Send Dan a code-review pact" | A specific structured message |
| A definition | "Check the pact for lifecycle hooks" | The typed contract that defines a message type |

There is **no separate term** for protocol vs. artifact vs. instance. One word, three levels. Same as: "Email is a protocol" / "Send Dan an email" / "Check the email for attachments."

### Capitalization

| Context | Form | Example |
|---|---|---|
| The protocol (proper noun) | PACT | "PACT defines lifecycle stages" |
| A message type definition | pact | "the code-review pact" |
| An instance (a specific request) | pact | "Send Dan a pact" |
| In prose alongside the expansion | PACT | "PACT (Protocol for Agent Context Transfer)" |
| CLI commands | `pact` | `pact discover`, `pact do code-review` |
| MCP tool names | `pact_` prefix | `pact_discover`, `pact_do` |
| Code identifiers | PascalCase/camelCase | `PactLoader`, `PactSchema`, `loadPact()` |
| Filenames (artifact) | `PACT.md` | Replaces `PACT.md` |
| Directory names | `pacts/` | Replaces `pacts/` |

---

## 2. Terminology Glossary

### Terms That Change

| Old Term | New Term | Notes |
|---|---|---|
| PACT | PACT | Everywhere. Protocol name. |
| Protocol for Agent Context Transfer | Protocol for Agent Context Transfer | Full expansion. |
| pact | pact | The typed message contract with lifecycle hooks. |
| pact | pact | When referring to a message type definition. |
| PACT.md | PACT.md | The filename for a pact definition. |
| `pacts/` directory | `pacts/` directory | Where pact definitions live. |
| `pact_discover` | `pact_discover` | MCP tool name. |
| `pact_do` | `pact_do` | MCP tool name. |
| `pact-request.ts` | `pact-request.ts` | Source file (and all `pact-*.ts` files). |
| `pact-loader.ts` | `pact-loader.ts` | Source file. |
| `PactMetadata` | `PactMetadata` | TypeScript type. |
| `PactCatalog` | `PactCatalog` | TypeScript type. |
| brain | (removed) | Already dissolved. Use "executor" or "lifecycle hooks" as appropriate. |

### Terms That Stay

| Term | Definition |
|---|---|
| **envelope** | The transport wrapper: sender, recipient, pact type, threading, lifecycle state. |
| **context_bundle** | The typed input payload defined by a pact's schema. |
| **response_bundle** | The typed response payload defined by a pact's schema. |
| **lifecycle hooks** | Team-defined processing declarations at lifecycle stages (on_send, on_respond, etc.). |
| **lifecycle stages** | compose, send, route, deliver, read, respond, amend, cancel. |
| **executor** | Whatever infrastructure fires lifecycle hooks (agent, daemon, CI runner, nothing). |
| **transport** | The backing store/wire (Git, HTTP, A2A bridge). |
| **Transport SPI** | The abstract interface all transports implement. |
| **thread** | A group of related requests linked by thread_id. |

---

## 3. How It Sounds (Natural Language Tests)

These sentences should all feel natural. If any sound wrong, the naming is off.

### Talking about the protocol
- "PACT is a structured collaboration protocol for human teams, accessed through their AI agents."
- "PACT is the concept of mail — the envelope format, addressing scheme, and lifecycle stages."
- "PACT stands for Protocol for Agent Context Transfer."

### Talking about a pact definition
- "The code-review pact defines what context you provide and what lifecycle hooks fire."
- "Our team has 5 pacts: code-review, sanity-check, ask, deploy-approval, and design-review."
- "Define a new pact for the team."
- "Check the pact to see what hooks are declared."

### Talking about a specific request
- "Send Dan a code-review pact."
- "I got three pacts in my inbox this morning."
- "That pact has been pending for two days."

### CLI
- `pact discover` → "Found 3 pacts: code-review, sanity-check, ask"
- `pact do code-review` → "Composing code-review pact..."
- `pact inbox` → "2 pending pacts"

### MCP tools
- `pact_discover` — returns available pacts
- `pact_do` — compose and send a pact

### In documentation
- "PACT's core artifact is the **pact** — a team-defined typed message contract with lifecycle hook declarations."
- "The pact is PACT's moat. No other tool or protocol has team-defined typed message contracts with declared lifecycle hooks."

---

## 4. The Postal Analogy (Updated)

| Concept of Mail | PACT Equivalent |
|---|---|
| Letter format standards | Pact schemas (typed bundles) |
| Addressing conventions | Envelope format (sender, recipient, threading) |
| Mail types (registered, express, certified) | Pact types (code-review, sanity-check, etc.) |
| "This type of mail gets inspected at customs" | Lifecycle hooks declared in the pact |
| Delivery lifecycle (sent, in transit, delivered) | Request lifecycle (pending, responded, completed) |
| The idea that mail can be forwarded, returned, amended | Lifecycle semantics (respond, amend, cancel) |

**The framing**: PACT is not a postal service. PACT is the **concept of mail** — the set of standards that makes postal services possible. A team implements a postal service on top of PACT by choosing their transport and configuring their hook executors.

---

## 5. Consistency Sweep Scope

### Protocol Design Docs (6 core + 2 supporting)

| File | PACT refs | Pact refs | Brain refs | Action |
|---|---|---|---|---|
| `README.md` | ~15 | ~4 | ~3 | Rename all |
| `01-positioning-and-identity.md` | ~30 | ~10 | 0 | Rename all |
| `02-brain-pipeline-architecture.md` | ~20 | ~17 | ~2 | Rename all + **rename file** → `02-lifecycle-hooks-architecture.md` |
| `03-transport-and-interop.md` | ~15 | ~3 | 0 | Rename all |
| `04-competitive-landscape.md` | ~25 | ~1 | 0 | Rename all |
| `05-evolution-roadmap.md` | ~20 | ~9 | ~1 | Rename all |
| `branch-per-user-inbox-architecture.md` | many | ~3 | ~6 | Rename all, replace "brain" with "executor" |
| `pact-positioning-and-interop.md` | many | ~12 | 0 | Rename all (superseded doc, but keep consistent) |

### Codebase (source files)

| Category | Files | Action |
|---|---|---|
| Tool files (`pact-*.ts`) | 9 files | Rename files `pact-*` → `pact-*` |
| Pact loader | `pact-loader.ts` | Rename → `pact-loader.ts` |
| MCP server | `mcp-server.ts` | Update tool names `pact_*` → `pact_*` |
| Schemas | `schemas.ts` | Rename types containing `Pact` → `Pact` |
| Action dispatcher | `action-dispatcher.ts` | Update action names |
| Server/index | `server.ts`, `index.ts` | Update imports, descriptions |
| Ports | `ports.ts` | Update pact references |
| Logger | `logger.ts` | Update prefix |
| Request ID | `request-id.ts` | Update prefix if applicable |

### Test files

| Category | Files | Action |
|---|---|---|
| Acceptance tests (`pact-*.test.ts`) | ~12 files | Rename + update references |
| Pact tests | `pact-contract.test.ts`, `pact-schema.test.ts` | Rename → `pact-contract.test.ts`, `pact-schema.test.ts` |
| Unit tests | `pact-loader.test.ts` + others | Rename + update references |
| Test helpers | `setup-test-repos.ts` | Update pact/PACT.md references |

### Example/fixture files

| Category | Files | Action |
|---|---|---|
| Example pacts | `examples/pacts/*/PACT.md` | Rename dirs `pacts/` → `pacts/`, files `PACT.md` → `PACT.md` |
| Test repos | `repos/grimmdustries/pacts/` | Same rename |
| Stryker sandboxes | `.stryker-tmp/sandbox-*/` | Ignore (auto-generated) |

### Other docs

| File | Action |
|---|---|
| `docs/pact-README.md` | Rename → `docs/pact-README.md`, update content |
| `docs/architecture/*.md` | Update PACT → PACT references |
| `docs/adrs/*.md` | Update references (content may reference PACT/pact) |
| `docs/requirements/us-*.md` | Update references |
| `docs/feature/**/*.md` | Update references |
| `docs/handoff/*.md` | Update references |
| `AGENTS.md` | Update if it references PACT |
| `package.json` | Update name/description |
| `README.md` (root) | Update if exists |

---

## 6. Sweep Rules

1. **PACT → PACT** everywhere. No exceptions. The old name is dead.
2. **pact → pact**. "Pact" no longer appears in any doc or code.
3. **pact → pact** when it refers to a message type definition. (Note: the word "pact" may appear in other contexts like "MCP pacts" or "Alexa pacts" — those stay as-is when referring to external systems.)
4. **PACT.md → PACT.md**. The filename for pact definitions.
5. **pacts/ → pacts/**. The directory name.
6. **brain → executor** or **lifecycle hooks** depending on context. "Brain" is already dissolved in the protocol docs but still appears in `branch-per-user-inbox-architecture.md`.
7. **02-brain-pipeline-architecture.md → 02-lifecycle-hooks-architecture.md**. The filename was already flagged for rename.
8. **Preserve the postal analogy** but update terminology within it (pact → pact, PACT → PACT).
9. **Open questions about naming** (in README.md, 01, 05) — mark as **resolved**: "PACT: Protocol for Agent Context Transfer."
10. **"The pact is the moat"** → **"The pact is the moat."**

---

## 7. What NOT to Change

- **Transport SPI** — stays as-is
- **context_bundle / response_bundle** — stays as-is
- **envelope** — stays as-is
- **lifecycle hooks / lifecycle stages** — stays as-is
- **executor** — stays as-is
- **thread / thread_id** — stays as-is
- **request / response** — stays as-is (these are instances, not pact definitions)
- **on_send, on_respond, etc.** — stays as-is
- External references to other protocols (A2A, MCP, CloudEvents) — stays as-is
- **Git transport internals** (branch names, commit messages) — separate concern, not part of this sweep
