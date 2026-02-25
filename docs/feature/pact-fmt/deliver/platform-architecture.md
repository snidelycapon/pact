# Platform Architecture: pact-y30 (Post-Apathy Revision)

**Feature**: pact-y30 — Flat-file format, catalog metadata, default pacts, group addressing
**Architect**: Apex (nw-platform-architect)
**Date**: 2026-02-24
**Supersedes**: pact-q6y platform-architecture (pre-apathy, 2026-02-23)

---

## Platform Overview

PACT is a **local development tool**, not a cloud service. The "platform" is a developer's machine running an MCP host. There are no servers, containers, load balancers, or cloud resources.

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

### Component Layout (post pact-y30)

```
src/
  index.ts              Entry point (stdio transport setup)
  server.ts             MCP server configuration
  mcp-server.ts         Tool registration + request routing
  action-dispatcher.ts  Action string -> handler mapping (7 actions, unchanged)
  schemas.ts            Zod schemas (adds: recipients[], group_ref)
  pact-loader.ts        Flat-file glob + inheritance resolution (replaces dir-per-pact)
  logger.ts             Structured JSON to stderr
  request-id.ts         Deterministic ID generation
  ports.ts              Port interfaces (GitPort, ConfigPort, FilePort)
  adapters/
    git-adapter.ts      simple-git wrapper with retry
    file-adapter.ts     fs/promises wrapper
    config-adapter.ts   config.json reader
  tools/
    pact-do.ts          Action entry point
    pact-request.ts     Send action (adds: recipients[], group_ref)
    pact-respond.ts     Respond action (adds: per-respondent files)
    pact-inbox.ts       Inbox action (adds: multi-recipient filtering)
    pact-status.ts      Status action (adds: directory response read)
    pact-thread.ts      Thread action (adds: directory response read)
    pact-discover.ts    Discovery action (adds: compressed catalog, scope filter)
    pact-cancel.ts      Cancel action (unchanged)
    pact-amend.ts       Amend action (unchanged)
    find-pending-request.ts  Shared utility (unchanged)
```

**File count**: ~20 source files (unchanged). **LOC estimate**: ~2,600 (from ~2,200).

No new files created. No `pact-claim.ts`. No `defaults-merge.ts`. All changes are modifications to existing files.

### Dependency Graph

```
                    mcp-server.ts
                    /           \
           pact-discover    action-dispatcher
               |            /   |   |   \  ...
           pact-loader   send respond inbox status thread
                          |     |     |
                         \|/   \|/   \|/
                         ports.ts (interfaces)
                            |
                    adapters/ (implementations)
                            |
                    git repo + fs + config.json
```

All dependencies point inward. No handler depends on another handler. Adapters implement port interfaces. No new modules in the dependency graph -- just schema and logic changes within existing files.

---

## Infrastructure Components

### What Exists (Sufficient)

| Component | Implementation | Notes |
|-----------|---------------|-------|
| **Runtime** | Node.js 20+ | LTS. Matrix-tested against 20 and 22 in CI |
| **Package manager** | Bun | Fast installs, lockfile in repo |
| **Build** | esbuild via `build.ts` | Single ESM bundle `dist/index.js`, externalized deps |
| **Type checking** | TypeScript 5.x strict mode | `noEmit`, `noUncheckedIndexedAccess` |
| **Testing** | vitest (unit, integration, acceptance) | 96 tests, 3-tier structure |
| **Mutation testing** | Stryker (vitest runner) | 11 core files targeted, 4 concurrency |
| **CI** | GitHub Actions | Matrix Node 20/22, typecheck + tests + build |
| **Distribution** | npm package (`files: ["dist/"]`) | Single artifact |
| **Transport** | stdio (JSON-RPC) | No HTTP, no WebSocket, no ports to bind |
| **State** | Git repository | Flat files, git as coordination layer |
| **Logging** | Structured JSON to stderr | 4 levels, field-based, $0 cost |
| **Config** | `config.json` in repo | Team members, read by ConfigAdapter |

### What pact-y30 Adds (Zero New Infrastructure)

No new dependencies. No new services. No new ports. No new adapters.

The feature adds:
- Schema extensions in `schemas.ts` (Zod, already in use)
- Flat-file glob + inheritance resolution in `pact-loader.ts`
- `recipients[]` and `group_ref` handling in 4 action handlers
- Per-respondent directory layout in `pact-respond.ts`
- Compressed catalog format in `pact-discover.ts`
- 8 default pact `.md` files in `pact-store/`

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
| Feature flags | ~2,600 LOC -- code branching is sufficient |
| Claim action | Agent coordination, not transport (apathy audit) |
| Defaults-merge module | Agents read frontmatter directly (apathy audit) |
| Response completion logic | First response completes, agents coordinate the rest (apathy audit) |

---

## Scalability Characteristics

### Current Design Point

- ~100 users across teams of 10-12
- 20-30 repositories with pact stores
- Group sizes: 2-12 recipients per request
- Concurrency: git retry/rebase handles push races

### Scaling Limits (Known, Accepted)

| Dimension | Limit | Bottleneck | Mitigation (if needed) |
|-----------|-------|-----------|----------------------|
| Group size | ~50 recipients | Envelope JSON size, response dir listing | Directory sharding (deferred) |
| Inbox scan | ~500 pending requests | Sequential file reads | Directory sharding by date prefix |
| Pact catalog | ~100 pact definitions | Recursive directory scan | Cache in memory per invocation |
| Git push races | ~10 simultaneous | Git push retry (1 retry) | Increase retry count (trivial) |

None of these limits are relevant at the current design point. Documented for future reference only.

---

## Security Model

### Threat Surface

Minimal. PACT runs as a local subprocess with the same permissions as the MCP host. No network listeners. No authentication (git credentials handle remote auth).

| Vector | Mitigation |
|--------|-----------|
| Malicious pact definitions | Zod schema validation on all parsed input |
| Envelope tampering | Git commit history provides audit trail; no code execution from envelopes |
| Dependency supply chain | `npm audit` in CI (see ci-cd-pipeline.md); 4 runtime deps, all well-known |
| Frontmatter injection | YAML parser (`yaml` package) with safe defaults; no `!!js/function` or custom tags |

### Trust Boundaries

```
Trusted: MCP host <-> PACT process (same user, same machine, stdio)
Trusted: PACT process <-> local git repo (same user, same filesystem)
Semi-trusted: local git <-> remote (git SSH/HTTPS auth)
```

The security perimeter is the developer's machine. PACT inherits the machine's security posture.

**Note on visibility**: Frontmatter `visibility: private` is agent guidance, not access control. Git has no file-level ACL. A well-behaved agent respects the guidance; the protocol does not enforce it.

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
| `PACT_STORE` | No | Pact store root within repo (default: `./pact-store/`) |
| `PACT_LOG_LEVEL` | No | debug, info, warn, error (default: info) |

### Upgrade Strategy

`npm update pact`. New version replaces old. No migration scripts needed -- file format changes are handled with backward-compatible reading logic:

- `recipient` (old) coerced to `recipients[]` (new) on read
- `responses/{id}.json` (old single file) and `responses/{id}/` (new directory) both supported
- `pacts/{name}/PACT.md` (old directory layout) falls back if flat-file glob finds nothing

---

## Platform Decisions for pact-y30

### Decision 1: No Infrastructure Changes

**Decision**: pact-y30 requires zero infrastructure changes.
**Rationale**: All features are schema/loader changes and file layout changes. The existing infrastructure handles everything.
**Consequence**: Zero setup cost. Zero operational cost change. Zero new failure modes from infrastructure.

### Decision 2: File Layout as Schema Migration

**Decision**: Per-respondent response directories (`responses/{id}/{user}.json`) replace single response files.
**Rationale**: Enables conflict-free concurrent writes from multiple respondents.
**Consequence**: Respond handler includes backward-compatible read logic. No migration tool needed.

### Decision 3: No New Modules

**Decision**: No `pact-claim.ts`, no `defaults-merge.ts`, no new source files.
**Rationale**: Apathy audit cut claim action (agent coordination) and defaults-merge (agents read frontmatter directly). All remaining work fits within existing files.
**Consequence**: Dependency graph is unchanged. No new testing seams needed.
