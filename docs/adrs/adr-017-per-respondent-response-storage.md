# ADR-017: Per-Respondent Response Storage

## Status

Accepted

## Context

Group requests (multiple recipients) require storing multiple responses per request. The current system stores a single response at `responses/{request_id}.json`. With group addressing, we need to:
- Store one response per respondent
- Count responses for `response_mode: all` completion logic
- Filter responses for `visibility: private` (only requester + individual respondent can see each response)
- Avoid git conflicts when multiple respondents submit simultaneously

## Decision

Store group responses in a directory per request: `responses/{request_id}/{user_id}.json`.

Each file is a standard `ResponseEnvelope` with the same schema as today. The directory name is the request ID. The file name is the respondent's user ID.

For backward compatibility with existing single-response files:
1. Check if `responses/{request_id}` is a directory → new format
2. Check if `responses/{request_id}.json` is a file → old format
3. New responses always use the directory format

## Alternatives Considered

### A: Single response file with array of responses
Store all responses in one file: `responses/{request_id}.json` containing `{ responses: [...] }`.

**Rejected**: Creates git merge conflicts when two respondents submit simultaneously — both modify the same file. The directory approach gives each respondent their own file path, eliminating content conflicts entirely.

### B: Response files with compound names
Store as `responses/{request_id}-{user_id}.json` (flat, no directory).

**Rejected**: Harder to enumerate responses for a request (requires prefix-matching glob). Directory listing is simpler and more reliable. Also pollutes the `responses/` directory at scale.

## Consequences

- **Positive**: No git conflicts on concurrent responses (different file paths)
- **Positive**: Simple response counting via `listDirectory(responses/{request_id}/)`
- **Positive**: Simple visibility filtering by file name (user_id)
- **Positive**: Backward compatible with existing single-response files
- **Negative**: Directory creation overhead (mkdir per first response to a group request)
- **Negative**: Response lookup changes from `readJSON(responses/{id}.json)` to `listDirectory(responses/{id}/) → readJSON` for each
