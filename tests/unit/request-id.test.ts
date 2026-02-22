/**
 * Unit tests for PACT request ID generator.
 *
 * Tests enter through generateRequestId (the public API).
 * Validates the format matches req-YYYYMMDD-HHmmss-{userId}-{4hex}.
 *
 * Test Budget: 1 behavior (ID format) x 2 = 2 max
 */

import { describe, it, expect } from "vitest";
import { generateRequestId } from "../../src/request-id.ts";

describe("generateRequestId", () => {
  it("produces an ID matching req-YYYYMMDD-HHmmss-{userId}-{4hex} format", () => {
    const id = generateRequestId("alice");
    expect(id).toMatch(/^req-\d{8}-\d{6}-alice-[0-9a-f]{4}$/);
  });

  it("generates unique IDs on consecutive calls", () => {
    const id1 = generateRequestId("alice");
    const id2 = generateRequestId("alice");
    expect(id1).not.toBe(id2);
  });
});
