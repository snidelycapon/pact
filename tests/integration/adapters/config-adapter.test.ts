/**
 * Integration tests for ConfigAdapter.
 *
 * Tests use real filesystem with temp directories containing config.json.
 * The adapter reads config.json from the repo root and parses with Zod.
 *
 * Test Budget: 2 behaviors (read team members, lookup user) x 2 = 4 max
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConfigAdapter } from "../../../src/adapters/config-adapter.ts";

describe("ConfigAdapter", () => {
  let repoPath: string;

  const validConfig = {
    team_name: "Test Team",
    version: 1,
    members: [
      { user_id: "alice", display_name: "Alice" },
      { user_id: "bob", display_name: "Bob" },
    ],
  };

  beforeEach(() => {
    repoPath = mkdtempSync(join(tmpdir(), "garp-config-"));
    writeFileSync(join(repoPath, "config.json"), JSON.stringify(validConfig, null, 2));
  });

  afterEach(() => {
    rmSync(repoPath, { recursive: true, force: true });
  });

  it("reads config.json and returns team members with user_id and display_name", async () => {
    const adapter = new ConfigAdapter(repoPath);

    const members = await adapter.readTeamMembers();

    expect(members).toHaveLength(2);
    expect(members[0]).toEqual({ user_id: "alice", display_name: "Alice" });
    expect(members[1]).toEqual({ user_id: "bob", display_name: "Bob" });
  });

  it("looks up a valid user_id and returns the matching member record", async () => {
    const adapter = new ConfigAdapter(repoPath);

    const member = await adapter.lookupUser("bob");

    expect(member).toEqual({ user_id: "bob", display_name: "Bob" });
  });

  it("returns undefined when looking up a non-existent user_id", async () => {
    const adapter = new ConfigAdapter(repoPath);

    const member = await adapter.lookupUser("charlie");

    expect(member).toBeUndefined();
  });
});
