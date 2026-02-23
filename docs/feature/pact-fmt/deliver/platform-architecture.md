# Platform Architecture: pact-fmt

**Feature**: pact-fmt (Group Envelope Primitives)
**Architect**: Apex (nw-platform-architect)
**Date**: 2026-02-23

---

## Platform Overview

PACT is a **local development tool**, not a cloud service. The "platform" is a developer's machine running an MCP host (e.g., Craft Agents, Claude Code). There are no servers, containers, load balancers, or cloud resources to architect.

```
Developer Machine
+--------------------------------------------------+
|  MCP Host (Craft Agents, Claude Code, etc.)       |
|    |                                              |
|    | stdio (JSON-RPC over stdin/stdout)           |
|    v                                              |
|  PACT MCP Server (Node.js process)                |
|    |                                              |
|    | fs + simple-git                              |
|    v                                              |
|  Git Repository (local clone)                     |
|    |                                              |
|    | git push/pull                                |
|    v                                              |
+--------------------------------------------------+
         |
         v
  Git Remote (GitHub, GitLab, etc.)
```

**Installation**: `npm install -g pact` (or local `npx`)
**Invocation**: MCP host spawns `node dist/index.js` as stdio subprocess
**State**: Git repository on disk (no database, no cache layer)
**Coordination**: Git push/pull/rebase (no message queue, no pub/sub)

---

## Runtime Architecture

### Process Model

Single Node.js process. No workers, no thread pool, no clustering. The MCP protocol is request-response over stdio -- one request at a time per process instance.

```
stdin  --> JSON-RPC parser --> tool router --> action dispatcher --> domain handler
stdout <-- JSON-RPC encoder <---------------------------------------------+
stderr --> structured JSON log
```

### Component Layout (post pact-fmt)

```
src/
  index.ts              Entry point (stdio transport setup)
  server.ts             MCP server configuration
  mcp-server.ts         Tool registration + request routing
  action-dispatcher.ts  Action string -> handler mapping (adds: "claim")
  schemas.ts            Zod schemas (adds: GroupDefaults, recipients[], claim fields)
  pact-loader.ts        PACT.md YAML parser (adds: defaults section parsing)
  defaults-merge.ts     NEW: Pure function, protocol + pact defaults merge
  logger.ts             Structured JSON to stderr
  request-id.ts         Deterministic ID generation
  ports.ts              Port interfaces (GitPort, ConfigPort, FilePort)
  adapters/
    git-adapter.ts      simple-git wrapper with retry
    file-adapter.ts     fs/promises wrapper
    config-adapter.ts   config.json reader
  tools/
    pact-request.ts     Send action (adds: recipients[], defaults_applied)
    pact-respond.ts     Respond action (adds: per-respondent files, completion logic)
    pact-claim.ts       NEW: Claim action (exclusive claim via git atomic write)
    pact-inbox.ts       Inbox action (adds: group filtering, claim status enrichment)
    pact-status.ts      Status action (adds: visibility filtering)
    pact-thread.ts      Thread action (adds: visibility filtering)
    pact-discover.ts    Discovery action (adds: merged defaults in catalog)
    pact-cancel.ts      Cancel action (unchanged)
    pact-amend.ts       Amend action (unchanged)
    find-pending-request.ts  Shared utility (unchanged)
```

**File count**: ~22 source files (from ~20). LOC estimate: ~2,800 (from ~2,200).

### Dependency Graph

```
                    mcp-server.ts
                    /           \
           pact-discover    action-dispatcher
               |            /   |   |   \  ...
           pact-loader   send respond claim inbox status thread
               |           |     |     |
           defaults-merge  |     |     |
                          \|/   \|/   \|/
                         ports.ts (interfaces)
                            |
                    adapters/ (implementations)
                            |
                    git repo + fs + config.json
```

All dependencies point inward. No handler depends on another handler. Adapters implement port interfaces. `defaults-merge.ts` is a pure function with zero dependencies.

---

## Infrastructure Components

### What Exists (Sufficient)

| Component | Implementation | Notes |
|-----------|---------------|-------|
| **Runtime** | Node.js 20+ | LTS. Matrix-tested against 20 and 22 in CI |
| **Package manager** | bun | Fast installs, lockfile in repo |
| **Build** | esbuild via `build.ts` | Single ESM bundle `dist/index.js`, externalized deps |
| **Type checking** | TypeScript 5.x strict mode | `noEmit`, `noUncheckedIndexedAccess` |
| **Testing** | vitest (unit, integration, acceptance) | 96 tests, 3-tier structure |
| **Mutation testing** | Stryker (vitest runner) | 9 core files targeted, 4 concurrency |
| **CI** | GitHub Actions | Matrix Node 20/22, typecheck + tests + build |
| **Distribution** | npm package (`files: ["dist/"]`) | Single artifact |
| **Transport** | stdio (JSON-RPC) | No HTTP, no WebSocket, no ports to bind |
| **State** | Git repository | Flat files, git as coordination layer |
| **Logging** | Structured JSON to stderr | 4 levels, field-based, $0 cost |
| **Config** | `config.json` in repo | Team members, read by ConfigAdapter |

### What pact-fmt Adds (Zero New Infrastructure)

No new dependencies. No new services. No new ports. No new adapters.

The feature adds:
- 2 new TypeScript source files (`pact-claim.ts`, `defaults-merge.ts`)
- Schema extensions (Zod, already in use)
- Domain logic changes in 9 existing files
- File layout change: `responses/{id}/{user}.json` (directory per request)
- New Stryker mutation targets: `pact-claim.ts`, `defaults-merge.ts`

### What Does NOT Exist (By Design)

| Not Present | Rationale |
|-------------|-----------|
| HTTP/WebSocket server | stdio MCP -- no network endpoints |
| Docker/containers | Local dev tool -- runs on host Node.js |
| Database | Git repository is the data store |
| Cache layer | File reads are fast enough for ~100 users |
| Service mesh | Single process, no services |
| Secret management | `PACT_USER` and `PACT_REPO` env vars, no secrets |
| CDN/static hosting | CLI tool, no web UI |
| Health endpoints | No HTTP server to expose them on |
| Feature flags | ~2,800 LOC -- code branching is sufficient |

---

## Scalability Characteristics

### Current Design Point

- ~100 users across teams of 10-12
- 20-30 repositories with pact stores
- Group sizes: 2-12 recipients per request
- Concurrency: git retry/rebase handles claim races

### Scaling Limits (Known, Accepted)

| Dimension | Limit | Bottleneck | Mitigation (if needed) |
|-----------|-------|-----------|----------------------|
| Group size | ~50 recipients | Envelope JSON size, response dir listing | Directory sharding (deferred) |
| Concurrent claims | ~10 simultaneous | Git push retry (1 retry) | Increase retry count (trivial) |
| Inbox scan | ~500 pending requests | Sequential file reads | Directory sharding by date prefix |
| Pact catalog | ~100 pact definitions | Recursive directory scan | Cache in memory per invocation |

None of these limits are relevant at the current design point (~100 users). Documented for future reference only.

---

## Security Model

### Threat Surface

Minimal. PACT runs as a local subprocess with the same permissions as the MCP host. No network listeners. No authentication (git credentials handle remote auth).

| Vector | Mitigation |
|--------|-----------|
| Malicious pact definitions | Zod schema validation on all parsed input |
| Envelope tampering | Git commit history provides audit trail; no code execution from envelopes |
| Claim spoofing | `claimed_by` uses `PACT_USER` env var (same trust model as git commits) |
| Response visibility bypass | Filtering at read time in domain logic; git file permissions are OS-level |
| Dependency supply chain | `npm audit` in CI (see ci-cd-pipeline.md); 4 runtime deps, all well-known |

### Trust Boundaries

```
Trusted: MCP host <-> PACT process (same user, same machine, stdio)
Trusted: PACT process <-> local git repo (same user, same filesystem)
Semi-trusted: local git <-> remote (git SSH/HTTPS auth)
```

The security perimeter is the developer's machine. PACT inherits the machine's security posture.

---

## Deployment Architecture

### Artifact

Single npm package containing `dist/index.js` (ESM bundle) + `package.json`.

### Installation

```bash
npm install -g pact     # Global
npm install pact        # Project-local
npx pact                # One-shot
```

### Runtime Configuration

| Variable | Required | Purpose |
|----------|----------|---------|
| `PACT_REPO` | Yes | Path to git repository with pact store |
| `PACT_USER` | Yes | Current user's user_id |
| `PACT_LOG_LEVEL` | No | debug, info, warn, error (default: info) |

### Upgrade Strategy

`npm update pact`. New version replaces old. No migration scripts needed -- file format changes (e.g., per-respondent responses) are handled with backward-compatible reading logic in the domain handlers.

---

## Platform Decisions for pact-fmt

### Decision 1: No Infrastructure Changes

**Decision**: pact-fmt requires zero infrastructure changes.
**Rationale**: All group features are domain logic (TypeScript code changes). The existing infrastructure (Node.js, esbuild, vitest, git, stdio) handles everything.
**Consequence**: Zero setup cost. Zero operational cost change. Zero new failure modes from infrastructure.

### Decision 2: File Layout as Schema Migration

**Decision**: Per-respondent response directories (`responses/{id}/{user}.json`) replace single response files.
**Rationale**: Enables response counting, visibility filtering, and conflict-free concurrent writes.
**Consequence**: Respond handler includes backward-compatible read logic (check file vs directory). No migration tool needed.

### Decision 3: Git as Coordination Primitive

**Decision**: Claim exclusivity uses git atomic write + push retry, not a locking service.
**Rationale**: Git is already the coordination layer. Adding a lock service would introduce a new dependency and failure mode for ~100 users.
**Consequence**: Second claimer resolves via pull-rebase-retry. Documented as ERR1 error path.
