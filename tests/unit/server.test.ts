/**
 * Unit tests for PACT server factory.
 *
 * Tests enter through createPactServer (the driving port factory).
 * Validates the returned shape has a callTool method.
 *
 * Test Budget: 1 behavior (factory returns correct shape) x 2 = 2 max
 */

import { describe, it, expect } from "vitest";
import { createPactServer } from "../../src/server.ts";

describe("createPactServer", () => {
  it("returns an object with a callTool method when given repoPath and userId", () => {
    const server = createPactServer({ repoPath: "/tmp/test-repo", userId: "alice" });
    expect(server).toBeDefined();
    expect(typeof server.callTool).toBe("function");
  });

  it("callTool is async and rejects for unimplemented tools", async () => {
    const server = createPactServer({ repoPath: "/tmp/test-repo", userId: "alice" });
    await expect(server.callTool("pact_nonexistent", {})).rejects.toThrow(
      'Tool "pact_nonexistent" is not yet implemented',
    );
  });
});
