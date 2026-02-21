/**
 * Unit tests for GARP server factory.
 *
 * Tests enter through createGarpServer (the driving port factory).
 * Validates the returned shape has a callTool method.
 *
 * Test Budget: 1 behavior (factory returns correct shape) x 2 = 2 max
 */

import { describe, it, expect } from "vitest";
import { createGarpServer } from "../../src/server.ts";

describe("createGarpServer", () => {
  it("returns an object with a callTool method when given repoPath and userId", () => {
    const server = createGarpServer({ repoPath: "/tmp/test-repo", userId: "alice" });
    expect(server).toBeDefined();
    expect(typeof server.callTool).toBe("function");
  });

  it("callTool is async and rejects for unimplemented tools", async () => {
    const server = createGarpServer({ repoPath: "/tmp/test-repo", userId: "alice" });
    await expect(server.callTool("garp_nonexistent", {})).rejects.toThrow(
      'Tool "garp_nonexistent" is not yet implemented',
    );
  });
});
