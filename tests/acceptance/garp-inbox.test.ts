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
 *
 * Error/edge scenarios: 4 of 9 total (44%)
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
  },
): void {
  const envelope = {
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
