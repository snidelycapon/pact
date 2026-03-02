/**
 * Acceptance Tests -- pact_do({ action: "send" }) (Submit a PACT Request)
 *
 * Traces to: US-002
 *
 * Tests exercise the pact_do collapsed tool surface with action "send"
 * against real local git repos. Scenarios verify:
 *   - Successful request submission with valid envelope
 *   - Request ID format and uniqueness
 *   - Envelope validation (missing fields)
 *   - Recipient validation against team config
 *   - Pact directory existence validation
 *   - Git commit message format
 *   - Git push with rebase retry on conflict
 *   - Thread ID passthrough (US-002a)
 *   - File attachments with atomic commit (US-002a)
 *   - Backward compatibility without thread/attachments (US-002a)
 *   - Compose mode: pact schema returned when context_bundle omitted
 *   - Compose mode: structural assertions and error on unknown pact
 *
 * Error/edge scenarios: 6 of 17 total (35%)
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, afterEach } from "vitest";
import {
  createTestRepos,
  listDir,
  readRepoJSON,
  readRepoFile,
  fileExists,
  lastCommitMessage,
  gitPull,
  type TestRepoContext,
} from "./helpers/setup-test-repos";
import { given, when, thenAssert } from "./helpers/gwt";
import { execSync } from "node:child_process";
import { createPactServer } from "../../src/server.ts";

describe("pact_do(send): submit a PACT request", () => {
  let ctx: TestRepoContext;

  afterEach(() => {
    ctx?.cleanup();
  });

  // =========================================================================
  // Happy Path
  // =========================================================================

  it("submits a sanity-check request with valid envelope and pushes to remote", async () => {
    ctx = createTestRepos();
    const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });

    let requestId: string;

    await given("Alice has a configured server and Bob is a team member", () => {
      // Server created above; config.json has alice + bob
    });

    await when("Alice submits a sanity-check request to Bob", async () => {
      const result = (await server.callTool("pact_do", { action: "send",
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
      })) as { request_id: string; status: string; message: string };
      requestId = result.request_id;
      // Verify return value includes correct message
      expect(result.message).toBe("Request submitted");
      expect(result.status).toBe("pending");
    });

    await thenAssert("a request file is created in pending with correct envelope", async () => {
      const pending = listDir(ctx.aliceRepo, "requests/pending");
      expect(pending).toHaveLength(1);
      expect(pending[0]).toBe(`${requestId}.json`);

      const envelope = readRepoJSON(ctx.aliceRepo, `requests/pending/${requestId}.json`);
      expect(envelope).toMatchObject({
        request_id: requestId,
        request_type: "sanity-check",
        status: "pending",
        sender: { user_id: "alice", display_name: "alice" },
        recipient: { user_id: "bob" },
        expected_response: { type: "text" },
        context_bundle: {
          customer: "Acme Corp",
          question: "Does this match the session service pattern?",
        },
      });
      expect((envelope as { created_at: string }).created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO 8601
    });

    await thenAssert("the file is committed with a structured message and pushed", async () => {
      const msg = lastCommitMessage(ctx.aliceRepo);
      expect(msg).toMatch(/\[pact\] new request:.*sanity-check.*-> bob/);

      // Verify it reached the remote (Bob can pull it)
      gitPull(ctx.bobRepo);
      const bobPending = listDir(ctx.bobRepo, "requests/pending");
      expect(bobPending).toHaveLength(1);
    });
  });

  it("generates a request ID matching the required format", async () => {
    ctx = createTestRepos();
    const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });

    await when("Alice submits a request", async () => {
      const result = (await server.callTool("pact_do", { action: "send",
        request_type: "sanity-check",
        recipient: "bob",
        context_bundle: { question: "Format test" },
      })) as { request_id: string };

      // Format: req-{YYYYMMDD}-{HHmmss}-{user_id}-{random4hex}
      expect(result.request_id).toMatch(/^req-\d{8}-\d{6}-alice-[0-9a-f]{4}$/);
    });
  });

  it("includes sender identity from PACT_USER, not from tool input", async () => {
    ctx = createTestRepos();
    const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });

    await when("Alice submits a request (sender resolved from PACT_USER)", async () => {
      const result = (await server.callTool("pact_do", { action: "send",
        request_type: "sanity-check",
        recipient: "bob",
        context_bundle: { question: "Identity test" },
      })) as { request_id: string };

      const envelope = readRepoJSON<{ sender: { user_id: string; display_name: string } }>(
        ctx.aliceRepo,
        `requests/pending/${result.request_id}.json`,
      );
      expect(envelope.sender.user_id).toBe("alice");
      expect(envelope.sender.display_name).toBe("alice");
    });
  });

  it("includes optional deadline field when provided", async () => {
    ctx = createTestRepos();
    const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });

    await when("Alice submits a request with a deadline", async () => {
      const result = (await server.callTool("pact_do", { action: "send",
        request_type: "sanity-check",
        recipient: "bob",
        context_bundle: { question: "Deadline test" },
        deadline: "2026-02-21T18:00:00Z",
      })) as { request_id: string };

      const envelope = readRepoJSON<{ deadline: string }>(
        ctx.aliceRepo,
        `requests/pending/${result.request_id}.json`,
      );
      expect(envelope.deadline).toBe("2026-02-21T18:00:00Z");
    });
  });

  it("accepts any context_bundle shape without server validation", async () => {
    ctx = createTestRepos();
    const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });

    await when("Alice submits a request with an unusual context bundle", async () => {
      const result = (await server.callTool("pact_do", { action: "send",
        request_type: "sanity-check",
        recipient: "bob",
        context_bundle: {
          custom_field: "whatever the agent wants",
          nested: { deeply: { here: true } },
          array_data: [1, 2, 3],
        },
      })) as { request_id: string };

      const envelope = readRepoJSON<{ context_bundle: Record<string, unknown> }>(
        ctx.aliceRepo,
        `requests/pending/${result.request_id}.json`,
      );
      expect(envelope.context_bundle.custom_field).toBe("whatever the agent wants");
      expect((envelope.context_bundle.nested as { deeply: { here: boolean } }).deeply.here).toBe(true);
    });
  });

  // =========================================================================
  // Error Paths
  // =========================================================================

  it("accepts request to any recipient without config validation", async () => {
    ctx = createTestRepos();
    const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });

    await when("Alice sends a request to unknown recipient 'charlie'", async () => {
      const result = (await server.callTool("pact_do", { action: "send",
        request_type: "sanity-check",
        recipient: "charlie",
        context_bundle: { question: "Unknown recipient test" },
      })) as { request_id: string; status: string };
      expect(result.request_id).toBeTruthy();
      expect(result.status).toBe("pending");
    });
  });

  it("rejects request when request_type has no matching pact directory", async () => {
    ctx = createTestRepos();
    const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });

    await when("Alice submits a request with type 'code-review' (no pact file)", async () => {
      await expect(
        server.callTool("pact_do", { action: "send",
          request_type: "code-review",
          recipient: "bob",
          context_bundle: { question: "Missing pact test" },
        }),
      ).rejects.toThrow(/no pact found.*code-review/i);
    });

    await thenAssert("no file is created", async () => {
      const pending = listDir(ctx.aliceRepo, "requests/pending");
      expect(pending).toHaveLength(0);
    });
  });

  it("rejects request missing required field: recipient", async () => {
    ctx = createTestRepos();
    const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });

    await when("Alice submits a request without a recipient", async () => {
      await expect(
        server.callTool("pact_do", { action: "send",
          request_type: "sanity-check",
          context_bundle: { question: "Missing field test" },
          // recipient omitted
        }),
      ).rejects.toThrow(/missing required field.*recipient/i);
    });
  });

  it("rejects request missing required field: request_type", async () => {
    ctx = createTestRepos();
    const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });

    await when("Alice submits a request without a request_type", async () => {
      await expect(
        server.callTool("pact_do", { action: "send",
          recipient: "bob",
          context_bundle: { question: "Missing type test" },
          // request_type omitted
        }),
      ).rejects.toThrow(/missing required field.*request_type/i);
    });
  });


  // =========================================================================
  // Protocol Extensions: thread_id and attachments (US-002a)
  // =========================================================================

  it("preserves explicit thread_id in envelope and return value when provided", async () => {
    ctx = createTestRepos();
    const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });

    let requestId: string;
    let threadId: string;

    await when("Alice submits a request with an explicit thread_id", async () => {
      const result = (await server.callTool("pact_do", { action: "send",
        request_type: "sanity-check",
        recipient: "bob",
        context_bundle: { question: "Follow-up on yesterday's investigation" },
        thread_id: "req-20260220-100000-alice-0001",
      })) as { request_id: string; thread_id: string };
      requestId = result.request_id;
      threadId = result.thread_id;
    });

    await thenAssert("the envelope contains thread_id matching the provided value", async () => {
      const envelope = readRepoJSON<{ thread_id: string; request_id: string }>(
        ctx.aliceRepo,
        `requests/pending/${requestId}.json`,
      );
      expect(envelope.thread_id).toBe("req-20260220-100000-alice-0001");
      expect(envelope.request_id).toBe(requestId);
      // thread_id and request_id are different
      expect(envelope.thread_id).not.toBe(envelope.request_id);
    });

    await thenAssert("the return value includes the explicit thread_id", async () => {
      expect(threadId).toBe("req-20260220-100000-alice-0001");
    });
  });

  it("submits a request with file attachments written to disk and metadata in envelope", async () => {
    ctx = createTestRepos();
    const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });

    let requestId: string;

    await when("Alice submits a request with two attachments", async () => {
      const result = (await server.callTool("pact_do", { action: "send",
        request_type: "sanity-check",
        recipient: "bob",
        context_bundle: { question: "Can you check these logs?" },
        attachments: [
          { filename: "crash.log", description: "Application error log", content: "Error at line 42\nNullPointerException" },
          { filename: "config.yml", description: "Deployment config", content: "env: production\nreplicas: 3" },
        ],
      })) as { request_id: string };
      requestId = result.request_id;
    });

    await thenAssert("attachment files exist on disk", async () => {
      expect(fileExists(ctx.aliceRepo, `attachments/${requestId}/crash.log`)).toBe(true);
      expect(fileExists(ctx.aliceRepo, `attachments/${requestId}/config.yml`)).toBe(true);
    });

    await thenAssert("envelope contains attachment metadata without file content", async () => {
      const envelope = readRepoJSON<{ attachments?: Array<{ filename: string; description: string; content?: string }> }>(
        ctx.aliceRepo,
        `requests/pending/${requestId}.json`,
      );
      expect(envelope.attachments).toHaveLength(2);
      expect(envelope.attachments![0]).toEqual({ filename: "crash.log", description: "Application error log" });
      expect(envelope.attachments![1]).toEqual({ filename: "config.yml", description: "Deployment config" });
      // Content should NOT be in the envelope
      expect(envelope.attachments![0].content).toBeUndefined();
    });

    await thenAssert("attachments are pushed to remote alongside the request", async () => {
      gitPull(ctx.bobRepo);
      expect(fileExists(ctx.bobRepo, `attachments/${requestId}/crash.log`)).toBe(true);
      expect(fileExists(ctx.bobRepo, `attachments/${requestId}/config.yml`)).toBe(true);
      expect(fileExists(ctx.bobRepo, `requests/pending/${requestId}.json`)).toBe(true);
    });
  });

  it("auto-assigns thread_id = request_id when thread_id not provided", async () => {
    ctx = createTestRepos();
    const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });

    let requestId: string;
    let threadId: string;

    await when("Alice submits a request with no thread_id", async () => {
      const result = (await server.callTool("pact_do", { action: "send",
        request_type: "sanity-check",
        recipient: "bob",
        context_bundle: { question: "Simple question, no extras" },
      })) as { request_id: string; thread_id: string };
      requestId = result.request_id;
      threadId = result.thread_id;
    });

    await thenAssert("thread_id equals request_id in the envelope", async () => {
      const envelope = readRepoJSON<{ thread_id: string; request_id: string }>(
        ctx.aliceRepo,
        `requests/pending/${requestId}.json`,
      );
      expect(envelope.thread_id).toBe(requestId);
      expect(envelope.thread_id).toBe(envelope.request_id);
    });

    await thenAssert("return value includes thread_id matching request_id", async () => {
      expect(threadId).toBe(requestId);
    });
  });

  it("omits attachments from envelope when not provided", async () => {
    ctx = createTestRepos();
    const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });

    let requestId: string;

    await when("Alice submits a basic request with no attachments", async () => {
      const result = (await server.callTool("pact_do", { action: "send",
        request_type: "sanity-check",
        recipient: "bob",
        context_bundle: { question: "Simple question, no extras" },
      })) as { request_id: string };
      requestId = result.request_id;
    });

    await thenAssert("envelope has no attachments key", async () => {
      const envelope = readRepoJSON<Record<string, unknown>>(
        ctx.aliceRepo,
        `requests/pending/${requestId}.json`,
      );
      expect("attachments" in envelope).toBe(false);
    });
  });

  // =========================================================================
  // Error Paths (continued)
  // =========================================================================

  it("retries push after rebase when remote has new commits", async () => {
    ctx = createTestRepos();
    const aliceServer = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });

    await given("Bob pushes an unrelated commit while Alice is composing", async () => {
      // Simulate: Bob makes a commit directly, Alice's local is now behind
      execSync(
        `cd "${ctx.bobRepo}" && echo "note" > notes.txt && git add notes.txt && git commit -m "unrelated" && git push`,
        { stdio: "pipe" },
      );
    });

    await when("Alice submits a request (her local is behind)", async () => {
      const result = (await aliceServer.callTool("pact_do", { action: "send",
        request_type: "sanity-check",
        recipient: "bob",
        context_bundle: { question: "Rebase retry test" },
      })) as { request_id: string };

      // Should succeed after pull --rebase + retry
      expect(result.request_id).toBeTruthy();
    });

    await thenAssert("the request reaches the remote successfully", async () => {
      gitPull(ctx.bobRepo);
      const pending = listDir(ctx.bobRepo, "requests/pending");
      expect(pending).toHaveLength(1);
    });
  });

  // =========================================================================
  // Compose Mode (two-phase send)
  // =========================================================================

  it("returns compose-mode response with pact schema when context_bundle omitted", async () => {
    ctx = createTestRepos();
    const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });

    await when("Alice sends with request_type but no context_bundle", async () => {
      const result = (await server.callTool("pact_do", { action: "send",
        request_type: "sanity-check",
        // context_bundle intentionally omitted
      })) as {
        mode: string;
        request_type: string;
        description: string;
        when_to_use: string[];
        context_bundle: { required: string[]; fields: Record<string, { type: string; description: string }> };
        response_bundle: { required: string[]; fields: Record<string, { type: string; description: string }> };
        defaults?: Record<string, unknown>;
        multi_round?: boolean;
      };

      expect(result.mode).toBe("compose");
      expect(result.request_type).toBe("sanity-check");
      expect(result.description).toBe("Validate findings on a bug investigation");
      expect(result.when_to_use).toContain("You need a colleague to validate your findings on a bug investigation");
      expect(result.context_bundle.required).toContain("customer");
      expect(result.context_bundle.required).toContain("question");
      expect(result.context_bundle.fields.customer).toEqual({ type: "string", description: "Customer name" });
      expect(result.response_bundle.required).toContain("answer");
      expect(result.response_bundle.fields.answer).toEqual({ type: "string", description: "YES / NO / PARTIALLY with explanation" });
    });

    await thenAssert("no request file is created (compose mode is read-only)", async () => {
      const pending = listDir(ctx.aliceRepo, "requests/pending");
      expect(pending).toHaveLength(0);
    });
  });

  it("throws pact-not-found when compose mode gets unknown request_type", async () => {
    ctx = createTestRepos();
    const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });

    await when("Alice sends with an unknown request_type and no context_bundle", async () => {
      await expect(
        server.callTool("pact_do", { action: "send",
          request_type: "nonexistent-pact",
          // context_bundle intentionally omitted — triggers compose mode
        }),
      ).rejects.toThrow(/no pact found.*nonexistent-pact/i);
    });
  });

  // =========================================================================
  // Path-based Attachments (binary-safe)
  // =========================================================================

  it("attaches a file by absolute path, copying it binary-safe into the repo", async () => {
    ctx = createTestRepos();
    const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });

    // Create a test file outside the repo to attach
    const externalFile = join(ctx.basePath, "external-log.txt");
    writeFileSync(externalFile, "line 1\nline 2\nline 3\n");

    let requestId: string;

    await when("Alice submits a request with a path-based attachment", async () => {
      const result = (await server.callTool("pact_do", { action: "send",
        request_type: "sanity-check",
        recipient: "bob",
        context_bundle: { question: "Check these logs" },
        attachments: [
          { path: externalFile, description: "External log file" },
        ],
      })) as { request_id: string };
      requestId = result.request_id;
    });

    await thenAssert("the file is copied into the attachments directory", async () => {
      expect(fileExists(ctx.aliceRepo, `attachments/${requestId}/external-log.txt`)).toBe(true);
      const content = readRepoFile(ctx.aliceRepo, `attachments/${requestId}/external-log.txt`);
      expect(content.toString("utf-8")).toBe("line 1\nline 2\nline 3\n");
    });

    await thenAssert("envelope has metadata with inferred filename", async () => {
      const envelope = readRepoJSON<{ attachments?: Array<{ filename: string; description: string }> }>(
        ctx.aliceRepo,
        `requests/pending/${requestId}.json`,
      );
      expect(envelope.attachments).toHaveLength(1);
      expect(envelope.attachments![0]).toEqual({
        filename: "external-log.txt",
        description: "External log file",
      });
    });
  });

  it("attaches a binary file by path without corruption", async () => {
    ctx = createTestRepos();
    const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });

    // Create a binary file (fake PNG header + random bytes)
    const binaryFile = join(ctx.basePath, "image.png");
    const pngHeader = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    const randomBytes = Buffer.alloc(64);
    for (let i = 0; i < 64; i++) randomBytes[i] = Math.floor(Math.random() * 256);
    const binaryContent = Buffer.concat([pngHeader, randomBytes]);
    writeFileSync(binaryFile, binaryContent);

    let requestId: string;

    await when("Alice submits a request with a binary attachment", async () => {
      const result = (await server.callTool("pact_do", { action: "send",
        request_type: "sanity-check",
        recipient: "bob",
        context_bundle: { question: "Check this screenshot" },
        attachments: [
          { path: binaryFile, description: "UI screenshot" },
        ],
      })) as { request_id: string };
      requestId = result.request_id;
    });

    await thenAssert("the binary file is copied without corruption", async () => {
      const stored = readRepoFile(ctx.aliceRepo, `attachments/${requestId}/image.png`);
      expect(Buffer.compare(stored, binaryContent)).toBe(0);
    });

    await thenAssert("the file reaches the remote via git push", async () => {
      gitPull(ctx.bobRepo);
      const stored = readRepoFile(ctx.bobRepo, `attachments/${requestId}/image.png`);
      expect(Buffer.compare(stored, binaryContent)).toBe(0);
    });
  });

  it("allows overriding the filename when using path-based attachment", async () => {
    ctx = createTestRepos();
    const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });

    const externalFile = join(ctx.basePath, "ugly-name-v2-final-FINAL.log");
    writeFileSync(externalFile, "log content here");

    let requestId: string;

    await when("Alice submits with a path attachment and custom filename", async () => {
      const result = (await server.callTool("pact_do", { action: "send",
        request_type: "sanity-check",
        recipient: "bob",
        context_bundle: { question: "Renamed attachment test" },
        attachments: [
          { path: externalFile, filename: "server.log", description: "Production log" },
        ],
      })) as { request_id: string };
      requestId = result.request_id;
    });

    await thenAssert("the file is stored with the overridden filename", async () => {
      expect(fileExists(ctx.aliceRepo, `attachments/${requestId}/server.log`)).toBe(true);
      expect(fileExists(ctx.aliceRepo, `attachments/${requestId}/ugly-name-v2-final-FINAL.log`)).toBe(false);
    });
  });

  it("supports mixed content-based and path-based attachments in the same request", async () => {
    ctx = createTestRepos();
    const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });

    const externalFile = join(ctx.basePath, "config.yml");
    writeFileSync(externalFile, "env: production\nreplicas: 3");

    let requestId: string;

    await when("Alice submits with both content and path attachments", async () => {
      const result = (await server.callTool("pact_do", { action: "send",
        request_type: "sanity-check",
        recipient: "bob",
        context_bundle: { question: "Mixed attachments test" },
        attachments: [
          { filename: "notes.txt", content: "These are inline notes", description: "Inline notes" },
          { path: externalFile, description: "Deploy config" },
        ],
      })) as { request_id: string };
      requestId = result.request_id;
    });

    await thenAssert("both attachments exist on disk", async () => {
      expect(fileExists(ctx.aliceRepo, `attachments/${requestId}/notes.txt`)).toBe(true);
      expect(fileExists(ctx.aliceRepo, `attachments/${requestId}/config.yml`)).toBe(true);
    });

    await thenAssert("envelope has metadata for both", async () => {
      const envelope = readRepoJSON<{ attachments?: Array<{ filename: string; description: string }> }>(
        ctx.aliceRepo,
        `requests/pending/${requestId}.json`,
      );
      expect(envelope.attachments).toHaveLength(2);
      expect(envelope.attachments![0].filename).toBe("notes.txt");
      expect(envelope.attachments![1].filename).toBe("config.yml");
    });
  });

  it("rejects attachment with neither content nor path", async () => {
    ctx = createTestRepos();
    const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });

    await when("Alice submits with an empty attachment", async () => {
      await expect(
        server.callTool("pact_do", { action: "send",
          request_type: "sanity-check",
          recipient: "bob",
          context_bundle: { question: "Bad attachment test" },
          attachments: [
            { filename: "empty.txt", description: "No content or path" },
          ],
        }),
      ).rejects.toThrow(/content.*path/i);
    });
  });

  // =========================================================================
  // Compose Mode (two-phase send)
  // =========================================================================

  it("compose-mode response excludes send-only fields (request_id, thread_id, status)", async () => {
    ctx = createTestRepos();
    const server = createPactServer({ repoPath: ctx.aliceRepo, userId: "alice" });

    await when("Alice sends with request_type but no context_bundle", async () => {
      const result = (await server.callTool("pact_do", { action: "send",
        request_type: "sanity-check",
        // context_bundle intentionally omitted
      })) as Record<string, unknown>;

      // Compose-mode structural assertions
      expect(result.mode).toBe("compose");
      expect(typeof result.has_hooks).toBe("boolean");
      expect(result.scope).toBe("global");

      // Send-only fields must NOT be present
      expect("request_id" in result).toBe(false);
      expect("thread_id" in result).toBe(false);
      expect("status" in result).toBe(false);
    });
  });
});
