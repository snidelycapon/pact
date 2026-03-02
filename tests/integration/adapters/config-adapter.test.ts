/**
 * Integration tests for ConfigAdapter.
 *
 * ConfigAdapter holds identity from constructor args and lazily loads
 * subscriptions from members/{user_id}.json in the repo via FilePort.
 *
 * Test Budget: 4 behaviors (return config, load from file, empty when
 * no file, update writes + commits)
 */

import { describe, it, expect } from "vitest";
import { ConfigAdapter } from "../../../src/adapters/config-adapter.ts";
import type { FilePort, GitPort } from "../../../src/ports.ts";

/** Minimal FilePort stub for testing. */
function stubFile(files: Record<string, unknown> = {}): FilePort {
  return {
    async readJSON<T>(path: string): Promise<T> {
      if (path in files) return files[path] as T;
      throw new Error(`File not found: ${path}`);
    },
    async writeJSON(path: string, data: unknown) {
      files[path] = data;
    },
    async readText() { return ""; },
    async writeText() {},
    async copyFileIn() {},
    async listDirectory() { return []; },
    async fileExists(path: string) { return path in files; },
    async moveFile() {},
  };
}

/** Minimal GitPort stub that records calls. */
function stubGit(): GitPort & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async pull() { calls.push("pull"); },
    async add(files: string[]) { calls.push(`add:${files.join(",")}`); },
    async commit(msg: string) { calls.push(`commit:${msg}`); },
    async push() { calls.push("push"); },
    async mv() { calls.push("mv"); },
    async log() { return []; },
  };
}

describe("ConfigAdapter", () => {
  it("returns identity and subscriptions loaded from member file", async () => {
    const file = stubFile({
      "members/alice.json": { subscriptions: ["backend-team"] },
    });
    const adapter = new ConfigAdapter("alice", "Alice", file, stubGit());

    const config = await adapter.readUserConfig();

    expect(config.user_id).toBe("alice");
    expect(config.display_name).toBe("Alice");
    expect(config.subscriptions).toEqual(["backend-team"]);
  });

  it("returns empty subscriptions when no member file exists", async () => {
    const adapter = new ConfigAdapter("bob", "Bob", stubFile(), stubGit());

    const config = await adapter.readUserConfig();

    expect(config.subscriptions).toEqual([]);
  });

  it("returns empty subscriptions when member file is malformed", async () => {
    const file = stubFile({
      "members/alice.json": "not-an-object",
    });
    const adapter = new ConfigAdapter("alice", "Alice", file, stubGit());

    const config = await adapter.readUserConfig();

    expect(config.subscriptions).toEqual([]);
  });

  it("updateSubscriptions writes to repo and commits", async () => {
    const files: Record<string, unknown> = {};
    const file = stubFile(files);
    const git = stubGit();
    const adapter = new ConfigAdapter("alice", "Alice", file, git);

    await adapter.updateSubscriptions(["design-team", "backend-team"]);

    expect(files["members/alice.json"]).toEqual({
      user_id: "alice",
      display_name: "Alice",
      subscriptions: ["design-team", "backend-team"],
    });
    expect(git.calls).toEqual([
      "add:members/alice.json",
      "commit:[pact] alice updated subscriptions",
      "push",
    ]);
  });
});
