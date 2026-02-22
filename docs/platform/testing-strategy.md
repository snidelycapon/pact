# Testing Strategy -- GARP MCP Server

## Scope

Testing strategy for a ~500 line TypeScript MCP server with 4 tool handlers, 3 driven ports (Git, Config, File), and structured JSON envelopes. The ports-and-adapters architecture enables clean separation between unit tests (mocked ports) and integration tests (real git repos).

---

## 1. Test Pyramid

```
                  /\
                 /  \          Manual: MCP Inspector + Craft Agents
                / 1  \         (not automated, developer-driven)
               /------\
              /        \       Integration: 3-5 tests
             /   5-8    \      Real temp git repos, full tool lifecycle
            /------------\
           /              \    Unit: 20-30 tests
          /    20-30       \   Mocked ports, handler logic, schemas
         /------------------\
```

| Layer | Count | What | Speed |
|-------|-------|------|-------|
| Unit | 20-30 | Tool handlers, envelope validation, ID generation, logger | <2s total |
| Integration | 3-5 | Full request/respond lifecycle with real git repos | <10s total |
| Manual | ad hoc | MCP Inspector, Craft Agents round-trip | Developer-driven |

---

## 2. Unit Tests

### Test Runner

Bun's built-in test runner (`bun test`). It is fast, TypeScript-native (no compile step), and compatible with Jest-style `describe`/`it`/`expect` API.

```typescript
import { describe, it, expect, beforeEach } from "bun:test";
```

If Bun causes CI issues, Vitest is the fallback (same API, runs on Node.js).

### Mocking Strategy: Port Interfaces

The ports-and-adapters architecture provides natural seams for mocking. Each driven port is a TypeScript interface. Unit tests inject mock implementations.

```typescript
// src/ports/git-port.ts
export interface GitPort {
  pull(): Promise<void>;
  add(files: string[]): Promise<void>;
  commit(message: string): Promise<void>;
  push(): Promise<void>;
  mv(from: string, to: string): Promise<void>;
}

// src/ports/file-port.ts
export interface FilePort {
  readJSON<T>(path: string): Promise<T>;
  writeJSON(path: string, data: unknown): Promise<void>;
  listDirectory(path: string): Promise<string[]>;
  exists(path: string): Promise<boolean>;
}

// src/ports/config-port.ts
export interface ConfigPort {
  getMembers(): Promise<Array<{ user_id: string; display_name: string }>>;
  lookupUser(userId: string): Promise<{ user_id: string; display_name: string } | null>;
}
```

### Mock Implementations

```typescript
// test/mocks/mock-git.ts
export function createMockGit(): GitPort & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async pull() { calls.push("pull"); },
    async add(files) { calls.push(`add:${files.join(",")}`); },
    async commit(msg) { calls.push(`commit:${msg}`); },
    async push() { calls.push("push"); },
    async mv(from, to) { calls.push(`mv:${from}->${to}`); },
  };
}

// test/mocks/mock-file.ts
export function createMockFile(
  files: Record<string, unknown> = {}
): FilePort {
  const store = new Map(Object.entries(files));
  return {
    async readJSON<T>(path: string) {
      const data = store.get(path);
      if (!data) throw new Error(`File not found: ${path}`);
      return data as T;
    },
    async writeJSON(path, data) { store.set(path, data); },
    async listDirectory(path) {
      return [...store.keys()]
        .filter(k => k.startsWith(path) && k !== path)
        .map(k => k.slice(path.length + 1).split("/")[0])
        .filter(Boolean);
    },
    async exists(path) { return store.has(path); },
  };
}

// test/mocks/mock-config.ts
export function createMockConfig(
  members = [
    { user_id: "alice", display_name: "Alice" },
    { user_id: "bob", display_name: "Bob" },
  ]
): ConfigPort {
  return {
    async getMembers() { return members; },
    async lookupUser(id) { return members.find(m => m.user_id === id) ?? null; },
  };
}
```

### Unit Test Plan

#### Tool Handler Tests (`test/unit/tools/`)

| Test File | Cases | What It Validates |
|-----------|-------|-------------------|
| `garp-request.test.ts` | 5-6 | Creates valid envelope, generates request ID, validates required fields, rejects unknown recipient, rejects missing skill directory, calls git pull+add+commit+push in order |
| `garp-inbox.test.ts` | 4-5 | Calls git pull first, filters by current user, returns empty array when no pending, parses request JSON correctly, includes skill_path in response |
| `garp-respond.test.ts` | 5-6 | Writes response file, moves request via git mv, atomic commit (response + move in one commit), rejects if not recipient, rejects if already completed, calls push with rebase retry |
| `garp-status.test.ts` | 4-5 | Searches completed first then pending, returns status + response bundle for completed, returns pending status without response, returns not-found error, calls git pull first |

#### Schema Tests (`test/unit/schemas/`)

| Test File | Cases | What It Validates |
|-----------|-------|-------------------|
| `envelope.test.ts` | 6-8 | Valid request envelope passes, missing required field fails (one test per field), extra fields allowed in context_bundle, ISO 8601 date format enforced, request_id format validated |
| `config.test.ts` | 3-4 | Valid config passes, missing members fails, empty members array fails, member without user_id fails |

#### Lib Tests (`test/unit/lib/`)

| Test File | Cases | What It Validates |
|-----------|-------|-------------------|
| `request-id.test.ts` | 4 | Format matches `req-YYYYMMDD-HHmmss-{user}-{hex4}`, contains user ID, hex suffix is 4 chars, two consecutive calls produce different IDs |
| `logger.test.ts` | 3-4 | Writes JSON to stderr, respects log level filtering, includes timestamp and level fields, includes extra fields |

### Example Unit Test

```typescript
// test/unit/tools/garp-request.test.ts
import { describe, it, expect, beforeEach } from "bun:test";
import { handleGarpRequest } from "../../../src/tools/garp-request";
import { createMockGit } from "../../mocks/mock-git";
import { createMockFile } from "../../mocks/mock-file";
import { createMockConfig } from "../../mocks/mock-config";

describe("garp_request", () => {
  let git: ReturnType<typeof createMockGit>;
  let file: ReturnType<typeof createMockFile>;
  let config: ReturnType<typeof createMockConfig>;

  beforeEach(() => {
    git = createMockGit();
    file = createMockFile({
      "skills/sanity-check/SKILL.md": "# Sanity Check\n...",
    });
    config = createMockConfig();
  });

  it("creates a valid request envelope in pending directory", async () => {
    const result = await handleGarpRequest(
      {
        request_type: "sanity-check",
        recipient: "bob",
        context_bundle: { question: "Does this make sense?" },
      },
      { userId: "alice", repoPath: "/repo" },
      { git, file, config }
    );

    expect(result.request_id).toMatch(/^req-\d{8}-\d{6}-alice-[0-9a-f]{4}$/);
    expect(result.status).toBe("pending");
  });

  it("rejects unknown recipient", async () => {
    const promise = handleGarpRequest(
      {
        request_type: "sanity-check",
        recipient: "unknown-user",
        context_bundle: {},
      },
      { userId: "alice", repoPath: "/repo" },
      { git, file, config }
    );

    await expect(promise).rejects.toThrow("not found in team config");
  });

  it("calls git operations in correct order", async () => {
    await handleGarpRequest(
      {
        request_type: "sanity-check",
        recipient: "bob",
        context_bundle: {},
      },
      { userId: "alice", repoPath: "/repo" },
      { git, file, config }
    );

    expect(git.calls[0]).toBe("pull");
    expect(git.calls[1]).toMatch(/^add:/);
    expect(git.calls[2]).toMatch(/^commit:/);
    expect(git.calls[3]).toBe("push");
  });
});
```

---

## 3. Integration Tests

Integration tests use real git repos created in temp directories. No network access -- a local bare repo simulates the remote.

### Setup Utility

```typescript
// test/integration/helpers/test-repo.ts
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";

export interface TestRepoContext {
  remotePath: string;   // Bare repo (simulates GitHub)
  aliceRepo: string;    // Alice's clone
  bobRepo: string;      // Bob's clone
  cleanup: () => void;
}

export function createTestRepos(): TestRepoContext {
  const base = mkdtempSync(join(tmpdir(), "garp-test-"));
  const remotePath = join(base, "remote.git");
  const aliceRepo = join(base, "alice");
  const bobRepo = join(base, "bob");

  // Create bare remote
  execSync(`git init --bare ${remotePath}`);

  // Clone for Alice
  execSync(`git clone ${remotePath} ${aliceRepo}`);
  execSync(`
    cd ${aliceRepo} &&
    git config user.email "alice@test.com" &&
    git config user.name "Alice" &&
    mkdir -p requests/pending requests/active requests/completed responses skills/sanity-check &&
    echo '{"team_name":"Test","version":1,"members":[{"user_id":"alice","display_name":"Alice"},{"user_id":"bob","display_name":"Bob"}]}' > config.json &&
    echo '# Sanity Check' > skills/sanity-check/SKILL.md &&
    touch requests/pending/.gitkeep requests/active/.gitkeep requests/completed/.gitkeep responses/.gitkeep &&
    git add -A && git commit -m "init" && git push origin main
  `);

  // Clone for Bob
  execSync(`git clone ${remotePath} ${bobRepo}`);
  execSync(`
    cd ${bobRepo} &&
    git config user.email "bob@test.com" &&
    git config user.name "Bob"
  `);

  return {
    remotePath,
    aliceRepo,
    bobRepo,
    cleanup: () => execSync(`rm -rf ${base}`),
  };
}
```

### Integration Test Plan

| Test | What It Validates |
|------|-------------------|
| **Full round-trip** | Alice sends request -> Bob checks inbox -> Bob responds -> Alice checks status. Verifies end-to-end lifecycle across two repo clones with real git push/pull |
| **Concurrent requests** | Alice sends two requests to Bob. Bob's inbox shows both. Responds to each. Both end up in completed |
| **Push conflict retry** | Alice and Bob both push simultaneously (simulated). Rebase retry succeeds |
| **Invalid state handling** | Attempt to respond to already-completed request. Attempt to respond as non-recipient. Both return structured errors |

### Example Integration Test

```typescript
// test/integration/round-trip.test.ts
import { describe, it, expect, afterEach } from "bun:test";
import { createTestRepos, type TestRepoContext } from "./helpers/test-repo";
import { createGarpServer } from "../../src/index";

describe("GARP round-trip", () => {
  let ctx: TestRepoContext;

  afterEach(() => ctx?.cleanup());

  it("completes a full request-respond lifecycle", async () => {
    ctx = createTestRepos();

    // Alice sends a request
    const aliceServer = createGarpServer({
      repoPath: ctx.aliceRepo,
      userId: "alice",
    });

    const requestResult = await aliceServer.callTool("garp_request", {
      request_type: "sanity-check",
      recipient: "bob",
      context_bundle: { question: "Does the data model look right?" },
    });

    expect(requestResult.request_id).toBeTruthy();
    const requestId = requestResult.request_id;

    // Bob checks inbox
    const bobServer = createGarpServer({
      repoPath: ctx.bobRepo,
      userId: "bob",
    });

    const inbox = await bobServer.callTool("garp_inbox", {});
    expect(inbox.requests).toHaveLength(1);
    expect(inbox.requests[0].request_id).toBe(requestId);

    // Bob responds
    const respondResult = await bobServer.callTool("garp_respond", {
      request_id: requestId,
      response_bundle: { verdict: "Looks good", notes: "No issues found" },
    });

    expect(respondResult.status).toBe("completed");

    // Alice checks status
    const status = await aliceServer.callTool("garp_status", {
      request_id: requestId,
    });

    expect(status.status).toBe("completed");
    expect(status.response.verdict).toBe("Looks good");
  });
});
```

---

## 4. What Is NOT Tested (and why)

| Excluded | Rationale |
|----------|-----------|
| MCP protocol framing (JSON-RPC) | Tested by `@modelcontextprotocol/sdk`. We test tool handlers, not the SDK |
| Git internals (commit, merge) | Tested by `simple-git` and git itself. We test our usage of it |
| Craft Agents source loading | Craft Agents responsibility. Not in our codebase |
| Network git operations (SSH, HTTPS) | Integration tests use local bare repos. Network auth is the user's git config |
| Skill file content parsing | MCP server is type-agnostic. Skills are agent-level guidance, not parsed by the server |

---

## 5. Test Fixtures

Minimal set of fixtures for consistent test data.

```
test/fixtures/
  config.json               # Standard 2-member team config
  valid-request.json        # Valid request envelope (all fields)
  minimal-request.json      # Request with only required fields
  invalid-request.json      # Missing required fields (for error tests)
  skills/
    sanity-check/
      SKILL.md              # Minimal valid skill file
```

### Fixture: valid-request.json

```json
{
  "request_id": "req-20260221-143022-alice-a1b2",
  "request_type": "sanity-check",
  "sender": {
    "user_id": "alice",
    "display_name": "Alice"
  },
  "recipient": {
    "user_id": "bob",
    "display_name": "Bob"
  },
  "status": "pending",
  "created_at": "2026-02-21T14:30:22.000Z",
  "context_bundle": {
    "question": "Does this data model make sense?",
    "context": "Working on the user authentication flow"
  }
}
```

---

## 6. Coverage Targets

Not enforced in CI at MVP. Targets for when coverage gates are added:

| Area | Target | Rationale |
|------|--------|-----------|
| Tool handlers (`src/tools/`) | 90% line | Core business logic. Every branch matters |
| Schema validation (`src/schemas/`) | 95% line | Envelope validation is a security boundary |
| Adapters (`src/adapters/`) | 60% line | Thin wrappers around libraries. Integration tests cover more meaningfully |
| Lib (`src/lib/`) | 80% line | Utility code with clear edge cases |
| Overall | 80% line | Reasonable for a ~500 line project |

### When to Add Coverage Gates

Add coverage gates to CI when:
1. Unit test suite covers all 4 tool handlers (20+ tests exist)
2. Two consecutive PRs pass all tests without flakiness
3. Coverage is measured and reported for at least one sprint

---

## 7. Test Environment Requirements

| Requirement | Notes |
|-------------|-------|
| Node.js 20+ | Runtime for the MCP server |
| Git 2.30+ | Required for `git mv`, used in integration tests |
| Bun (recommended) | Test runner. Vitest as fallback |
| No network | All tests run against local bare git repos |
| No Docker | Nothing to containerize |
| Temp directories | Integration tests create/destroy temp dirs. No cleanup leaks |

---

## 8. Manual Testing Checklist

For the walking skeleton (US-008), these manual tests validate the full stack:

- [ ] Build succeeds: `npm run build` produces `dist/index.js`
- [ ] MCP Inspector connects: `npx @modelcontextprotocol/inspector node dist/index.js`
- [ ] Inspector lists 4 tools: garp_request, garp_inbox, garp_respond, garp_status
- [ ] garp_request creates file in `requests/pending/` and pushes
- [ ] garp_inbox returns the request when run as the recipient
- [ ] garp_respond moves request to `completed/` and writes response
- [ ] garp_status returns completed status with response bundle
- [ ] Structured JSON logs appear on stderr during all operations
- [ ] Error messages are structured JSON (not stack traces) for invalid input
- [ ] Craft Agents loads the MCP source and all 4 tools appear in the agent's tool list
