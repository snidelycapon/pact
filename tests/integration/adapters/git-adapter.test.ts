/**
 * Integration tests for GitAdapter.
 *
 * Tests use real local bare git repos (no network). Each test gets its own
 * temp directory topology: bare remote + alice clone + bob clone.
 *
 * Test Budget: 2 behaviors (commit+push, push-retry-on-conflict) x 2 = 4 max
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  createTestRepos,
  type TestRepoContext,
  lastCommitMessage,
} from "../../acceptance/helpers/setup-test-repos.ts";
import { GitAdapter } from "../../../src/adapters/git-adapter.ts";

describe("GitAdapter", () => {
  let ctx: TestRepoContext;

  beforeEach(() => {
    ctx = createTestRepos();
  });

  afterEach(() => {
    ctx.cleanup();
  });

  it("commits and pushes so the commit appears on the remote bare repo", async () => {
    const adapter = new GitAdapter(ctx.aliceRepo);

    // Create a file in alice's working copy
    writeFileSync(join(ctx.aliceRepo, "requests/pending/test.json"), '{"id":"1"}');

    await adapter.add(["requests/pending/test.json"]);
    await adapter.commit("[pact] Test commit");
    await adapter.push();

    // Verify the commit is visible from the remote (clone bob and check)
    execSync(`cd "${ctx.bobRepo}" && git pull --rebase`, { stdio: "pipe" });
    const msg = lastCommitMessage(ctx.bobRepo);
    expect(msg).toBe("[pact] Test commit");
  });

  it("retries push with pull-rebase when remote has diverged", async () => {
    const aliceAdapter = new GitAdapter(ctx.aliceRepo);

    // Bob commits and pushes first (creating divergence)
    writeFileSync(join(ctx.bobRepo, "requests/pending/bob-file.json"), '{"from":"bob"}');
    execSync(
      [
        `cd "${ctx.bobRepo}"`,
        `git add requests/pending/bob-file.json`,
        `git commit -m "[pact] Bob's commit"`,
        `git push`,
      ].join(" && "),
      { stdio: "pipe" },
    );

    // Alice commits locally (now behind remote)
    writeFileSync(join(ctx.aliceRepo, "requests/pending/alice-file.json"), '{"from":"alice"}');
    await aliceAdapter.add(["requests/pending/alice-file.json"]);
    await aliceAdapter.commit("[pact] Alice's commit");

    // Push should succeed via retry (pull --rebase then push)
    await aliceAdapter.push();

    // Verify both commits appear on remote
    execSync(`cd "${ctx.bobRepo}" && git pull --rebase`, { stdio: "pipe" });
    const msg = lastCommitMessage(ctx.bobRepo);
    expect(msg).toBe("[pact] Alice's commit");
  });

  it("pulls latest changes from remote", async () => {
    const aliceAdapter = new GitAdapter(ctx.aliceRepo);

    // Bob commits and pushes
    writeFileSync(join(ctx.bobRepo, "requests/pending/bob.json"), '{"from":"bob"}');
    execSync(
      [
        `cd "${ctx.bobRepo}"`,
        `git add requests/pending/bob.json`,
        `git commit -m "[pact] Bob pushed"`,
        `git push`,
      ].join(" && "),
      { stdio: "pipe" },
    );

    // Alice pulls
    await aliceAdapter.pull();

    const msg = lastCommitMessage(ctx.aliceRepo);
    expect(msg).toBe("[pact] Bob pushed");
  });

  it("moves a file with git mv", async () => {
    const adapter = new GitAdapter(ctx.aliceRepo);

    // Create and commit a file first
    writeFileSync(join(ctx.aliceRepo, "requests/pending/moveme.json"), '{"id":"move"}');
    await adapter.add(["requests/pending/moveme.json"]);
    await adapter.commit("[pact] Add file to move");

    // Move it
    await adapter.mv("requests/pending/moveme.json", "requests/completed/moveme.json");
    await adapter.commit("[pact] Move to completed");

    const msg = lastCommitMessage(ctx.aliceRepo);
    expect(msg).toBe("[pact] Move to completed");
  });
});
