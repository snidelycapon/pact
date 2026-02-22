# ADR-012: FilePort readText and fileExists Extensions

## Status: Accepted

## Context

The pact metadata module (ADR-010) needs to read PACT.md files as plain text and check whether schema.json exists before attempting to read it. The current FilePort interface has:

- `readJSON<T>(path)` -- reads and parses JSON
- `writeJSON(path, data)` -- writes JSON
- `writeText(path, content)` -- writes plain text
- `listDirectory(path)` -- lists directory entries
- `moveFile(from, to)` -- renames/moves files

There is no `readText(path)` (only writeText exists) and no `fileExists(path)`. The existing code uses Node's `existsSync` directly in `pact-request.ts` to check pact existence, bypassing the port boundary.

## Decision

Add two methods to the FilePort interface:

- `readText(path: string): Promise<string>` -- reads a file as UTF-8 text. Throws if file does not exist.
- `fileExists(path: string): Promise<boolean>` -- checks whether a file exists at the given path. Never throws.

These are natural extensions of the existing FilePort contract. The FileAdapter already imports `readFile` from `node:fs/promises`; adding `readText` is one line of delegation. `fileExists` wraps `access()` from `node:fs/promises`.

Also replace the direct `existsSync` call in `pact-request.ts` with `file.fileExists()` to fix the existing port boundary violation.

## Alternatives Considered

### Use readJSON for PACT.md by Wrapping in Try/Catch

Call `readJSON` on PACT.md, catch the JSON parse error, and use the raw string from the error context.

- **Pro**: No interface change needed
- **Con**: Abuses the readJSON contract. The method promises to return parsed JSON; using it for markdown is semantically wrong
- **Con**: Error handling path becomes the happy path, which is confusing and fragile
- **Rejection rationale**: Semantic contract violation. readJSON means "this file is JSON."

### Separate PactFilePort

Create a new port specifically for pact file operations.

- **Pro**: Clean separation of concerns
- **Con**: Over-engineering for what is a missing symmetry (writeText exists, readText does not). The FilePort is the right abstraction level for generic file I/O
- **Rejection rationale**: readText and fileExists are generic file operations, not pact-specific. They belong on FilePort.

## Consequences

### Positive

- Symmetric API: readText mirrors writeText, readJSON mirrors writeJSON
- fileExists replaces the port boundary violation in pact-request.ts
- Fully testable: in-memory FilePort test doubles can implement both trivially
- FileAdapter implementation is 2-3 lines per method

### Negative

- Interface change touches all FilePort implementations (production adapter + test doubles). Since there is one adapter and test doubles are controlled, this is minimal impact.
