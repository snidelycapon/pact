# PACT Remaining Work

Status as of 2026-02-21. All Tier 1, Tier 2, and runtime schema validation fixes are complete. Test suite: 65 PACT tests pass, 0 fail.

---

## Item 7: CI Pipeline (GitHub Actions) — DEFERRED

**Source**: `docs/platform/platform-readiness.md` section 4

**What's specified**: GitHub Actions workflow with Node 20+22 matrix. Five blocking quality gates:
1. TypeScript compiles with zero errors
2. ESLint passes with zero errors
3. All unit tests pass
4. All integration tests pass
5. Build produces `dist/pact/index.js`

**What exists**: Only `.github/ISSUE_TEMPLATE/` — no workflow files.

**When to do it**: When PACT moves to its own repo. The current `craft-gm` repo has its own CI concerns (Electron app, marketing site, etc.) so a PACT-specific workflow here would be awkward. In the new repo, this is straightforward — a single `.github/workflows/ci.yml` with `bun test`, `bun run typecheck`, and `bun run build:pact`.

**Effort**: ~30 minutes.

---

## Item 8: PACT README — DEFERRED

**Source**: Roadmap step 04-02

**What's specified**: Setup instructions covering clone, build, env var configuration, and Craft Agents source registration. The `examples/source-config.json` was created but no README accompanies it.

**What exists**: The root `README.md` is for Craft Agents, not PACT.

**When to do it**: When PACT moves to its own repo. The README should be the first thing a new user sees. Content can be pulled directly from `docs/DELIVER-HANDOFF.md` sections 6 (env vars), 7 (source config), and the distribution paths in `docs/platform/platform-readiness.md`.

**Effort**: ~30 minutes.

---

## ~~Item 9: Runtime Schema Validation~~ — DONE

**Completed**: 2026-02-21

**What was done**: Wired Zod schemas (`RequestEnvelopeSchema`, `ResponseEnvelopeSchema`) into all three reading tool handlers:

- `pact-inbox.ts`: Parses each envelope through `RequestEnvelopeSchema`. Malformed files are skipped with a warning log — the inbox continues processing remaining files.
- `pact-respond.ts`: Parses the request envelope through `RequestEnvelopeSchema` before processing. Malformed envelopes throw an error (respond is a write operation — fail-fast is correct).
- `pact-status.ts`: Parses request and response envelopes through their respective schemas. Malformed envelopes are logged as warnings but raw data is still returned (status is read-only — degrade gracefully).

**Design decisions**:
- Inbox: skip + warn (don't crash the inbox over one bad file)
- Respond: throw (write path — must have valid data before proceeding)
- Status: warn + return raw (read-only — let the user see what's there)

All 65 PACT tests pass after the change.

---

## ~~Item 10: `pact_respond` Pull Failure Behavior~~ — CLOSED (no change)

**Decision**: Leave as-is. The fail-fast behavior is correct for a write operation.

`pact_respond` does `await ctx.git.pull()` without a try/catch. If the remote is unreachable, the entire tool call fails. This is intentional — responding requires the freshest possible data to avoid race conditions, and the subsequent `git push` would fail anyway.

This is an intentional inconsistency with `pact_inbox` and `pact_status`, which catch pull failures and fall back to local data (appropriate for read-only operations).
