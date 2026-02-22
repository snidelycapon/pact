/**
 * Unit tests for GARP Zod schemas.
 *
 * Tests enter through the schema parsing API (the driving port for validation).
 * Each test validates observable behavior: parse succeeds or fails with
 * specific error structure.
 *
 * Test Budget: 3 behaviors (valid envelope, invalid envelope, response+config) x 2 = 6 max
 * + 3 protocol extension tests (thread_id, attachments, combined)
 */

import { describe, it, expect } from "vitest";
import {
  RequestEnvelopeSchema,
  ResponseEnvelopeSchema,
  TeamConfigSchema,
} from "../../src/schemas.ts";

describe("RequestEnvelopeSchema", () => {
  const validRequest = {
    request_id: "req-20260221-143022-alice-a1b2",
    request_type: "sanity-check",
    sender: { user_id: "alice", display_name: "Alice" },
    recipient: { user_id: "bob", display_name: "Bob" },
    status: "pending",
    created_at: "2026-02-21T14:30:22Z",
    context_bundle: { question: "Does this look right?" },
  };

  it("parses a valid request envelope with all required fields", () => {
    const result = RequestEnvelopeSchema.safeParse(validRequest);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.request_id).toBe("req-20260221-143022-alice-a1b2");
      expect(result.data.sender.user_id).toBe("alice");
      expect(result.data.status).toBe("pending");
    }
  });

  it("parses a request envelope with optional fields", () => {
    const withOptional = {
      ...validRequest,
      deadline: "2026-02-22T14:30:22Z",
      expected_response: { type: "text" },
    };
    const result = RequestEnvelopeSchema.safeParse(withOptional);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.deadline).toBe("2026-02-22T14:30:22Z");
      expect(result.data.expected_response).toEqual({ type: "text" });
    }
  });

  it("rejects a request envelope missing required fields", () => {
    const missing = { request_id: "req-20260221-143022-alice-a1b2" };
    const result = RequestEnvelopeSchema.safeParse(missing);
    expect(result.success).toBe(false);
  });

  it("parses a request envelope with thread_id", () => {
    const withThread = {
      ...validRequest,
      thread_id: "req-20260221-100000-alice-0001",
    };
    const result = RequestEnvelopeSchema.safeParse(withThread);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.thread_id).toBe("req-20260221-100000-alice-0001");
    }
  });

  it("parses a request envelope with attachments array", () => {
    const withAttachments = {
      ...validRequest,
      attachments: [
        { filename: "crash.log", description: "Application error log" },
        { filename: "config.yml", description: "Deployment configuration" },
      ],
    };
    const result = RequestEnvelopeSchema.safeParse(withAttachments);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.attachments).toHaveLength(2);
      expect(result.data.attachments![0].filename).toBe("crash.log");
      expect(result.data.attachments![1].description).toBe("Deployment configuration");
    }
  });

  it("parses a request envelope with both thread_id and attachments", () => {
    const withBoth = {
      ...validRequest,
      thread_id: "req-20260221-100000-alice-0001",
      attachments: [
        { filename: "trace.log", description: "Stack trace from crash" },
      ],
    };
    const result = RequestEnvelopeSchema.safeParse(withBoth);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.thread_id).toBe("req-20260221-100000-alice-0001");
      expect(result.data.attachments).toHaveLength(1);
      expect(result.data.attachments![0].filename).toBe("trace.log");
    }
  });
});

describe("ResponseEnvelopeSchema", () => {
  it("parses a valid response envelope", () => {
    const valid = {
      request_id: "req-20260221-143022-alice-a1b2",
      responder: { user_id: "bob", display_name: "Bob" },
      responded_at: "2026-02-21T15:45:00Z",
      response_bundle: { answer: "Confirmed" },
    };
    const result = ResponseEnvelopeSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.responder.user_id).toBe("bob");
      expect(result.data.response_bundle).toEqual({ answer: "Confirmed" });
    }
  });
});

describe("TeamConfigSchema", () => {
  it("parses a valid team config", () => {
    const valid = {
      team_name: "Test Team",
      version: 1,
      members: [
        { user_id: "alice", display_name: "Alice" },
        { user_id: "bob", display_name: "Bob" },
      ],
    };
    const result = TeamConfigSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.members).toHaveLength(2);
      expect(result.data.team_name).toBe("Test Team");
    }
  });
});
