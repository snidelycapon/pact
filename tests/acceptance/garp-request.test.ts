/**
 * Acceptance Tests -- garp_request (Submit a GARP Request)
 *
 * Traces to: US-002
 *
 * Tests exercise the garp_request driving port (tool handler) against
 * real local git repos. Scenarios verify:
 *   - Successful request submission with valid envelope
 *   - Request ID format and uniqueness
 *   - Envelope validation (missing fields)
 *   - Recipient validation against team config
 *   - Skill directory existence validation
 *   - Git commit message format
 *   - Git push with rebase retry on conflict
 *   - Thread ID passthrough (US-002a)
 *   - File attachments with atomic commit (US-002a)
 *   - Backward compatibility without thread/attachments (US-002a)
 *
 * Error/edge scenarios: 6 of 14 total (43%)
 */

import { describe, it, expect, afterEach } from "vitest";
import {
  createTestRepos,
  listDir,
  readRepoJSON,
  fileExists,
  lastCommitMessage,
  gitPull,
  type TestRepoContext,
} from "./helpers/setup-test-repos";
import { given, when, thenAssert } from "./helpers/gwt";
import { execSync } from "node:child_process";
import { createGarpServer } from "../../src/server.ts";

describe("garp_request: submit a GARP request", () => {
  let ctx: TestRepoContext;

  afterEach(() => {
    ctx?.cleanup();
  });

  // =========================================================================
  // Happy Path
  // =========================================================================

  it("submits a sanity-check request with valid envelope and pushes to remote", async () => {
    ctx = createTestRepos();
    const server = createGarpServer({ repoPath: ctx.aliceRepo, userId: "alice" });

    let requestId: string;

    await given("Alice has a configured server and Bob is a team member", () => {
      // Server created above; config.json has alice + bob
    });

    await when("Alice submits a sanity-check request to Bob", async () => {
      const result = (await server.callTool("garp_request", {
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
      })) as { request_id: string };
      requestId = result.request_id;
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
        sender: { user_id: "alice", display_name: "Alice" },
        recipient: { user_id: "bob", display_name: "Bob" },
        context_bundle: {
          customer: "Acme Corp",
          question: "Does this match the session service pattern?",
        },
      });
      expect((envelope as { created_at: string }).created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO 8601
    });

    await thenAssert("the file is committed with a structured message and pushed", async () => {
      const msg = lastCommitMessage(ctx.aliceRepo);
      expect(msg).toMatch(/\[garp\] new request:.*sanity-check.*-> bob/);

      // Verify it reached the remote (Bob can pull it)
      gitPull(ctx.bobRepo);
      const bobPending = listDir(ctx.bobRepo, "requests/pending");
      expect(bobPending).toHaveLength(1);
    });
  });

  it("generates a request ID matching the required format", async () => {
    ctx = createTestRepos();
    const server = createGarpServer({ repoPath: ctx.aliceRepo, userId: "alice" });

    await when("Alice submits a request", async () => {
      const result = (await server.callTool("garp_request", {
        request_type: "sanity-check",
        recipient: "bob",
        context_bundle: { question: "Format test" },
      })) as { request_id: string };

      // Format: req-{YYYYMMDD}-{HHmmss}-{user_id}-{random4hex}
      expect(result.request_id).toMatch(/^req-\d{8}-\d{6}-alice-[0-9a-f]{4}$/);
    });
  });

  it("includes sender identity from GARP_USER, not from tool input", async () => {
    ctx = createTestRepos();
    const server = createGarpServer({ repoPath: ctx.aliceRepo, userId: "alice" });

    await when("Alice submits a request (sender resolved from GARP_USER)", async () => {
      const result = (await server.callTool("garp_request", {
        request_type: "sanity-check",
        recipient: "bob",
        context_bundle: { question: "Identity test" },
      })) as { request_id: string };

      const envelope = readRepoJSON<{ sender: { user_id: string; display_name: string } }>(
        ctx.aliceRepo,
        `requests/pending/${result.request_id}.json`,
      );
      expect(envelope.sender.user_id).toBe("alice");
      expect(envelope.sender.display_name).toBe("Alice");
    });
  });

  it("includes optional deadline field when provided", async () => {
    ctx = createTestRepos();
    const server = createGarpServer({ repoPath: ctx.aliceRepo, userId: "alice" });

    await when("Alice submits a request with a deadline", async () => {
      const result = (await server.callTool("garp_request", {
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
    const server = createGarpServer({ repoPath: ctx.aliceRepo, userId: "alice" });

    await when("Alice submits a request with an unusual context bundle", async () => {
      const result = (await server.callTool("garp_request", {
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

  it("rejects request to a recipient not in team config", async () => {
    ctx = createTestRepos();
    const server = createGarpServer({ repoPath: ctx.aliceRepo, userId: "alice" });

    await when("Alice tries to send a request to unknown recipient 'charlie'", async () => {
      await expect(
        server.callTool("garp_request", {
          request_type: "sanity-check",
          recipient: "charlie",
          context_bundle: { question: "Unknown recipient test" },
        }),
      ).rejects.toThrow(/charlie.*not found in team config/i);
    });

    await thenAssert("no file is created and no commit is made", async () => {
      const pending = listDir(ctx.aliceRepo, "requests/pending");
      expect(pending).toHaveLength(0);
    });
  });

  it("rejects request when request_type has no matching skill directory", async () => {
    ctx = createTestRepos();
    const server = createGarpServer({ repoPath: ctx.aliceRepo, userId: "alice" });

    await when("Alice submits a request with type 'code-review' (no skill file)", async () => {
      await expect(
        server.callTool("garp_request", {
          request_type: "code-review",
          recipient: "bob",
          context_bundle: { question: "Missing skill test" },
        }),
      ).rejects.toThrow(/no skill found.*code-review/i);
    });

    await thenAssert("no file is created", async () => {
      const pending = listDir(ctx.aliceRepo, "requests/pending");
      expect(pending).toHaveLength(0);
    });
  });

  it("rejects request missing required field: recipient", async () => {
    ctx = createTestRepos();
    const server = createGarpServer({ repoPath: ctx.aliceRepo, userId: "alice" });

    await when("Alice submits a request without a recipient", async () => {
      await expect(
        server.callTool("garp_request", {
          request_type: "sanity-check",
          context_bundle: { question: "Missing field test" },
          // recipient omitted
        }),
      ).rejects.toThrow(/missing required field.*recipient/i);
    });
  });

  it("rejects request missing required field: request_type", async () => {
    ctx = createTestRepos();
    const server = createGarpServer({ repoPath: ctx.aliceRepo, userId: "alice" });

    await when("Alice submits a request without a request_type", async () => {
      await expect(
        server.callTool("garp_request", {
          recipient: "bob",
          context_bundle: { question: "Missing type test" },
          // request_type omitted
        }),
      ).rejects.toThrow(/missing required field.*request_type/i);
    });
  });

  it("rejects request missing required field: context_bundle", async () => {
    ctx = createTestRepos();
    const server = createGarpServer({ repoPath: ctx.aliceRepo, userId: "alice" });

    await when("Alice submits a request without a context_bundle", async () => {
      await expect(
        server.callTool("garp_request", {
          request_type: "sanity-check",
          recipient: "bob",
          // context_bundle omitted
        }),
      ).rejects.toThrow(/missing required field.*context_bundle/i);
    });
  });

  // =========================================================================
  // Protocol Extensions: thread_id and attachments (US-002a)
  // =========================================================================

  it("preserves explicit thread_id in envelope and return value when provided", async () => {
    ctx = createTestRepos();
    const server = createGarpServer({ repoPath: ctx.aliceRepo, userId: "alice" });

    let requestId: string;
    let threadId: string;

    await when("Alice submits a request with an explicit thread_id", async () => {
      const result = (await server.callTool("garp_request", {
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
    const server = createGarpServer({ repoPath: ctx.aliceRepo, userId: "alice" });

    let requestId: string;

    await when("Alice submits a request with two attachments", async () => {
      const result = (await server.callTool("garp_request", {
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
    const server = createGarpServer({ repoPath: ctx.aliceRepo, userId: "alice" });

    let requestId: string;
    let threadId: string;

    await when("Alice submits a request with no thread_id", async () => {
      const result = (await server.callTool("garp_request", {
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
    const server = createGarpServer({ repoPath: ctx.aliceRepo, userId: "alice" });

    let requestId: string;

    await when("Alice submits a basic request with no attachments", async () => {
      const result = (await server.callTool("garp_request", {
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
    const aliceServer = createGarpServer({ repoPath: ctx.aliceRepo, userId: "alice" });

    await given("Bob pushes an unrelated commit while Alice is composing", async () => {
      // Simulate: Bob makes a commit directly, Alice's local is now behind
      execSync(
        `cd "${ctx.bobRepo}" && echo "note" > notes.txt && git add notes.txt && git commit -m "unrelated" && git push`,
        { stdio: "pipe" },
      );
    });

    await when("Alice submits a request (her local is behind)", async () => {
      const result = (await aliceServer.callTool("garp_request", {
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
});
