# Protocol Design Research

**Date**: 2026-02-22
**Status**: Active working documents -- evolving through discovery and iteration

---

## Documents

### Core (start here)

| # | Document | Domain | Summary |
|---|---|---|---|
| 01 | [Positioning & Identity](01-positioning-and-identity.md) | What PACT is | The concept of structured mail between human workspaces, accessed through agents. Three pillars: pacts, lifecycle hooks, transport agnosticism. PACT is a protocol, not a service. |
| 02 | [Lifecycle Hooks Architecture](02-lifecycle-hooks-architecture.md) | Extension points | Pacts declare hooks at lifecycle stages (compose, send, route, deliver, read, respond, amend, cancel). PACT defines the stages and hook schema. Teams define the hooks. Executors fire them. |
| 03 | [Transport & Interop](03-transport-and-interop.md) | How messages move | Transport SPI abstraction. Git (current), HTTP (new), A2A bridge (interop). PACT-native envelope format. Messaging pattern foundations from email/IM research. |
| 04 | [Competitive Landscape](04-competitive-landscape.md) | What else exists | No tool occupies PACT's niche (typed contracts + lifecycle hooks + agent-native + human principals). Adjacent tools, interop targets, risk assessment. |
| 05 | [Evolution Roadmap](05-evolution-roadmap.md) | How we get there | Phase 0-5: Spec -> Transport SPI -> Lifecycle Hooks -> Team Routing -> HTTP -> Interop. Current codebase assessment, what stays/changes/is new. |

### Supporting Research (reference material)

| Document | Domain | Summary |
|---|---|---|
| [Branch-Per-User Inbox Architecture](branch-per-user-inbox-architecture.md) | Git transport design | Deep dive into per-user/per-team branches, email/IM pattern mapping, collision detection. Now scoped as a Git transport enhancement (Phase 1+). |
| [Positioning & Interop (original)](pact-positioning-and-interop.md) | Early competitive analysis | Superseded by 01, 03, 04. Retained for reference. Contains full source index. |
| [Naming Conventions](naming-conventions.md) | Terminology | PACT naming rules, glossary, capitalization, sweep scope. |

---

## How These Documents Relate

```
01 Positioning ---- defines what PACT is (protocol, not service)
    |
    +-- 02 Lifecycle Hooks ---- the "why use PACT" differentiator
    |       |
    |       +-- declares hook points in pacts
    |           (teams define hooks, executors fire them)
    |
    +-- 03 Transport & Interop ---- how messages move (pluggable)
    |       |
    |       +-- Git Transport (current)
    |       |    +-- branch-per-user-inbox-architecture.md (enhancement)
    |       +-- HTTP Transport (new)
    |       +-- A2A Bridge (interop)
    |
    +-- 04 Competitive Landscape ---- validates the niche is real and open
    |
    +-- 05 Evolution Roadmap ---- how we get from here to there
            |
            +-- Phase 0: Formalize specs (01-02 inform this)
            +-- Phase 1: Transport SPI (03 informs this)
            +-- Phase 2: Lifecycle Hooks (02 informs this)
            +-- Phase 3: Team Routing (01 + 02 inform this)
            +-- Phase 4: HTTP Transport (03 informs this)
            +-- Phase 5: Interop (03 + 04 inform this)
```

---

## Key Decisions Made

1. **PACT is the concept of mail, not a postal service.** It defines the envelope format, addressing scheme, lifecycle stages, and hook declaration schema. What processing actually happens, what infrastructure executes it, and what tools are used is the team's responsibility. PACT is a protocol, not a service or product.
2. **The human is the principal.** The agent is the interface. PACT is human-to-human, not agent-to-agent.
3. **Lifecycle hooks replace the dissolved "brain" concept.** Pacts declare hooks at lifecycle stages (on_send, on_route, on_respond, etc.). PACT defines the stages and the hook declaration schema. Teams define what hooks exist. Team-chosen executors fire them. There is no central orchestrator.
4. **Hook declarations are open-schema.** PACT requires `id` and `description`. All other fields are team-defined and executor-interpreted. PACT does not define action types (enrich, route, flag, etc.) -- those are team vocabulary.
5. **Each lifecycle stage has its own natural executor.** The sender's agent fires on_compose/on_send hooks. The routing layer fires on_route hooks. The recipient's agent fires on_read/on_respond hooks. No single execution context needs access to everything. Each executor pays its own costs.
6. **Hooks are optional.** A deployment with no hook executors is perfectly valid. Messages flow through the lifecycle as plain structured messages. The pact vocabulary, envelope format, and lifecycle semantics are the core protocol.
7. **Transport must be pluggable.** Git is first-class but not the only option. HTTP and A2A bridge are planned.
8. **Don't adopt CloudEvents.** PACT's envelope has its own semantics (threading, pact identity, amendments, lifecycle hooks). Define a clean PACT-native envelope spec.
9. **Don't reinvent A2A or MCP Agent Mail.** Interop with them where it makes sense. Build what they don't have: typed pacts with lifecycle hooks for human teams.
10. **The pact is the moat.** Team-defined typed message contracts with lifecycle hook declarations are the most unique and portable artifact PACT produces.
11. **The name is PACT.** Protocol for Agent Context Transfer. See `naming-conventions.md`.

---

## Open Questions Collected

### Positioning (01)
- At what team size does the "everyone sees everything" model break?

### Hooks (02)
- Can hooks within a stage depend on each other's output? (Sequential execution within a stage?)
- Can hooks create NEW requests? (Powerful but risks runaway chains. Deferred for now.)
- When pact hooks change, what happens to in-flight requests? (Record pact version in envelope?)
- How do teams test their hook declarations?

### Transport (03)
- Can a team use multiple transports simultaneously?
- How to migrate between transports without losing history?
- How to keep pact versions consistent across transports?

### Roadmap (05)
- Should lifecycle hooks work (Phase 2) start before Transport SPI (Phase 1) is complete?
- Backwards compatibility strategy for envelope format changes?

### Resolved Questions

**Q: Identity & Naming**
A: Resolved. PACT: Protocol for Agent Context Transfer. See `naming-conventions.md`.

**Q: Where does PACT stop and the workspace begin?**
A: PACT defines the protocol: envelope, pacts, lifecycle, hook declaration schema. What hooks do, what tools they use, and what infrastructure runs them is the team's concern.

**Q: Who pays for hook execution?**
A: Each executor pays for what it executes. Sender pays for on_send. Routing layer pays for on_route. Recipient pays for on_respond. No shared cost pool.

**Q: How does the executor access MCP tools?**
A: PACT doesn't define an executor. The executor is team infrastructure -- a local daemon, the agent itself, a CI runner. It uses whatever tools it has access to.

**Q: Client-side vs server-side execution?**
A: Dissolved by the distributed execution model. Each lifecycle stage has a natural executor. No single context runs everything. Deadline-based hooks (on_deadline) are out of scope for initial spec -- they require a persistent scheduler that may not exist in all deployments.
