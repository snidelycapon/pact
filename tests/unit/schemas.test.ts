/**
 * Unit tests for PACT Zod schemas.
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
  UserConfigSchema,
  AmendmentEntrySchema,
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

describe("UserConfigSchema", () => {
  it("parses a valid user config with subscriptions", () => {
    const valid = {
      user_id: "alice",
      display_name: "Alice",
      subscriptions: ["backend-team", "leads"],
    };
    const result = UserConfigSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.user_id).toBe("alice");
      expect(result.data.display_name).toBe("Alice");
      expect(result.data.subscriptions).toEqual(["backend-team", "leads"]);
    }
  });

  it("defaults subscriptions to empty array when omitted", () => {
    const minimal = {
      user_id: "bob",
      display_name: "Bob",
    };
    const result = UserConfigSchema.safeParse(minimal);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.subscriptions).toEqual([]);
    }
  });
});

describe("AmendmentEntrySchema", () => {
  const validAmendment = {
    amended_at: "2026-02-21T16:00:00Z",
    amended_by: "alice",
    fields: { status: "urgent", priority: "high" },
    note: "Escalated after customer call",
  };

  it("parses a valid amendment entry with all fields including optional note", () => {
    const result = AmendmentEntrySchema.safeParse(validAmendment);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.amended_at).toBe("2026-02-21T16:00:00Z");
      expect(result.data.amended_by).toBe("alice");
      expect(result.data.fields).toEqual({ status: "urgent", priority: "high" });
      expect(result.data.note).toBe("Escalated after customer call");
    }
  });

  it("parses a valid amendment entry without optional note", () => {
    const { note, ...withoutNote } = validAmendment;
    const result = AmendmentEntrySchema.safeParse(withoutNote);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.note).toBeUndefined();
    }
  });

  it("rejects amendment entry missing amended_at", () => {
    const { amended_at, ...missing } = validAmendment;
    const result = AmendmentEntrySchema.safeParse(missing);
    expect(result.success).toBe(false);
  });

  it("rejects amendment entry missing amended_by", () => {
    const { amended_by, ...missing } = validAmendment;
    const result = AmendmentEntrySchema.safeParse(missing);
    expect(result.success).toBe(false);
  });
});

describe("RequestEnvelopeSchema amendments and cancel_reason", () => {
  const validRequest = {
    request_id: "req-20260221-143022-alice-a1b2",
    request_type: "sanity-check",
    sender: { user_id: "alice", display_name: "Alice" },
    recipient: { user_id: "bob", display_name: "Bob" },
    status: "pending",
    created_at: "2026-02-21T14:30:22Z",
    context_bundle: { question: "Does this look right?" },
  };

  it("parses an envelope with amendments array preserved", () => {
    const withAmendments = {
      ...validRequest,
      amendments: [
        {
          amended_at: "2026-02-21T16:00:00Z",
          amended_by: "alice",
          fields: { status: "urgent" },
          note: "Escalated",
        },
      ],
    };
    const result = RequestEnvelopeSchema.safeParse(withAmendments);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.amendments).toHaveLength(1);
      expect(result.data.amendments![0].amended_by).toBe("alice");
      expect(result.data.amendments![0].fields).toEqual({ status: "urgent" });
    }
  });

  it("parses an envelope with cancel_reason", () => {
    const withCancel = {
      ...validRequest,
      cancel_reason: "Duplicate of another request",
    };
    const result = RequestEnvelopeSchema.safeParse(withCancel);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.cancel_reason).toBe("Duplicate of another request");
    }
  });

  it("parses an envelope without amendments or cancel_reason (backward compatible)", () => {
    const result = RequestEnvelopeSchema.safeParse(validRequest);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.amendments).toBeUndefined();
      expect(result.data.cancel_reason).toBeUndefined();
    }
  });
});
