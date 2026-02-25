/**
 * Acceptance Tests -- schema.json Convention and Validation Warnings
 *
 * Traces to: US-021
 *
 * Tests exercise the pact_request driving port (tool handler) against
 * real local git repos to verify schema.json validation behavior.
 * Scenarios verify:
 *   - pact_request warns when context_bundle is missing required fields defined in schema.json
 *   - pact_request does not warn when all required fields are present
 *   - pact_request skips validation entirely when no schema.json exists
 *   - Validation warnings are advisory (request still submits successfully)
 *   - schema.json allows additional properties beyond what is defined
 *   - Warning messages identify the missing field names
 *   - Malformed schema.json does not break request submission
 *
 * Error/edge scenarios: 4 of 9 total (44%)
 */

import { describe, it, expect, afterEach } from "vitest";
import {
  createTestRepos,
  listDir,
  readRepoJSON,
  type TestRepoContext,
} from "./helpers/setup-test-repos";
import { given, when, thenAssert } from "./helpers/gwt";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { createPactServer } from "../../src/server.ts";

// ---------------------------------------------------------------------------
// Schema fixture
// ---------------------------------------------------------------------------

const SANITY_CHECK_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  pact_name: "sanity-check",
  pact_version: "1.0.0",
  context_bundle: {
    type: "object",
    required: ["customer", "product", "issue_summary", "involved_files", "investigation_so_far", "question"],
    properties: {
      customer: { type: "string", description: "Customer name" },
      product: { type: "string", description: "Product name and version" },
      issue_summary: { type: "string", description: "Brief description of the issue" },
      involved_files: { type: "string", description: "Files examined" },
      investigation_so_far: { type: "string", description: "What you have found" },
      question: { type: "string", description: "Specific question for the reviewer" },
      zendesk_ticket: { type: "string", description: "Related Zendesk ticket ID" },
    },
    additionalProperties: true,
  },
  response_bundle: {
    type: "object",
    required: ["answer", "evidence", "recommendation"],
    properties: {
      answer: { type: "string", description: "YES / NO / PARTIALLY" },
      evidence: { type: "string", description: "What you compared" },
      concerns: { type: "string", description: "Risks or caveats" },
      recommendation: { type: "string", description: "Suggested next step" },
    },
    additionalProperties: true,
  },
};

/** Add schema.json to the sanity-check pact directory and push. */
function seedSchemaJson(repoPath: string, schema: Record<string, unknown> = SANITY_CHECK_SCHEMA): void {
  mkdirSync(join(repoPath, "pacts", "sanity-check"), { recursive: true });
  writeFileSync(
    join(repoPath, "pacts", "sanity-check", "schema.json"),
    JSON.stringify(schema, null, 2),
  );
  execSync(
    `cd "${repoPath}" && git add -A && git commit -m "add schema.json" && git push`,
    { stdio: "pipe" },
  );
}

describe("schema.json: typed pacts and validation warnings", () => {
  let ctx: TestRepoContext;

  afterEach(() => {
    ctx?.cleanup();
  });

  // =========================================================================
  // Walking Skeleton
  // =========================================================================

  it("warns on missing required fields and still submits the request successfully", async () => {
    ctx = createTestRepos();

    await given("the sanity-check pact has a schema.json with 6 required context fields", () => {
      seedSchemaJson(ctx.aliceRepo);
    });

    let result: any;

    await when("Alice submits a sanity-check request missing 'customer' and 'product'", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_do", { action: "send",
        request_type: "sanity-check",
        recipient: "bob",
        context_bundle: {
          issue_summary: "Memory leak in auth refresh flow",
          involved_files: "src/auth/refresh.ts:L45-90",
          investigation_so_far: "Tokens held by closure",
          question: "Does this match the session service pattern?",
          // customer and product intentionally omitted
        },
      });
    });

    await thenAssert("the request is submitted successfully (not rejected)", () => {
      expect(result.request_id).toBeTruthy();
      expect(result.status).toBe("pending");
    });

    await thenAssert("the response includes validation_warnings mentioning missing fields", () => {
      expect(result.validation_warnings).toBeDefined();
      expect(Array.isArray(result.validation_warnings)).toBe(true);
      expect(result.validation_warnings.length).toBe(2);

      const warningText = result.validation_warnings.join(" ");
      expect(warningText).toMatch(/customer/i);
      expect(warningText).toMatch(/product/i);
    });

    await thenAssert("the request file exists on disk with the submitted bundle", () => {
      const pending = listDir(ctx.aliceRepo, "requests/pending");
      expect(pending).toHaveLength(1);

      const envelope = readRepoJSON<{ context_bundle: Record<string, unknown> }>(
        ctx.aliceRepo,
        `requests/pending/${result.request_id}.json`,
      );
      expect(envelope.context_bundle.issue_summary).toBe("Memory leak in auth refresh flow");
      expect(envelope.context_bundle.question).toBe("Does this match the session service pattern?");
    });
  });

  // =========================================================================
  // Happy Path
  // =========================================================================

  it("does not include validation_warnings when all required fields are present", async () => {
    ctx = createTestRepos();

    await given("the sanity-check pact has a schema.json", () => {
      seedSchemaJson(ctx.aliceRepo);
    });

    let result: any;

    await when("Alice submits a request with all 6 required context fields", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_do", { action: "send",
        request_type: "sanity-check",
        recipient: "bob",
        context_bundle: {
          customer: "Acme Corp",
          product: "Platform v3.2",
          issue_summary: "Memory leak in auth refresh flow",
          involved_files: "src/auth/refresh.ts:L45-90",
          investigation_so_far: "Tokens held by closure, preventing GC",
          question: "Does this match the session service pattern?",
        },
      });
    });

    await thenAssert("the request is submitted successfully", () => {
      expect(result.request_id).toBeTruthy();
      expect(result.status).toBe("pending");
    });

    await thenAssert("the response includes an empty validation_warnings array", () => {
      expect(result.validation_warnings).toEqual([]);
    });
  });

  it("skips validation entirely when no schema.json exists for the pact", async () => {
    ctx = createTestRepos();

    await given("the sanity-check pact validates from YAML frontmatter (no schema.json needed)", () => {
      // createTestRepos already sets up sanity-check with just PACT.md
    });

    let result: any;

    await when("Alice submits a request with all required context fields", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_do", { action: "send",
        request_type: "sanity-check",
        recipient: "bob",
        context_bundle: {
          customer: "Acme Corp",
          product: "Platform v3.2",
          issue_summary: "Memory leak",
          involved_files: "src/auth/refresh.ts",
          investigation_so_far: "Tokens held by closure",
          question: "Does this look right?",
        },
      });
    });

    await thenAssert("the request is submitted successfully with no warnings", () => {
      expect(result.request_id).toBeTruthy();
      expect(result.status).toBe("pending");
      expect(result.validation_warnings).toEqual([]);
    });
  });

  it("allows additional properties beyond what schema.json defines without warning", async () => {
    ctx = createTestRepos();

    await given("the sanity-check schema.json has additionalProperties: true", () => {
      seedSchemaJson(ctx.aliceRepo);
    });

    let result: any;

    await when("Alice submits a request with all required fields plus extra fields", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_do", { action: "send",
        request_type: "sanity-check",
        recipient: "bob",
        context_bundle: {
          customer: "Acme Corp",
          product: "Platform v3.2",
          issue_summary: "Memory leak",
          involved_files: "src/auth/refresh.ts",
          investigation_so_far: "Tokens held by closure",
          question: "Pattern match?",
          internal_notes: "This is an extra field not in schema",
          priority: "high",
        },
      });
    });

    await thenAssert("the request is submitted with no warnings about extra fields", () => {
      expect(result.request_id).toBeTruthy();
      expect(result.validation_warnings).toEqual([]);
    });

    await thenAssert("the extra fields are preserved in the request envelope", () => {
      const envelope = readRepoJSON<{ context_bundle: Record<string, unknown> }>(
        ctx.aliceRepo,
        `requests/pending/${result.request_id}.json`,
      );
      expect(envelope.context_bundle.internal_notes).toBe("This is an extra field not in schema");
      expect(envelope.context_bundle.priority).toBe("high");
    });
  });

  it("warns only about the specific missing fields, not all required fields", async () => {
    ctx = createTestRepos();

    await given("the sanity-check schema.json requires 6 context fields", () => {
      seedSchemaJson(ctx.aliceRepo);
    });

    let result: any;

    await when("Alice submits a request missing only 'customer'", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_do", { action: "send",
        request_type: "sanity-check",
        recipient: "bob",
        context_bundle: {
          // customer intentionally omitted
          product: "Platform v3.2",
          issue_summary: "Memory leak",
          involved_files: "src/auth/refresh.ts",
          investigation_so_far: "Tokens held by closure",
          question: "Pattern match?",
        },
      });
    });

    await thenAssert("exactly one warning is returned, mentioning 'customer'", () => {
      expect(result.validation_warnings).toHaveLength(1);
      expect(result.validation_warnings[0]).toMatch(/customer/i);
    });

    await thenAssert("the request is still submitted", () => {
      expect(result.request_id).toBeTruthy();
      const pending = listDir(ctx.aliceRepo, "requests/pending");
      expect(pending).toHaveLength(1);
    });
  });

  // =========================================================================
  // Error Paths / Edge Cases
  // =========================================================================

  it("handles malformed schema.json gracefully by skipping validation", async () => {
    ctx = createTestRepos();

    await given("the sanity-check pact has a malformed schema.json (not valid JSON Schema)", () => {
      mkdirSync(join(ctx.aliceRepo, "pacts", "sanity-check"), { recursive: true });
      writeFileSync(
        join(ctx.aliceRepo, "pacts", "sanity-check", "schema.json"),
        JSON.stringify({ not_a_real_schema: true }),
      );
      execSync(
        `cd "${ctx.aliceRepo}" && git add -A && git commit -m "bad schema" && git push`,
        { stdio: "pipe" },
      );
    });

    let result: any;

    await when("Alice submits a sanity-check request", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_do", { action: "send",
        request_type: "sanity-check",
        recipient: "bob",
        context_bundle: {
          customer: "Acme Corp",
          product: "Platform v3.2",
          issue_summary: "Malformed schema test",
          involved_files: "src/test.ts",
          investigation_so_far: "Testing malformed schema handling",
          question: "Malformed schema test",
        },
      });
    });

    await thenAssert("the request submits successfully with no warnings (validation skipped)", () => {
      expect(result.request_id).toBeTruthy();
      expect(result.status).toBe("pending");
      expect(result.validation_warnings).toEqual([]);
    });
  });

  it("warns when context_bundle is completely empty but required fields exist", async () => {
    ctx = createTestRepos();

    await given("the sanity-check pact has a schema.json with 6 required fields", () => {
      seedSchemaJson(ctx.aliceRepo);
    });

    let result: any;

    await when("Alice submits a request with an empty context_bundle", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_do", { action: "send",
        request_type: "sanity-check",
        recipient: "bob",
        context_bundle: {},
      });
    });

    await thenAssert("the request submits successfully (WARN not REJECT)", () => {
      expect(result.request_id).toBeTruthy();
      expect(result.status).toBe("pending");
    });

    await thenAssert("6 validation warnings are returned, one per missing required field", () => {
      expect(result.validation_warnings).toHaveLength(6);
      const warningText = result.validation_warnings.join(" ");
      expect(warningText).toMatch(/customer/i);
      expect(warningText).toMatch(/product/i);
      expect(warningText).toMatch(/issue_summary/i);
      expect(warningText).toMatch(/involved_files/i);
      expect(warningText).toMatch(/investigation_so_far/i);
      expect(warningText).toMatch(/question/i);
    });
  });

  it("does not validate when pact has schema.json but context_bundle.required is absent", async () => {
    ctx = createTestRepos();

    await given("the sanity-check pact has a schema.json without a required array", () => {
      const schemaNoRequired = {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        pact_name: "sanity-check",
        pact_version: "1.0.0",
        context_bundle: {
          type: "object",
          properties: {
            question: { type: "string", description: "Question to ask" },
          },
          additionalProperties: true,
          // No required array
        },
      };
      mkdirSync(join(ctx.aliceRepo, "pacts", "sanity-check"), { recursive: true });
      writeFileSync(
        join(ctx.aliceRepo, "pacts", "sanity-check", "schema.json"),
        JSON.stringify(schemaNoRequired, null, 2),
      );
      execSync(
        `cd "${ctx.aliceRepo}" && git add -A && git commit -m "schema no required" && git push`,
        { stdio: "pipe" },
      );
    });

    let result: any;

    await when("Alice submits a request with minimal context", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_do", { action: "send",
        request_type: "sanity-check",
        recipient: "bob",
        context_bundle: {
          customer: "Acme Corp",
          product: "Platform v3.2",
          issue_summary: "No required array test",
          involved_files: "src/test.ts",
          investigation_so_far: "Testing schema without required",
          question: "No required array test",
        },
      });
    });

    await thenAssert("the request submits with no validation warnings", () => {
      expect(result.request_id).toBeTruthy();
      expect(result.validation_warnings).toEqual([]);
    });
  });

  it("existing workflows work identically when schema.json is not present", async () => {
    ctx = createTestRepos();

    await given("the sanity-check pact has only PACT.md (no schema.json)", () => {
      // Default test setup -- no schema.json
    });

    let result: any;

    await when("Alice submits a request exactly as before Phase A", async () => {
      const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });
      result = await server.callTool("pact_do", { action: "send",
        request_type: "sanity-check",
        recipient: "bob",
        context_bundle: {
          customer: "Acme Corp",
          product: "Platform v3.2",
          issue_summary: "Memory leak in auth refresh flow",
          involved_files: "src/auth/refresh.ts:L45-90",
          investigation_so_far: "Tokens held by closure, preventing GC",
          question: "Does this match the session service pattern?",
        },
      });
    });

    await thenAssert("the request is submitted identically to pre-Phase-A behavior", () => {
      expect(result.request_id).toBeTruthy();
      expect(result.status).toBe("pending");
      expect(result.validation_warnings).toEqual([]);
    });

    await thenAssert("the request envelope has the standard structure", () => {
      const envelope = readRepoJSON<Record<string, unknown>>(
        ctx.aliceRepo,
        `requests/pending/${result.request_id}.json`,
      );
      expect(envelope.request_type).toBe("sanity-check");
      expect(envelope.status).toBe("pending");
      expect((envelope.sender as any).user_id).toBe("alice");
      expect((envelope.recipient as any).user_id).toBe("bob");
    });
  });
});
