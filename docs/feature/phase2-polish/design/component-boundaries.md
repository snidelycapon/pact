# Component Boundaries -- GARP Phase 2 Polish

## New Files

| File | Story | Responsibility | Dependencies |
|------|-------|---------------|-------------|
| `src/tools/garp-thread.ts` | US-009 | Scan all dirs for thread_id, pair with responses, return chronological history | ports.ts, schemas.ts, logger.ts |
| `src/tools/garp-cancel.ts` | US-013 | Validate sender + pending, update status, git mv to cancelled/, commit + push | ports.ts, schemas.ts |
| `src/tools/garp-amend.ts` | US-014 | Validate sender + pending, append amendment, rewrite envelope, commit + push | ports.ts, schemas.ts |
| `examples/skills/sanity-check/SKILL.md` | US-017 | Sanity-check skill contract | None |
| `examples/skills/code-review/SKILL.md` | US-018 | Code-review skill contract | None |
| `docs/conventions/inbox-autopoll.md` | US-016 | Auto-poll convention for MCP hosts | None |

## Modified Files

| File | Story | Change Description |
|------|-------|--------------------|
| `src/schemas.ts` | US-014, US-013 | Add `AmendmentEntrySchema`, add `amendments` + `cancel_reason` to `RequestEnvelopeSchema` |
| `src/tools/garp-request.ts` | US-010 | Set `thread_id = requestId` when not provided; add `thread_id` to return value |
| `src/tools/garp-inbox.ts` | US-011, US-012, US-014 | Thread grouping, attachment metadata, amendment_count |
| `src/tools/garp-respond.ts` | US-015 | Update `status` field to `"completed"` in envelope before git mv |
| `src/tools/garp-status.ts` | US-013, US-012 | Scan `cancelled/` directory; add `attachment_paths` to result |
| `src/server.ts` | US-009, US-013, US-014 | Add 3 case branches for new tools |
| `src/mcp-server.ts` | US-009, US-013, US-014 | Register 3 new tools with Zod params |
| `scripts/garp-init.sh` | US-013 | Add `requests/cancelled` to mkdir + .gitkeep |

## New Test Files

| File | Stories | Focus |
|------|---------|-------|
| `tests/acceptance/garp-thread.test.ts` | US-009 | Multi-round thread, single-round, not found, cancelled entries, git pull |
| `tests/acceptance/garp-cancel.test.ts` | US-013, US-015 | Sender cancels, non-sender blocked, completed blocked, cancelled blocked, not found, status field consistency |
| `tests/acceptance/garp-amend.test.ts` | US-014, US-015 | Sender amends, multiple amendments, non-sender blocked, completed blocked, cancelled blocked, original context preserved |
| `tests/unit/schemas.test.ts` | US-014 | AmendmentEntrySchema validation (extend existing) |

## Modified Test Files

| File | Stories | Change Description |
|------|---------|-------------------|
| `tests/acceptance/garp-request.test.ts` | US-010 | Auto thread_id assignment, thread_id in return value |
| `tests/acceptance/garp-inbox.test.ts` | US-011, US-012, US-014 | Thread grouping, attachment metadata, amendment_count, backward compat |
| `tests/acceptance/garp-status.test.ts` | US-013, US-012 | Cancelled status, attachment_paths |
| `tests/acceptance/garp-respond.test.ts` | US-015 | Status field set to "completed" in envelope |

## Unchanged Files

| File | Reason |
|------|--------|
| `src/ports.ts` | No new port methods needed. Existing GitPort, ConfigPort, FilePort are sufficient. |
| `src/request-id.ts` | No changes to ID generation. |
| `src/logger.ts` | No changes to logging. |
| `src/index.ts` | No changes to entry point. |
| `src/adapters/git-adapter.ts` | No new git operations. |
| `src/adapters/config-adapter.ts` | No new config operations. |
| `src/adapters/file-adapter.ts` | `writeJSON` already handles mkdir + write. `listDirectory` already filters .gitkeep. Sufficient for amend (read-modify-write) and cancel (read, write, mv). |

## Dependency Order for Implementation

```
1. schemas.ts          -- AmendmentEntrySchema, updated RequestEnvelopeSchema
2. garp-request.ts     -- US-010 (auto thread_id) -- unlocks US-009 and US-011
3. garp-thread.ts      -- US-009 (new tool, read-only)
4. garp-inbox.ts       -- US-011 (thread grouping, needs US-010)
5. garp-cancel.ts      -- US-013 (new tool, needs schema + cancelled dir)
6. garp-amend.ts       -- US-014 (new tool, needs AmendmentEntrySchema)
7. garp-respond.ts     -- US-015 (status consistency)
8. garp-status.ts      -- US-013 (cancelled scan) + US-012 (attachment paths)
9. garp-inbox.ts       -- US-012 (attachment metadata) + US-014 (amendment_count)
10. server.ts          -- wire new tools
11. mcp-server.ts      -- register new tools
12. garp-init.sh       -- add cancelled/
```

Steps 3-4 are parallelizable after step 2. Steps 5-6 are parallelizable with each other and with 3-4. Steps 10-12 can be done incrementally as each tool is completed.

## File Count Summary

| Category | Phase 1 | Phase 2 | Delta |
|----------|---------|---------|-------|
| Production source (.ts) | 12 | 15 | +3 |
| Test files | 13 | 17 | +4 |
| Skill contracts | 2 | 4 | +2 |
| Convention docs | 0 | 1 | +1 |
| Init scripts | 1 | 1 (modified) | 0 |
