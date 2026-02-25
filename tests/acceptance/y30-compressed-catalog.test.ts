/**
 * Milestone 3: Compressed Catalog and Scope Filtering
 *
 * pact-y30 epic — validates token-efficient discovery:
 *   - Compressed pipe-delimited catalog format (~15-25 tokens/entry)
 *   - Scope-based filtering on pact_discover
 *   - Inheritance-resolved entries in catalog
 *
 * Exercises driving port: pact_discover
 * Integration contract: IC5 (catalog matches full metadata)
 *
 * Error scenarios: 3 of 7 total (43%)
 *
 * @skip — Enable when compressed catalog is implemented.
 */

import { describe, it, expect, afterEach } from "vitest";
import {
  createTestRepos,
  type TestRepoContext,
} from "./helpers/setup-test-repos";
import { given, when, thenAssert } from "./helpers/gwt";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { createPactServer } from "../../src/server.ts";

// ---------------------------------------------------------------------------
// Fixtures (reuse format from y30-flat-file-loader tests)
// ---------------------------------------------------------------------------

const ASK_PACT = `---
name: ask
description: Get input that unblocks current work
scope: global
when_to_use:
  - You have a question that needs another person's perspective
context_bundle:
  required: [question]
  fields:
    question: { type: string, description: "The question" }
response_bundle:
  required: [answer]
  fields:
    answer: { type: string, description: "Direct answer" }
---

# Ask
`;

const TEAM_PACT = `---
name: deploy-approval
description: Request deployment approval from platform team
scope: team
registered_for: [team:platform]
when_to_use:
  - You need approval before deploying to production
context_bundle:
  required: [service, environment]
  fields:
    service: { type: string, description: "Service to deploy" }
    environment: { type: string, description: "Target environment" }
response_bundle:
  required: [approved]
  fields:
    approved: { type: boolean, description: "Whether deployment is approved" }
defaults:
  response_mode: all
---

# Deploy Approval
`;

const REPO_PACT = `---
name: security-review
description: Security-focused code review for auth service
scope: repo
registered_for: [repo:platform-auth]
when_to_use:
  - Changes touch authentication or authorization code
context_bundle:
  required: [pr_url, threat_model]
  fields:
    pr_url: { type: string, description: "Pull request URL" }
    threat_model: { type: string, description: "Relevant threats" }
response_bundle:
  required: [verdict, findings]
  fields:
    verdict: { type: string, description: "approve / block" }
    findings: { type: array, description: "Security findings" }
---

# Security Review
`;

function seedFlatFilePacts(
  repoPath: string,
  pacts: { path: string; content: string }[],
): void {
  // Clear pact-store/ to remove default pacts from createTestRepos
  const pactStorePath = join(repoPath, "pact-store");
  rmSync(pactStorePath, { recursive: true, force: true });
  mkdirSync(pactStorePath, { recursive: true });

  for (const pact of pacts) {
    const fullPath = join(repoPath, "pact-store", pact.path);
    mkdirSync(join(fullPath, ".."), { recursive: true });
    writeFileSync(fullPath, pact.content);
  }
  execSync(
    `cd "${repoPath}" && git add -A && git commit -m "seed flat-file pacts" && git push`,
    { stdio: "pipe" },
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Compressed catalog and scope filtering (pact-y30)", () => {
  let ctx: TestRepoContext;

  afterEach(() => {
    ctx?.cleanup();
  });

  // =========================================================================
  // Compressed catalog format
  // =========================================================================

  it("returns compressed pipe-delimited catalog for token efficiency", async () => {
    ctx = createTestRepos();

    await given("pact-store has multiple pacts of different scopes", () => {
      seedFlatFilePacts(ctx.aliceRepo, [
        { path: "ask.md", content: ASK_PACT },
        { path: "deploy-approval.md", content: TEAM_PACT },
        { path: "security-review.md", content: REPO_PACT },
      ]);
    });

    let result: any;

    await when("an agent calls pact_discover with format: 'compressed'", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_discover", { format: "compressed" });
    });

    await thenAssert("the catalog contains pipe-delimited entries", () => {
      expect(result.catalog).toBeDefined();
      const lines = result.catalog.split("\n").filter((l: string) => l.trim());
      expect(lines.length).toBeGreaterThanOrEqual(3);
      // Each line: name|description|scope|context_required→response_required
      for (const line of lines) {
        expect(line).toMatch(/\|/);
      }
    });

    await thenAssert("each entry includes name, description, scope, and bundle summary", () => {
      const lines = result.catalog.split("\n").filter((l: string) => l.trim());
      const askLine = lines.find((l: string) => l.startsWith("ask|"));
      expect(askLine).toBeDefined();
      expect(askLine).toContain("global");
      expect(askLine).toContain("question");
      expect(askLine).toContain("answer");
    });
  });

  it("compressed catalog entries match full pact metadata", async () => {
    ctx = createTestRepos();

    await given("pact-store has an ask pact", () => {
      seedFlatFilePacts(ctx.aliceRepo, [
        { path: "ask.md", content: ASK_PACT },
      ]);
    });

    let compressed: any;
    let full: any;

    await when("an agent fetches both compressed and full catalogs", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      compressed = await server.callTool("pact_discover", { format: "compressed" });
      full = await server.callTool("pact_discover", {});
    });

    await thenAssert("compressed entry name matches full metadata name", () => {
      const compressedLine = compressed.catalog.split("\n").find((l: string) => l.startsWith("ask|"));
      const fullPact = full.pacts.find((p: any) => p.name === "ask");
      expect(compressedLine).toContain(fullPact.name);
      expect(compressedLine).toContain(fullPact.description);
    });
  });

  // =========================================================================
  // Scope filtering
  // =========================================================================

  it("filters catalog by scope when scope parameter is provided", async () => {
    ctx = createTestRepos();

    await given("pact-store has global, team, and repo-scoped pacts", () => {
      seedFlatFilePacts(ctx.aliceRepo, [
        { path: "ask.md", content: ASK_PACT },
        { path: "deploy-approval.md", content: TEAM_PACT },
        { path: "security-review.md", content: REPO_PACT },
      ]);
    });

    let result: any;

    await when("an agent calls pact_discover with scope filter 'global'", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_discover", { scope: "global" });
    });

    await thenAssert("only global-scoped pacts are returned", () => {
      const names = result.pacts.map((p: any) => p.name);
      expect(names).toContain("ask");
      expect(names).not.toContain("deploy-approval");
      expect(names).not.toContain("security-review");
    });
  });

  it("returns all pacts when no scope filter is provided", async () => {
    ctx = createTestRepos();

    await given("pact-store has pacts of multiple scopes", () => {
      seedFlatFilePacts(ctx.aliceRepo, [
        { path: "ask.md", content: ASK_PACT },
        { path: "deploy-approval.md", content: TEAM_PACT },
      ]);
    });

    let result: any;

    await when("an agent calls pact_discover without scope filter", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_discover", {});
    });

    await thenAssert("all scopes are included in results", () => {
      const names = result.pacts.map((p: any) => p.name);
      expect(names).toContain("ask");
      expect(names).toContain("deploy-approval");
    });
  });

  // =========================================================================
  // Error paths
  // =========================================================================

  it("returns empty catalog for scope with no matching pacts", async () => {
    ctx = createTestRepos();

    await given("pact-store has only global-scoped pacts", () => {
      seedFlatFilePacts(ctx.aliceRepo, [
        { path: "ask.md", content: ASK_PACT },
      ]);
    });

    let result: any;

    await when("an agent filters by scope 'repo'", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_discover", { scope: "repo" });
    });

    await thenAssert("empty pacts array returned without error", () => {
      expect(result.pacts).toHaveLength(0);
    });
  });

  it("compressed format with empty pact-store returns empty catalog", async () => {
    ctx = createTestRepos();

    await given("pact-store is empty", () => {
      rmSync(join(ctx.aliceRepo, "pact-store"), { recursive: true, force: true });
      mkdirSync(join(ctx.aliceRepo, "pact-store"), { recursive: true });
      writeFileSync(join(ctx.aliceRepo, "pact-store", ".gitkeep"), "");
      execSync(
        `cd "${ctx.aliceRepo}" && git add -A && git commit -m "empty pact-store" && git push`,
        { stdio: "pipe" },
      );
    });

    let result: any;

    await when("an agent requests compressed catalog", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_discover", { format: "compressed" });
    });

    await thenAssert("empty catalog string returned without error", () => {
      expect(result.catalog).toBeDefined();
      const lines = result.catalog.split("\n").filter((l: string) => l.trim());
      expect(lines).toHaveLength(0);
    });
  });

  it("invalid scope value returns empty results (not an error)", async () => {
    ctx = createTestRepos();

    await given("pact-store has pacts", () => {
      seedFlatFilePacts(ctx.aliceRepo, [
        { path: "ask.md", content: ASK_PACT },
      ]);
    });

    let result: any;

    await when("an agent filters by invalid scope 'nonexistent'", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_discover", { scope: "nonexistent" });
    });

    await thenAssert("empty pacts array returned", () => {
      expect(result.pacts).toHaveLength(0);
    });
  });
});
