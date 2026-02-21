/**
 * Integration tests for FileAdapter.
 *
 * Tests use real filesystem with temp directories. The adapter
 * performs JSON I/O and directory listing relative to a base repoPath.
 *
 * Test Budget: 1 behavior (JSON round-trip) + list + move = 3 behaviors x 2 = 6 max
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileAdapter } from "../../../src/adapters/file-adapter.ts";

describe("FileAdapter", () => {
  let repoPath: string;

  beforeEach(() => {
    repoPath = mkdtempSync(join(tmpdir(), "garp-file-"));
  });

  afterEach(() => {
    rmSync(repoPath, { recursive: true, force: true });
  });

  it("writes JSON and reads it back without loss", async () => {
    const adapter = new FileAdapter(repoPath);
    const data = {
      request_id: "req-20260221-143022-alice-a1b2",
      sender: { user_id: "alice", display_name: "Alice" },
      context_bundle: { question: "Does this look right?", nested: { deep: true } },
    };

    await adapter.writeJSON("requests/pending/test.json", data);
    const result = await adapter.readJSON("requests/pending/test.json");

    expect(result).toEqual(data);
  });

  it("creates parent directories when writing to a nested path", async () => {
    const adapter = new FileAdapter(repoPath);

    await adapter.writeJSON("deep/nested/path/file.json", { ok: true });
    const result = await adapter.readJSON("deep/nested/path/file.json");

    expect(result).toEqual({ ok: true });
  });

  it("lists directory contents excluding .gitkeep files", async () => {
    const adapter = new FileAdapter(repoPath);
    const dir = join(repoPath, "requests/pending");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, ".gitkeep"), "");
    writeFileSync(join(dir, "req-001.json"), "{}");
    writeFileSync(join(dir, "req-002.json"), "{}");

    const files = await adapter.listDirectory("requests/pending");

    expect(files).toEqual(expect.arrayContaining(["req-001.json", "req-002.json"]));
    expect(files).not.toContain(".gitkeep");
  });

  it("moves a file from one location to another", async () => {
    const adapter = new FileAdapter(repoPath);
    mkdirSync(join(repoPath, "from"), { recursive: true });
    mkdirSync(join(repoPath, "to"), { recursive: true });
    writeFileSync(join(repoPath, "from/file.json"), '{"moved":true}');

    await adapter.moveFile("from/file.json", "to/file.json");

    const result = await adapter.readJSON("to/file.json");
    expect(result).toEqual({ moved: true });
  });
});
