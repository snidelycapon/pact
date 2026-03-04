/**
 * Unit tests for PactPoller.
 *
 * Mocks handlePactInbox to test the poller's change detection logic
 * without hitting the filesystem or git.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/tools/pact-inbox.ts", () => ({
  handlePactInbox: vi.fn(),
}));

import { PactPoller } from "../../src/poller.ts";
import type { PollerConfig } from "../../src/poller.ts";
import { handlePactInbox } from "../../src/tools/pact-inbox.ts";
import type { InboxEntry, InboxResult } from "../../src/tools/pact-inbox.ts";

function makeConfig(): PollerConfig {
  return {
    userId: "alice",
    repoPath: "/tmp/fake-repo",
    git: {
      pull: vi.fn(),
      add: vi.fn(),
      commit: vi.fn(),
      push: vi.fn(),
      mv: vi.fn(),
      log: vi.fn(),
    },
    config: {
      readUserConfig: vi.fn().mockResolvedValue({
        user_id: "alice",
        display_name: "Alice",
        subscriptions: [],
      }),
      updateSubscriptions: vi.fn(),
    },
    file: {
      readJSON: vi.fn(),
      writeJSON: vi.fn(),
      readText: vi.fn(),
      writeText: vi.fn(),
      copyFileIn: vi.fn(),
      listDirectory: vi.fn(),
      fileExists: vi.fn(),
      moveFile: vi.fn(),
    },
  };
}

function makeEntry(id: string, type = "sanity-check", sender = "bob"): InboxEntry {
  return {
    request_id: id,
    short_id: id.slice(-9),
    request_type: type,
    sender,
    created_at: new Date().toISOString(),
    summary: `Test request ${id}`,
    pact_path: `/tmp/pact-store/${type}.md`,
    attachment_count: 0,
    amendment_count: 0,
  };
}

function mockInbox(entries: InboxEntry[], warning?: string): void {
  const result: InboxResult = { requests: entries, ...(warning ? { warning } : {}) };
  vi.mocked(handlePactInbox).mockResolvedValue(result);
}

describe("PactPoller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("first poll returns all entries as new", async () => {
    const config = makeConfig();
    const poller = new PactPoller(config);

    const entries = [makeEntry("req-001"), makeEntry("req-002")];
    mockInbox(entries);

    const diff = await poller.poll();

    expect(diff.isFirstPoll).toBe(true);
    expect(diff.current.requests).toHaveLength(2);
    expect(diff.newEntries).toHaveLength(2);
    expect(diff.removedIds).toHaveLength(0);
  });

  it("second poll with same entries shows no changes", async () => {
    const config = makeConfig();
    const poller = new PactPoller(config);

    const entries = [makeEntry("req-001")];
    mockInbox(entries);

    await poller.poll(); // first
    const diff = await poller.poll(); // second

    expect(diff.isFirstPoll).toBe(false);
    expect(diff.newEntries).toHaveLength(0);
    expect(diff.removedIds).toHaveLength(0);
  });

  it("detects new entries on second poll", async () => {
    const config = makeConfig();
    const poller = new PactPoller(config);

    mockInbox([makeEntry("req-001")]);
    await poller.poll();

    mockInbox([makeEntry("req-001"), makeEntry("req-002")]);
    const diff = await poller.poll();

    expect(diff.newEntries).toHaveLength(1);
    expect(diff.newEntries[0]).toMatchObject({ request_id: "req-002" });
    expect(diff.removedIds).toHaveLength(0);
  });

  it("detects removed entries on second poll", async () => {
    const config = makeConfig();
    const poller = new PactPoller(config);

    mockInbox([makeEntry("req-001"), makeEntry("req-002")]);
    await poller.poll();

    mockInbox([makeEntry("req-002")]);
    const diff = await poller.poll();

    expect(diff.newEntries).toHaveLength(0);
    expect(diff.removedIds).toEqual(["req-001"]);
  });

  it("detects simultaneous additions and removals", async () => {
    const config = makeConfig();
    const poller = new PactPoller(config);

    mockInbox([makeEntry("req-001"), makeEntry("req-002")]);
    await poller.poll();

    mockInbox([makeEntry("req-002"), makeEntry("req-003")]);
    const diff = await poller.poll();

    expect(diff.newEntries).toHaveLength(1);
    expect(diff.newEntries[0]).toMatchObject({ request_id: "req-003" });
    expect(diff.removedIds).toEqual(["req-001"]);
  });

  it("handles empty inbox", async () => {
    const config = makeConfig();
    const poller = new PactPoller(config);

    mockInbox([]);
    const diff = await poller.poll();

    expect(diff.isFirstPoll).toBe(true);
    expect(diff.current.requests).toHaveLength(0);
    expect(diff.newEntries).toHaveLength(0);
    expect(diff.removedIds).toHaveLength(0);
  });

  it("passes through inbox warnings", async () => {
    const config = makeConfig();
    const poller = new PactPoller(config);

    mockInbox([], "Using local data (remote unreachable). Results may be stale.");
    const diff = await poller.poll();

    expect(diff.current.warning).toBe(
      "Using local data (remote unreachable). Results may be stale.",
    );
  });

  it("handles thread groups using latest_request_id for tracking", async () => {
    const config = makeConfig();
    const poller = new PactPoller(config);

    const threadGroup = {
      is_thread_group: true as const,
      thread_id: "thread-001",
      request_type: "sanity-check",
      sender: "bob",
      round_count: 2,
      latest_request_id: "req-002",
      latest_short_id: "req-002".slice(-9),
      latest_summary: "Round 2",
      created_at: new Date().toISOString(),
      request_ids: ["req-001", "req-002"],
      pact_path: "/tmp/pact-store/sanity-check.md",
      attachment_count: 0,
      amendment_count: 0,
    };

    vi.mocked(handlePactInbox).mockResolvedValue({ requests: [threadGroup] });
    await poller.poll();

    // Update the thread group with a new round
    const updatedGroup = {
      ...threadGroup,
      latest_request_id: "req-003",
      latest_short_id: "req-003".slice(-9),
      round_count: 3,
      request_ids: ["req-001", "req-002", "req-003"],
    };
    vi.mocked(handlePactInbox).mockResolvedValue({ requests: [updatedGroup] });
    const diff = await poller.poll();

    expect(diff.newEntries).toHaveLength(1);
    expect(diff.removedIds).toEqual(["req-002"]);
  });

  it("start() calls poll on interval and stop() clears it", async () => {
    vi.useFakeTimers();
    const config = makeConfig();
    const poller = new PactPoller(config);

    mockInbox([makeEntry("req-001")]);

    const onPoll = vi.fn();
    const onError = vi.fn();

    poller.start(1000, onPoll, onError);

    // Initial poll fires immediately
    await vi.advanceTimersByTimeAsync(0);
    expect(onPoll).toHaveBeenCalledTimes(1);

    // Second poll after interval
    await vi.advanceTimersByTimeAsync(1000);
    expect(onPoll).toHaveBeenCalledTimes(2);

    poller.stop();

    // No more polls after stop
    await vi.advanceTimersByTimeAsync(1000);
    expect(onPoll).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it("start() calls onError when poll throws", async () => {
    vi.useFakeTimers();
    const config = makeConfig();
    const poller = new PactPoller(config);

    vi.mocked(handlePactInbox).mockRejectedValue(new Error("git pull failed"));

    const onPoll = vi.fn();
    const onError = vi.fn();

    poller.start(1000, onPoll, onError);

    await vi.advanceTimersByTimeAsync(0);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "git pull failed" }));
    expect(onPoll).not.toHaveBeenCalled();

    poller.stop();
    vi.useRealTimers();
  });

  it("passes config through to handlePactInbox", async () => {
    const config = makeConfig();
    const poller = new PactPoller(config);

    mockInbox([]);
    await poller.poll();

    expect(handlePactInbox).toHaveBeenCalledWith({}, config);
  });
});
