/**
 * Unit tests for git-ref resolver utilities.
 *
 * Tests the URL parsing and ref formatting logic.
 * Integration tests (actual git repos) are in acceptance/.
 */

import { describe, it, expect } from "vitest";
import { formatGitRef, type GitRef } from "../../src/git-ref.ts";

describe("formatGitRef", () => {
  it("formats a basic ref without lines", () => {
    const ref: GitRef = {
      org: "acme-corp",
      repo: "backend",
      branch: "main",
      path: "src/auth.ts",
    };
    expect(formatGitRef(ref)).toBe("acme-corp/backend@main:src/auth.ts");
  });

  it("formats a ref with line range", () => {
    const ref: GitRef = {
      org: "acme-corp",
      repo: "backend",
      branch: "main",
      path: "src/middleware/auth.ts",
      lines: [42, 78],
    };
    expect(formatGitRef(ref)).toBe("acme-corp/backend@main:src/middleware/auth.ts#L42-L78");
  });

  it("formats a ref on a feature branch", () => {
    const ref: GitRef = {
      org: "snidelycapon",
      repo: "capon-pact",
      branch: "feature/attachments",
      path: "requests/pending/req-001.json",
      commit: "abc1234",
    };
    expect(formatGitRef(ref)).toBe("snidelycapon/capon-pact@feature/attachments:requests/pending/req-001.json");
  });
});
