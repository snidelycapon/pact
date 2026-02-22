/**
 * Unit tests for PACT structured logger.
 *
 * Test Budget: 4 behaviors (JSON to stderr, level filtering, timestamps, extra fields)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { log } from "../../src/logger.ts";

describe("logger", () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  const originalEnv = process.env.PACT_LOG_LEVEL;

  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    delete process.env.PACT_LOG_LEVEL;
  });

  afterEach(() => {
    stderrSpy.mockRestore();
    if (originalEnv !== undefined) {
      process.env.PACT_LOG_LEVEL = originalEnv;
    } else {
      delete process.env.PACT_LOG_LEVEL;
    }
  });

  it("writes JSON to stderr with ts and level fields", () => {
    log("info", "test message");

    expect(stderrSpy).toHaveBeenCalledOnce();
    const output = stderrSpy.mock.calls[0][0] as string;
    const entry = JSON.parse(output.trim());
    expect(entry.level).toBe("info");
    expect(entry.msg).toBe("test message");
    expect(entry.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("respects log level filtering (suppresses lower levels)", () => {
    process.env.PACT_LOG_LEVEL = "warn";

    log("debug", "should be suppressed");
    log("info", "should be suppressed");
    log("warn", "should appear");
    log("error", "should appear");

    expect(stderrSpy).toHaveBeenCalledTimes(2);
  });

  it("includes extra fields in the log entry", () => {
    log("info", "tool done", { tool: "pact_request", request_id: "req-123", duration_ms: 42 });

    const entry = JSON.parse((stderrSpy.mock.calls[0][0] as string).trim());
    expect(entry.tool).toBe("pact_request");
    expect(entry.request_id).toBe("req-123");
    expect(entry.duration_ms).toBe(42);
  });

  it("defaults to info level when PACT_LOG_LEVEL is unset", () => {
    log("debug", "should be suppressed");
    log("info", "should appear");

    expect(stderrSpy).toHaveBeenCalledOnce();
  });
});
