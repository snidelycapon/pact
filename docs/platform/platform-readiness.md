# Platform Readiness -- PACT MCP Server

## Scope

This document covers project scaffolding, CI/CD, structured logging, and distribution for the PACT MCP server. The server is a standalone TypeScript/Node.js project (~500 lines) that runs as a stdio subprocess. There is no cloud infrastructure, no container orchestration, no deployment pipeline in the traditional sense.

---

## 1. Project Structure

The PACT MCP server is a **standalone repository**, not a workspace package inside the Craft Agents monorepo. Rationale: it is distributed independently (npm/git clone), configured as an external MCP source, and has no compile-time dependency on Craft Agents internals.

The `craft-gm` repo holds design documents. The implementation repo (name TBD -- e.g., `pact-mcp` or `craft-pact`) holds the code.

```
pact-mcp/
  src/
    index.ts              # Entry point: MCP server setup, stdio transport
    tools/
      pact-request.ts    # pact_request handler
      pact-inbox.ts      # pact_inbox handler
      pact-respond.ts    # pact_respond handler
      pact-status.ts     # pact_status handler
    ports/
      git-port.ts         # GitPort interface
      config-port.ts      # ConfigPort interface
      file-port.ts        # FilePort interface
    adapters/
      git-adapter.ts      # simple-git implementation of GitPort
      config-adapter.ts   # JSON file reader for config.json
      file-adapter.ts     # Node.js fs implementation of FilePort
    schemas/
      envelope.ts         # Zod schemas for request/response envelopes
      config.ts           # Zod schema for config.json
    lib/
      request-id.ts       # ID generation (req-YYYYMMDD-HHmmss-user-random4)
      logger.ts           # Structured JSON logger
  test/
    unit/
      tools/              # Tool handler tests with mocked ports
      schemas/            # Envelope validation tests
      lib/                # ID generation, logger tests
    integration/
      round-trip.test.ts  # Full lifecycle with real temp git repos
    fixtures/
      config.json         # Test config
      valid-request.json  # Valid envelope fixture
      pacts/             # Test pact directories
  package.json
  tsconfig.json
  .github/
    workflows/
      ci.yml
  .gitignore
  .eslintrc.json
  README.md
```

### Conventions (aligned with existing Craft Agents MCP servers)

| Setting | Value | Rationale |
|---------|-------|-----------|
| Module format | CommonJS (`"type": "commonjs"`) | Matches session-mcp-server and bridge-mcp-server. Node.js stdio subprocess launched with `node dist/index.js` |
| Build tool | `bun build` (tsup as fallback) | Same as existing MCP servers. Single command: `bun build src/index.ts --outdir=dist --target=node --format=cjs` |
| Runtime | Node.js 20+ | Broadest compatibility for stdio MCP distribution |
| Package manager | npm for CI, Bun for local dev | npm ensures reproducibility in CI without requiring Bun. Bun for speed locally |
| Entry point | `dist/index.js` | With shebang `#!/usr/bin/env node` |

---

## 2. package.json

```json
{
  "name": "pact-mcp",
  "version": "0.1.0",
  "description": "Git-backed async PACT MCP server for agent-native workflows",
  "type": "commonjs",
  "main": "dist/index.js",
  "bin": {
    "pact-mcp": "./dist/index.js"
  },
  "scripts": {
    "build": "bun build src/index.ts --outdir=dist --target=node --format=cjs",
    "dev": "bun run src/index.ts",
    "test": "bun test",
    "test:unit": "bun test test/unit",
    "test:integration": "bun test test/integration",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src/ test/",
    "ci": "npm run typecheck && npm run lint && npm run test"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.24.0",
    "simple-git": "^3.27.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@typescript-eslint/eslint-plugin": "^8.0.0",
    "@typescript-eslint/parser": "^8.0.0",
    "eslint": "^9.0.0",
    "typescript": "^5.6.0"
  },
  "engines": {
    "node": ">=20.0.0"
  },
  "files": [
    "dist/"
  ]
}
```

**Notes:**
- `zod` pinned to v3.x (the Craft Agents monorepo uses v4.x, but the PACT server is standalone and v3 is more widely compatible as of this writing -- upgrade when v4 stabilizes)
- `"files": ["dist/"]` ensures only the built output is included in npm tarball
- `"bin"` enables `npx pact-mcp` after global install or `npx` invocation

---

## 3. tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "declaration": true,
    "skipLibCheck": true,
    "noUncheckedIndexedAccess": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "test"]
}
```

**Why CommonJS target (not ESM):** The existing Craft Agents MCP servers use CommonJS. The `@modelcontextprotocol/sdk` supports both. Staying CommonJS avoids ESM interop friction with `simple-git` and matches the `bun build --format=cjs` output. If the ecosystem moves to ESM, this is a one-line change.

---

## 4. GitHub Actions CI

Single workflow, trunk-based. Runs on every push to `main` and on PRs.

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  check:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [20, 22]
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: npm

      - run: npm ci

      - name: Type check
        run: npx tsc --noEmit

      - name: Lint
        run: npx eslint src/ test/

      - name: Unit tests
        run: npx bun test test/unit
        # Alternative if Bun not available in CI:
        # run: node --experimental-vm-modules node_modules/.bin/jest test/unit

      - name: Integration tests
        run: npx bun test test/integration

      - name: Build
        run: npm run build

      - name: Verify dist exists
        run: test -f dist/index.js
```

### CI Design Decisions

| Decision | Rationale |
|----------|-----------|
| Matrix: Node 20 + 22 | Users may have either. Node 20 is LTS, 22 is current |
| No Bun in CI runner | CI uses `npm ci` for reproducibility. `bun test` works via npx. Fallback to a Node-native test runner (vitest) if Bun causes CI issues |
| No separate deploy job | Nothing to deploy. The artifact is the git repo itself |
| No release automation (yet) | MVP. Manual `npm publish` if/when distributing via npm |
| No SAST/DAST | Disproportionate for a ~500 line CLI tool at MVP. Add when publishing to npm |
| No coverage gates | Add after test suite stabilizes. Target: 80% line coverage on tool handlers |

### Quality Gates

Every push to `main` must pass:
1. TypeScript compiles with zero errors (`tsc --noEmit`)
2. ESLint passes with zero errors
3. All unit tests pass
4. All integration tests pass
5. Build produces `dist/index.js`

These are blocking gates -- a failure on any step prevents merge.

---

## 5. Structured Logging

The MCP server communicates over stdio (stdin/stdout for JSON-RPC). Logs MUST go to stderr to avoid corrupting the MCP protocol stream. This is critical.

### Logger Design

```typescript
// src/lib/logger.ts
type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  ts: string;        // ISO 8601
  level: LogLevel;
  msg: string;
  tool?: string;     // Which MCP tool (pact_request, pact_inbox, etc.)
  request_id?: string;
  duration_ms?: number;
  error?: string;
  [key: string]: unknown;
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0, info: 1, warn: 2, error: 3,
};

const currentLevel: LogLevel =
  (process.env.PACT_LOG_LEVEL as LogLevel) ?? "info";

export function log(level: LogLevel, msg: string, fields?: Record<string, unknown>): void {
  if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[currentLevel]) return;

  const entry: LogEntry = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...fields,
  };
  process.stderr.write(JSON.stringify(entry) + "\n");
}
```

### Log Points

| Operation | Level | Fields |
|-----------|-------|--------|
| Tool invocation start | info | `tool`, `request_id` (if applicable) |
| Git pull/push | debug | `tool`, `duration_ms`, `operation` |
| Envelope validation failure | warn | `tool`, `error`, missing fields |
| Git push conflict + retry | warn | `tool`, `request_id`, `retry_count` |
| Git operation failure | error | `tool`, `error`, `operation` |
| Tool invocation complete | info | `tool`, `request_id`, `duration_ms` |

### Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `PACT_LOG_LEVEL` | `info` | Minimum log level: debug, info, warn, error |
| `PACT_REPO` | (required) | Path to local PACT repo clone |
| `PACT_USER` | (required) | Current user's ID for inbox filtering and sender attribution |

---

## 6. Distribution and Installation

Three installation paths, ordered by simplicity.

### Path A: Git Clone + Build (primary for MVP)

```bash
git clone git@github.com:{org}/pact-mcp.git
cd pact-mcp
npm install
npm run build
```

Then configure in Craft Agents source config:
```json
{
  "mcp": {
    "transport": "stdio",
    "command": "node",
    "args": ["/absolute/path/to/pact-mcp/dist/index.js"],
    "env": {
      "PACT_REPO": "/absolute/path/to/pact-repo-clone",
      "PACT_USER": "cory"
    }
  }
}
```

**Advantages:** Simplest for MVP. User can modify source. No publish step.
**Disadvantages:** Requires manual build. Path management.

### Path B: npm Global Install (post-MVP)

```bash
npm install -g pact-mcp
```

Then configure:
```json
{
  "mcp": {
    "transport": "stdio",
    "command": "pact-mcp",
    "args": [],
    "env": {
      "PACT_REPO": "/absolute/path/to/pact-repo-clone",
      "PACT_USER": "cory"
    }
  }
}
```

**Advantages:** Clean binary name. No path management. Version pinning via npm.
**Disadvantages:** Requires npm publish. Must publish to npm registry (or GitHub Packages).

### Path C: npx (post-MVP, zero-install)

```json
{
  "mcp": {
    "transport": "stdio",
    "command": "npx",
    "args": ["pact-mcp"],
    "env": {
      "PACT_REPO": "/absolute/path/to/pact-repo-clone",
      "PACT_USER": "cory"
    }
  }
}
```

**Advantages:** Zero install. Always latest.
**Disadvantages:** Cold start latency (~3-5s for npx download). Requires published npm package.

### Recommendation

**MVP: Path A (git clone).** The only user is the developer. No publish infrastructure needed.

**Post-MVP: Path B (npm global install).** When distributing to teammates. Add a `prepublishOnly` script that runs `npm run ci` to gate publishing on quality checks.

### Setup Script (MVP convenience)

Include a `setup.sh` in the repo for first-time setup:

```bash
#!/usr/bin/env bash
set -euo pipefail

echo "Building pact-mcp..."
npm install
npm run build

echo ""
echo "Build complete. Configure your MCP source with:"
echo ""
echo "  command: node"
echo "  args: [\"$(pwd)/dist/index.js\"]"
echo "  env:"
echo "    PACT_REPO: <path-to-your-pact-repo-clone>"
echo "    PACT_USER: <your-user-id>"
```

---

## 7. Dev Environment

### Local Development Loop

```bash
# Terminal 1: Watch and rebuild (if using tsup)
# For bun, no watch needed -- run source directly
bun run src/index.ts

# Or for manual testing via MCP Inspector:
npx @modelcontextprotocol/inspector node dist/index.js
```

### MCP Inspector

The MCP Inspector (`@modelcontextprotocol/inspector`) is the primary debugging tool. It provides a web UI to send tool calls to the stdio server and inspect responses. This replaces the need for a custom test harness.

```bash
# Build first
npm run build

# Launch inspector with env vars
PACT_REPO=/tmp/test-pact-repo PACT_USER=testuser \
  npx @modelcontextprotocol/inspector node dist/index.js
```

### Test Repo Setup (for development)

Developers need a local PACT repo to test against:

```bash
# Create a bare remote (simulates GitHub)
git init --bare /tmp/pact-remote.git

# Clone it as the working repo
git clone /tmp/pact-remote.git /tmp/test-pact-repo

# Initialize structure
cd /tmp/test-pact-repo
mkdir -p requests/pending requests/active requests/completed responses pacts
touch requests/pending/.gitkeep requests/active/.gitkeep \
      requests/completed/.gitkeep responses/.gitkeep pacts/.gitkeep

# Create test config
cat > config.json << 'EOF'
{
  "team_name": "Test Team",
  "version": 1,
  "members": [
    { "user_id": "alice", "display_name": "Alice" },
    { "user_id": "bob", "display_name": "Bob" }
  ]
}
EOF

git add -A && git commit -m "Initialize PACT repo" && git push origin main
```

This is documented in the README. Integration tests automate this setup.

---

## 8. .gitignore

```
node_modules/
dist/
*.tsbuildinfo
coverage/
.eslintcache
.DS_Store
.env
.env.local
```

---

## 9. Branch Strategy

Trunk-based development on `main`. No feature branches for MVP (single developer).

| Rule | Setting |
|------|---------|
| Default branch | `main` |
| Branch protection | Require CI to pass before merge (enable when collaborating) |
| Release tagging | `v0.1.0`, `v0.2.0` etc. -- manual git tags |
| Versioning | SemVer. 0.x until post-MVP stabilization |

---

## 10. Decisions Not Made (Deferred)

| Topic | Why Deferred | Trigger to Revisit |
|-------|-------------|-------------------|
| npm publish automation | No external users yet | When distributing to teammates |
| SAST/SCA scanning | Disproportionate for 500-line MVP with 3 dependencies | When publishing to npm registry |
| Coverage gates in CI | Test suite not written yet | After unit test suite stabilizes |
| Docker distribution | Users are developers with Node.js | If non-developer users appear |
| Release-please / changelog | Single developer, manual releases | When collaborating |
| Renovate / Dependabot | 3 runtime dependencies, low churn | When publishing to npm |
