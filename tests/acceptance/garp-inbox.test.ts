/**
 * Acceptance Tests -- garp_inbox (Check GARP Inbox)
 *
 * Traces to: US-003
 *
 * Tests exercise the garp_inbox driving port (tool handler) against
 * real local git repos. Scenarios verify:
 *   - Retrieves pending requests addressed to the current user
 *   - Filters out requests addressed to other users
 *   - Returns empty list when no pending requests exist
 *   - Returns requests ordered by creation time (oldest first)
 *   - Includes skill_path for agent auto-loading
 *   - Falls back to local state when git pull fails
 *   - Returns summary field for triage
 *   - Includes short_id derived from request_id (US-003a)
 *   - Includes thread_id when present in request envelope (US-003a)
 *   - Omits thread_id when not in request envelope (US-003a)
 *   - Includes attachment_count from request envelope (US-003a)
 *
 * Error/edge scenarios: 4 of 13 total (31%)
 */

import { describe, it, expect, afterEach } from "vitest";
import {
  createTestRepos,
  listDir,
  readRepoJSON,
  fileExists,
  gitPull,
  type TestRepoContext,
} from "./helpers/setup-test-repos";
import { given, when, thenAssert } from "./helpers/gwt";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

import { createGarpServer } from "../../src/server.ts";

/** Helper to write a fake request file directly into the repo (bypassing garp_request). */
function seedRequest(
  repoPath: string,
  opts: {
    requestId: string;
    recipient: string;
    sender: string;
    senderName: string;
    requestType?: string;
    createdAt?: string;
    question?: string;
    threadId?: string;
    attachments?: Array<{ filename: string; description: string }>;
  },
): void {
  const envelope: Record<string, unknown> = {
    request_id: opts.requestId,
    request_type: opts.requestType ?? "sanity-check",
    sender: { user_id: opts.sender, display_name: opts.senderName },
    recipient: {
      user_id: opts.recipient,
      display_name: opts.recipient.charAt(0).toUpperCase() + opts.recipient.slice(1),
    },
    status: "pending",
    created_at: opts.createdAt ?? new Date().toISOString(),
    context_bundle: {
      question: opts.question ?? "Test question",
    },
  };
  if (opts.threadId) {
    envelope.thread_id = opts.threadId;
  }
  if (opts.attachments?.length) {
    envelope.attachments = opts.attachments;
  }
  const filePath = join(repoPath, "requests", "pending", `${opts.requestId}.json`);
  writeFileSync(filePath, JSON.stringify(envelope, null, 2));
  execSync(`cd "${repoPath}" && git add -A && git commit -m "seed ${opts.requestId}" && git push`, {
    stdio: "pipe",
  });
}

describe("garp_inbox: check inbox for pending requests", () => {
  let ctx: TestRepoContext;

  afterEach(() => {
    ctx?.cleanup();
  });

  // =========================================================================
  // Happy Path
  // =========================================================================

  it("returns one pending request addressed to the current user", async () => {
    ctx = createTestRepos();

    await given("Alice has sent a sanity-check request to Bob", async () => {
      seedRequest(ctx.aliceRepo, {
        requestId: "req-20260221-140000-alice-a1b2",
        recipient: "bob",
        sender: "alice",
        senderName: "Alice",
        question: "Does this memory leak match the session service pattern?",
      });
    });

    await when("Bob checks his inbox", async () => {
      const bobServer = createGarpServer({ repoPath: ctx.bobRepo, userId: "bob" });
      const inbox = (await bobServer.callTool("garp_inbox", {})) as any;

      expect(inbox.requests).toHaveLength(1);
      expect(inbox.requests[0]).toMatchObject({
        request_id: "req-20260221-140000-alice-a1b2",
        request_type: "sanity-check",
        sender: "Alice",
      });
      expect(inbox.requests[0].created_at).toBeDefined();
    });
  });

  it("only shows requests addressed to the current user, not others", async () => {
    ctx = createTestRepos();

    await given("the repo has requests for both Bob and Alice", async () => {
      seedRequest(ctx.aliceRepo, {
        requestId: "req-20260221-140000-alice-a1b2",
        recipient: "bob",
        sender: "alice",
        senderName: "Alice",
        question: "For Bob",
      });
      seedRequest(ctx.aliceRepo, {
        requestId: "req-20260221-140100-bob-c3d4",
        recipient: "alice",
        sender: "bob",
        senderName: "Bob",
        question: "For Alice",
      });
      seedRequest(ctx.aliceRepo, {
        requestId: "req-20260221-140200-alice-e5f6",
        recipient: "bob",
        sender: "alice",
        senderName: "Alice",
        question: "Also for Bob",
      });
    });

    await when("Bob checks his inbox", async () => {
      const bobServer = createGarpServer({ repoPath: ctx.bobRepo, userId: "bob" });
      const inbox = (await bobServer.callTool("garp_inbox", {})) as any;

      // Bob should see 2 requests (both addressed to him), not the one for Alice
      expect(inbox.requests).toHaveLength(2);
      const ids = inbox.requests.map((r: any) => r.request_id);
      expect(ids).toContain("req-20260221-140000-alice-a1b2");
      expect(ids).toContain("req-20260221-140200-alice-e5f6");
      expect(ids).not.toContain("req-20260221-140100-bob-c3d4");
    });
  });

  it("returns requests ordered by creation time, oldest first", async () => {
    ctx = createTestRepos();

    await given("Bob has three pending requests created at different times", async () => {
      seedRequest(ctx.aliceRepo, {
        requestId: "req-20260221-160000-alice-0001",
        recipient: "bob",
        sender: "alice",
        senderName: "Alice",
        createdAt: "2026-02-21T16:00:00Z",
        question: "Third (newest)",
      });
      seedRequest(ctx.aliceRepo, {
        requestId: "req-20260221-140000-alice-0002",
        recipient: "bob",
        sender: "alice",
        senderName: "Alice",
        createdAt: "2026-02-21T14:00:00Z",
        question: "First (oldest)",
      });
      seedRequest(ctx.aliceRepo, {
        requestId: "req-20260221-150000-alice-0003",
        recipient: "bob",
        sender: "alice",
        senderName: "Alice",
        createdAt: "2026-02-21T15:00:00Z",
        question: "Second (middle)",
      });
    });

    await when("Bob checks his inbox", async () => {
      const bobServer = createGarpServer({ repoPath: ctx.bobRepo, userId: "bob" });
      const inbox = (await bobServer.callTool("garp_inbox", {})) as any;

      expect(inbox.requests).toHaveLength(3);
      expect(inbox.requests[0].request_id).toBe("req-20260221-140000-alice-0002"); // oldest
      expect(inbox.requests[1].request_id).toBe("req-20260221-150000-alice-0003"); // middle
      expect(inbox.requests[2].request_id).toBe("req-20260221-160000-alice-0001"); // newest
    });
  });

  it("includes skill_path so the agent can auto-load the skill file", async () => {
    ctx = createTestRepos();

    await given("a sanity-check request exists for Bob", async () => {
      seedRequest(ctx.aliceRepo, {
        requestId: "req-20260221-140000-alice-a1b2",
        recipient: "bob",
        sender: "alice",
        senderName: "Alice",
      });
    });

    await when("Bob checks his inbox", async () => {
      const bobServer = createGarpServer({ repoPath: ctx.bobRepo, userId: "bob" });
      const inbox = (await bobServer.callTool("garp_inbox", {})) as any;

      expect(inbox.requests[0].skill_path).toContain(
        "skills/sanity-check/SKILL.md",
      );
    });
  });

  it("includes a summary from the context bundle for triage", async () => {
    ctx = createTestRepos();

    await given("a request exists with a question field in the context bundle", async () => {
      seedRequest(ctx.aliceRepo, {
        requestId: "req-20260221-140000-alice-a1b2",
        recipient: "bob",
        sender: "alice",
        senderName: "Alice",
        question: "Does this memory leak match the session service pattern?",
      });
    });

    await when("Bob checks his inbox", async () => {
      const bobServer = createGarpServer({ repoPath: ctx.bobRepo, userId: "bob" });
      const inbox = (await bobServer.callTool("garp_inbox", {})) as any;

      // Summary extracted from context_bundle.question
      expect(inbox.requests[0].summary).toContain("memory leak");
    });
  });

  // =========================================================================
  // Protocol Extensions: short_id, thread_id, attachment_count (US-003a)
  // =========================================================================

  it("includes short_id derived from request_id in inbox entries", async () => {
    ctx = createTestRepos();

    await given("a request exists with ID req-20260221-140000-alice-a1b2", async () => {
      seedRequest(ctx.aliceRepo, {
        requestId: "req-20260221-140000-alice-a1b2",
        recipient: "bob",
        sender: "alice",
        senderName: "Alice",
      });
    });

    await when("Bob checks his inbox", async () => {
      const bobServer = createGarpServer({ repoPath: ctx.bobRepo, userId: "bob" });
      const inbox = (await bobServer.callTool("garp_inbox", {})) as any;

      expect(inbox.requests[0].short_id).toBe("alice-a1b2");
    });
  });

  it("includes thread_id in inbox entry when the request has one", async () => {
    ctx = createTestRepos();
    const threadId = "req-20260221-100000-alice-0001";

    await given("a threaded request exists for Bob", async () => {
      seedRequest(ctx.aliceRepo, {
        requestId: "req-20260221-140000-alice-a1b2",
        recipient: "bob",
        sender: "alice",
        senderName: "Alice",
        threadId,
      });
    });

    await when("Bob checks his inbox", async () => {
      const bobServer = createGarpServer({ repoPath: ctx.bobRepo, userId: "bob" });
      const inbox = (await bobServer.callTool("garp_inbox", {})) as any;

      expect(inbox.requests[0].thread_id).toBe(threadId);
    });
  });

  it("omits thread_id from inbox entry when the request has none", async () => {
    ctx = createTestRepos();

    await given("a request without thread_id exists for Bob", async () => {
      seedRequest(ctx.aliceRepo, {
        requestId: "req-20260221-140000-alice-a1b2",
        recipient: "bob",
        sender: "alice",
        senderName: "Alice",
        // No threadId
      });
    });

    await when("Bob checks his inbox", async () => {
      const bobServer = createGarpServer({ repoPath: ctx.bobRepo, userId: "bob" });
      const inbox = (await bobServer.callTool("garp_inbox", {})) as any;

      expect("thread_id" in inbox.requests[0]).toBe(false);
    });
  });

  it("includes attachment_count in inbox entries", async () => {
    ctx = createTestRepos();

    await given("a request with 2 attachments and one without exist for Bob", async () => {
      seedRequest(ctx.aliceRepo, {
        requestId: "req-20260221-140000-alice-a1b2",
        recipient: "bob",
        sender: "alice",
        senderName: "Alice",
        createdAt: "2026-02-21T14:00:00Z",
        attachments: [
          { filename: "crash.log", description: "Error log" },
          { filename: "config.yml", description: "Config file" },
        ],
      });
      seedRequest(ctx.aliceRepo, {
        requestId: "req-20260221-150000-alice-c3d4",
        recipient: "bob",
        sender: "alice",
        senderName: "Alice",
        createdAt: "2026-02-21T15:00:00Z",
        question: "No attachments here",
      });
    });

    await when("Bob checks his inbox", async () => {
      const bobServer = createGarpServer({ repoPath: ctx.bobRepo, userId: "bob" });
      const inbox = (await bobServer.callTool("garp_inbox", {})) as any;

      expect(inbox.requests).toHaveLength(2);
      // First entry (oldest) has 2 attachments
      expect(inbox.requests[0].attachment_count).toBe(2);
      // Second entry has no attachments
      expect(inbox.requests[1].attachment_count).toBe(0);
    });
  });

  // =========================================================================
  // Thread Grouping (US-011)
  // =========================================================================

  it("groups pending requests by thread_id when 2+ share the same thread", async () => {
    ctx = createTestRepos();
    const threadId = "req-20260222-100000-alice-0001";

    await given("Bob has 2 pending requests in the same thread and 1 standalone", async () => {
      seedRequest(ctx.aliceRepo, {
        requestId: "req-20260222-100000-alice-0001",
        recipient: "bob",
        sender: "alice",
        senderName: "Alice",
        createdAt: "2026-02-22T10:00:00Z",
        question: "Round 1: Proposing code-review skill",
        threadId,
      });
      seedRequest(ctx.aliceRepo, {
        requestId: "req-20260222-110000-alice-0002",
        recipient: "bob",
        sender: "alice",
        senderName: "Alice",
        createdAt: "2026-02-22T11:00:00Z",
        question: "Round 2: Added language field",
        threadId,
      });
      seedRequest(ctx.aliceRepo, {
        requestId: "req-20260222-120000-alice-0003",
        recipient: "bob",
        sender: "alice",
        senderName: "Alice",
        createdAt: "2026-02-22T12:00:00Z",
        question: "Standalone ask",
        threadId: "req-20260222-120000-alice-0003", // auto-assigned = unique
      });
    });

    await when("Bob checks his inbox", async () => {
      const bobServer = createGarpServer({ repoPath: ctx.bobRepo, userId: "bob" });
      const inbox = (await bobServer.callTool("garp_inbox", {})) as any;

      await thenAssert("the result contains 2 items (1 group + 1 standalone)", async () => {
        expect(inbox.requests).toHaveLength(2);
      });

      await thenAssert("the thread group has correct aggregated fields", async () => {
        const group = inbox.requests.find((r: any) => r.is_thread_group);
        expect(group).toBeDefined();
        expect(group.thread_id).toBe(threadId);
        expect(group.round_count).toBe(2);
        expect(group.latest_summary).toBe("Round 2: Added language field");
        expect(group.request_ids).toHaveLength(2);
        expect(group.request_ids).toContain("req-20260222-100000-alice-0001");
        expect(group.request_ids).toContain("req-20260222-110000-alice-0002");
      });

      await thenAssert("the standalone request has no is_thread_group flag", async () => {
        const standalone = inbox.requests.find((r: any) => !r.is_thread_group);
        expect(standalone).toBeDefined();
        expect(standalone.request_id).toBe("req-20260222-120000-alice-0003");
      });
    });
  });

  it("treats auto-assigned thread_id (thread of one) as standalone", async () => {
    ctx = createTestRepos();

    await given("Bob has 1 request with thread_id = request_id (auto-assigned)", async () => {
      seedRequest(ctx.aliceRepo, {
        requestId: "req-20260222-100000-alice-0001",
        recipient: "bob",
        sender: "alice",
        senderName: "Alice",
        threadId: "req-20260222-100000-alice-0001",
      });
    });

    await when("Bob checks his inbox", async () => {
      const bobServer = createGarpServer({ repoPath: ctx.bobRepo, userId: "bob" });
      const inbox = (await bobServer.callTool("garp_inbox", {})) as any;

      await thenAssert("the request displays as standalone (not a thread group)", async () => {
        expect(inbox.requests).toHaveLength(1);
        expect(inbox.requests[0].is_thread_group).toBeUndefined();
        expect(inbox.requests[0].request_id).toBe("req-20260222-100000-alice-0001");
      });
    });
  });

  it("handles pre-Phase-2 requests without thread_id gracefully", async () => {
    ctx = createTestRepos();

    await given("Bob has 2 requests: one with thread_id, one without (pre-Phase-2)", async () => {
      seedRequest(ctx.aliceRepo, {
        requestId: "req-old-001",
        recipient: "bob",
        sender: "alice",
        senderName: "Alice",
        createdAt: "2026-02-20T10:00:00Z",
        // No threadId -- pre-Phase-2 request
      });
      seedRequest(ctx.aliceRepo, {
        requestId: "req-20260222-100000-alice-0001",
        recipient: "bob",
        sender: "alice",
        senderName: "Alice",
        createdAt: "2026-02-22T10:00:00Z",
        threadId: "req-20260222-100000-alice-0001",
      });
    });

    await when("Bob checks his inbox", async () => {
      const bobServer = createGarpServer({ repoPath: ctx.bobRepo, userId: "bob" });
      const inbox = (await bobServer.callTool("garp_inbox", {})) as any;

      await thenAssert("both requests display as standalone items", async () => {
        expect(inbox.requests).toHaveLength(2);
        // Neither should be a thread group
        expect(inbox.requests.every((r: any) => !r.is_thread_group)).toBe(true);
      });
    });
  });

  // =========================================================================
  // Edge Cases / Error Paths
  // =========================================================================

  it("returns zero results when inbox is empty", async () => {
    ctx = createTestRepos();

    await when("Bob checks inbox with no pending requests", async () => {
      const bobServer = createGarpServer({ repoPath: ctx.bobRepo, userId: "bob" });
      const inbox = (await bobServer.callTool("garp_inbox", {})) as any;

      expect(inbox.requests).toHaveLength(0);
      // Should not throw -- empty inbox is a normal condition
    });
  });

  it("does not show requests that have been moved to completed", async () => {
    ctx = createTestRepos();

    await given("a request was created and then moved to completed", async () => {
      seedRequest(ctx.aliceRepo, {
        requestId: "req-20260221-140000-alice-a1b2",
        recipient: "bob",
        sender: "alice",
        senderName: "Alice",
      });
      // Move to completed (simulating garp_respond)
      execSync(
        `cd "${ctx.aliceRepo}" && git mv requests/pending/req-20260221-140000-alice-a1b2.json requests/completed/ && git commit -m "complete" && git push`,
        { stdio: "pipe" },
      );
    });

    await when("Bob checks his inbox", async () => {
      const bobServer = createGarpServer({ repoPath: ctx.bobRepo, userId: "bob" });
      const inbox = (await bobServer.callTool("garp_inbox", {})) as any;

      expect(inbox.requests).toHaveLength(0);
    });
  });

  it("falls back to local state with a warning when git pull fails", async () => {
    ctx = createTestRepos();

    await given("a request exists locally but the remote is unreachable", async () => {
      seedRequest(ctx.aliceRepo, {
        requestId: "req-20260221-140000-alice-a1b2",
        recipient: "bob",
        sender: "alice",
        senderName: "Alice",
      });
      gitPull(ctx.bobRepo);

      // Break the remote by renaming it
      execSync(`mv "${ctx.remotePath}" "${ctx.remotePath}.broken"`, { stdio: "pipe" });
    });

    await when("Bob checks his inbox (remote unreachable)", async () => {
      const bobServer = createGarpServer({ repoPath: ctx.bobRepo, userId: "bob" });
      const inbox = (await bobServer.callTool("garp_inbox", {})) as any;

      // Should still return locally known requests
      expect(inbox.requests).toHaveLength(1);
      expect(inbox.warning).toMatch(/stale|local/i);
    });

    // Restore remote for cleanup
    await thenAssert("(cleanup) restore remote", async () => {
      execSync(`mv "${ctx.remotePath}.broken" "${ctx.remotePath}"`, { stdio: "pipe" });
    });
  });

  it("inbox is a read-only operation -- no commits or pushes", async () => {
    ctx = createTestRepos();

    await given("a request exists for Bob", async () => {
      seedRequest(ctx.aliceRepo, {
        requestId: "req-20260221-140000-alice-a1b2",
        recipient: "bob",
        sender: "alice",
        senderName: "Alice",
      });
    });

    await when("Bob checks his inbox", async () => {
      const bobServer = createGarpServer({ repoPath: ctx.bobRepo, userId: "bob" });

      // Capture commit count before
      const commitsBefore = execSync(
        `cd "${ctx.bobRepo}" && git rev-list --count HEAD`,
        { encoding: "utf-8" },
      ).trim();

      await bobServer.callTool("garp_inbox", {});

      // Commit count should not change (only pull, no new commits)
      const commitsAfter = execSync(
        `cd "${ctx.bobRepo}" && git rev-list --count HEAD`,
        { encoding: "utf-8" },
      ).trim();

      // Commits may increase from pull, but Bob should not have authored any
      // Actually, after pull, the count could change. Better check: no commits by Bob.
      const bobCommits = execSync(
        `cd "${ctx.bobRepo}" && git log --author="Bob" --oneline | wc -l`,
        { encoding: "utf-8" },
      ).trim();
      expect(bobCommits).toBe("0");
    });
  });
});
