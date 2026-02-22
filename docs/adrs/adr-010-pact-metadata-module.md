# ADR-010: Shared Pact Metadata Module

## Status: Accepted

## Context

US-019 (pact_pacts) and US-020 (inbox enrichment) both need to extract metadata from PACT.md files: title, description, when_to_use text, context field names, and response field names. US-021 (schema.json) adds an alternative source for field information. Three design options exist for where this shared logic lives.

The current codebase has no pact-parsing logic anywhere. The closest pattern is `find-pending-request.ts` -- a shared helper in `src/tools/` consumed by multiple tool handlers.

## Decision

Create a new module `src/pact-parser.ts` at the application core level (alongside `schemas.ts` and `ports.ts`). This module exports pure functions that accept `FilePort` as a parameter for file access. It does NOT define a new port interface -- pact parsing is application logic that uses the existing FilePort, not a new infrastructure boundary.

The module provides:
- Parsing PACT.md markdown into structured metadata
- Reading and validating schema.json when present
- A combined function that prefers schema.json fields and falls back to PACT.md

Functions accept `FilePort` + `repoPath` + `pactName` and return typed metadata objects. They are stateless and throw no errors on missing or malformed files -- they return partial results or undefined.

## Alternatives Considered

### New PactPort Interface

Define a `PactPort` interface in `ports.ts` with methods like `readPactMetadata(name)`, `readPactSchema(name)`, and implement it in a `PactAdapter`.

- **Pro**: Follows ports-and-adapters pattern for the pact reading concern
- **Pro**: Easy to test with a dedicated mock
- **Con**: Pact parsing is application-level logic (interpreting markdown structure), not infrastructure. Ports should wrap infrastructure boundaries (git, filesystem, config), not domain interpretation
- **Con**: Adds a new adapter class, a new port interface, and wiring in mcp-server.ts for logic that is only combining FilePort reads with string parsing
- **Rejection rationale**: The port/adapter boundary should be at the infrastructure edge. Parsing markdown into structured metadata is a domain concern that happens to read files. The FilePort already handles file access. Adding PactPort would blur the distinction between infrastructure and application logic.

### Inline Logic in Each Tool

Each tool (pact-pacts.ts, pact-inbox.ts) implements its own PACT.md parsing.

- **Pro**: No shared module needed. Each tool is fully self-contained
- **Con**: Duplicated parsing logic (regex, section extraction, field table parsing) across 2+ files
- **Con**: Bug fixes or PACT.md format changes require updating multiple files
- **Con**: Requirements explicitly state "shared pact parsing module"
- **Rejection rationale**: Duplication is certain and immediate. The parsing logic is non-trivial (section extraction, table parsing, fallback handling).

## Consequences

### Positive

- Single source of truth for PACT.md parsing logic
- Pure functions with FilePort dependency injection -- fully testable with in-memory FilePort
- Located alongside other application-core modules (schemas.ts, ports.ts) -- discoverable
- No new port/adapter ceremony for what is essentially string transformation
- Enables Phase B: the same module feeds pact_discover and SDK generation

### Negative

- Module sits at application core but depends on FilePort for I/O -- this is consistent with how tool handlers work, but the dependency is worth noting
- If a third metadata source emerges (e.g., database), the module would need refactoring
