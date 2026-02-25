/**
 * Unit tests for action-dispatcher.
 *
 * Validates that dispatchAction correctly routes each of the 7 valid
 * actions to its handler, and throws descriptive errors for unknown,
 * missing, or empty action strings.
 *
 * All handler functions are mocked to isolate dispatch routing logic.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// We mock all 7 handler modules so dispatchAction calls our stubs
vi.mock("../../src/tools/pact-request.ts", () => ({
  handlePactRequest: vi.fn().mockResolvedValue({ mocked: "request" }),
}));
vi.mock("../../src/tools/pact-respond.ts", () => ({
  handlePactRespond: vi.fn().mockResolvedValue({ mocked: "respond" }),
}));
vi.mock("../../src/tools/pact-cancel.ts", () => ({
  handlePactCancel: vi.fn().mockResolvedValue({ mocked: "cancel" }),
}));
vi.mock("../../src/tools/pact-amend.ts", () => ({
  handlePactAmend: vi.fn().mockResolvedValue({ mocked: "amend" }),
}));
vi.mock("../../src/tools/pact-status.ts", () => ({
  handlePactStatus: vi.fn().mockResolvedValue({ mocked: "status" }),
}));
vi.mock("../../src/tools/pact-inbox.ts", () => ({
  handlePactInbox: vi.fn().mockResolvedValue({ mocked: "inbox" }),
}));
vi.mock("../../src/tools/pact-thread.ts", () => ({
  handlePactThread: vi.fn().mockResolvedValue({ mocked: "thread" }),
}));
vi.mock("../../src/tools/pact-subscribe.ts", () => ({
  handlePactSubscribe: vi.fn().mockResolvedValue({ mocked: "subscribe" }),
}));
vi.mock("../../src/tools/pact-unsubscribe.ts", () => ({
  handlePactUnsubscribe: vi.fn().mockResolvedValue({ mocked: "unsubscribe" }),
}));

import { dispatchAction } from "../../src/action-dispatcher.ts";
import type { DispatchContext } from "../../src/action-dispatcher.ts";
import { handlePactRequest } from "../../src/tools/pact-request.ts";
import { handlePactRespond } from "../../src/tools/pact-respond.ts";
import { handlePactCancel } from "../../src/tools/pact-cancel.ts";
import { handlePactAmend } from "../../src/tools/pact-amend.ts";
import { handlePactStatus } from "../../src/tools/pact-status.ts";
import { handlePactInbox } from "../../src/tools/pact-inbox.ts";
import { handlePactThread } from "../../src/tools/pact-thread.ts";
import { handlePactSubscribe } from "../../src/tools/pact-subscribe.ts";
import { handlePactUnsubscribe } from "../../src/tools/pact-unsubscribe.ts";

function makeCtx(): DispatchContext {
  return {
    userId: "alice",
    repoPath: "/tmp/fake-repo",
    git: {
      pull: vi.fn(),
      add: vi.fn(),
      commit: vi.fn(),
      push: vi.fn(),
      mv: vi.fn(),
      log: vi.fn(),
    },
    config: {
      readUserConfig: vi.fn().mockResolvedValue({
        user_id: "alice",
        display_name: "Alice",
        subscriptions: [],
      }),
      updateSubscriptions: vi.fn().mockResolvedValue(undefined),
    },
    file: {
      readJSON: vi.fn(),
      writeJSON: vi.fn(),
      readText: vi.fn(),
      writeText: vi.fn(),
      listDirectory: vi.fn(),
      fileExists: vi.fn(),
      moveFile: vi.fn(),
    },
  };
}

describe("dispatchAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- Error cases ---

  it("throws for unknown action 'deploy' listing valid actions", async () => {
    const ctx = makeCtx();
    await expect(
      dispatchAction({ action: "deploy" }, ctx),
    ).rejects.toThrow(/unknown action.*deploy/i);

    // Also verify it lists valid actions in the message
    await expect(
      dispatchAction({ action: "deploy" }, ctx),
    ).rejects.toThrow(/send/);
    await expect(
      dispatchAction({ action: "deploy" }, ctx),
    ).rejects.toThrow(/respond/);
    await expect(
      dispatchAction({ action: "deploy" }, ctx),
    ).rejects.toThrow(/cancel/);
    await expect(
      dispatchAction({ action: "deploy" }, ctx),
    ).rejects.toThrow(/inbox/);
  });

  it("throws for missing action (undefined)", async () => {
    const ctx = makeCtx();
    await expect(dispatchAction({}, ctx)).rejects.toThrow(/action/i);
  });

  it("throws for missing action (null)", async () => {
    const ctx = makeCtx();
    await expect(
      dispatchAction({ action: null }, ctx),
    ).rejects.toThrow(/action/i);
  });

  it("throws for empty action string", async () => {
    const ctx = makeCtx();
    await expect(
      dispatchAction({ action: "" }, ctx),
    ).rejects.toThrow(/action/i);
  });

  // --- Routing: each valid action calls the correct handler ---

  it("routes 'send' to handlePactRequest", async () => {
    const ctx = makeCtx();
    const params = { action: "send", request_type: "sanity-check", recipient: "bob", context_bundle: {} };
    const result = await dispatchAction(params, ctx);

    expect(handlePactRequest).toHaveBeenCalledOnce();
    expect(result).toEqual({ mocked: "request" });
  });

  it("routes 'respond' to handlePactRespond", async () => {
    const ctx = makeCtx();
    const params = { action: "respond", request_id: "req-123" };
    const result = await dispatchAction(params, ctx);

    expect(handlePactRespond).toHaveBeenCalledOnce();
    expect(result).toEqual({ mocked: "respond" });
  });

  it("routes 'cancel' to handlePactCancel", async () => {
    const ctx = makeCtx();
    const params = { action: "cancel", request_id: "req-123" };
    const result = await dispatchAction(params, ctx);

    expect(handlePactCancel).toHaveBeenCalledOnce();
    expect(result).toEqual({ mocked: "cancel" });
  });

  it("routes 'amend' to handlePactAmend", async () => {
    const ctx = makeCtx();
    const params = { action: "amend", request_id: "req-123", fields: {} };
    const result = await dispatchAction(params, ctx);

    expect(handlePactAmend).toHaveBeenCalledOnce();
    expect(result).toEqual({ mocked: "amend" });
  });

  it("routes 'check_status' to handlePactStatus", async () => {
    const ctx = makeCtx();
    const params = { action: "check_status", request_id: "req-123" };
    const result = await dispatchAction(params, ctx);

    expect(handlePactStatus).toHaveBeenCalledOnce();
    expect(result).toEqual({ mocked: "status" });
  });

  it("routes 'inbox' to handlePactInbox", async () => {
    const ctx = makeCtx();
    const params = { action: "inbox" };
    const result = await dispatchAction(params, ctx);

    expect(handlePactInbox).toHaveBeenCalledOnce();
    expect(result).toEqual({ mocked: "inbox" });
  });

  it("routes 'view_thread' to handlePactThread", async () => {
    const ctx = makeCtx();
    const params = { action: "view_thread", thread_id: "req-123" };
    const result = await dispatchAction(params, ctx);

    expect(handlePactThread).toHaveBeenCalledOnce();
    expect(result).toEqual({ mocked: "thread" });
  });

  it("routes 'subscribe' to handlePactSubscribe", async () => {
    const ctx = makeCtx();
    const params = { action: "subscribe", recipient: "backend-team" };
    const result = await dispatchAction(params, ctx);

    expect(handlePactSubscribe).toHaveBeenCalledOnce();
    expect(result).toEqual({ mocked: "subscribe" });
  });

  it("routes 'unsubscribe' to handlePactUnsubscribe", async () => {
    const ctx = makeCtx();
    const params = { action: "unsubscribe", recipient: "backend-team" };
    const result = await dispatchAction(params, ctx);

    expect(handlePactUnsubscribe).toHaveBeenCalledOnce();
    expect(result).toEqual({ mocked: "unsubscribe" });
  });

  // --- Context passing ---

  it("passes params and context to the handler", async () => {
    const ctx = makeCtx();
    const params = { action: "send", request_type: "sanity-check", recipient: "bob", context_bundle: { q: "test" } };
    await dispatchAction(params, ctx);

    const call = vi.mocked(handlePactRequest).mock.calls[0];
    // First arg is params (without action), second is context
    expect(call[1]).toMatchObject({
      userId: "alice",
      repoPath: "/tmp/fake-repo",
    });
  });

  // --- Mutant-killing: exact error message assertions ---

  it("throws exact 'Missing required field: action' message for undefined action", async () => {
    const ctx = makeCtx();
    await expect(dispatchAction({}, ctx)).rejects.toThrow(
      "Missing required field: action. Valid actions: send, respond, cancel, amend, check_status, inbox, view_thread, subscribe, unsubscribe",
    );
  });

  it("throws exact 'Missing required field: action' message for null action", async () => {
    const ctx = makeCtx();
    await expect(dispatchAction({ action: null }, ctx)).rejects.toThrow(
      "Missing required field: action. Valid actions: send, respond, cancel, amend, check_status, inbox, view_thread, subscribe, unsubscribe",
    );
  });

  it("throws exact 'Invalid action' message for empty string action", async () => {
    const ctx = makeCtx();
    await expect(dispatchAction({ action: "" }, ctx)).rejects.toThrow(
      "Invalid action: must be a non-empty string. Valid actions: send, respond, cancel, amend, check_status, inbox, view_thread, subscribe, unsubscribe",
    );
  });

  it("throws exact 'Invalid action' message for numeric action", async () => {
    const ctx = makeCtx();
    await expect(dispatchAction({ action: 123 }, ctx)).rejects.toThrow(
      "Invalid action: must be a non-empty string. Valid actions: send, respond, cancel, amend, check_status, inbox, view_thread, subscribe, unsubscribe",
    );
  });

  it("throws exact 'Unknown action' message for unknown action", async () => {
    const ctx = makeCtx();
    await expect(dispatchAction({ action: "deploy" }, ctx)).rejects.toThrow(
      "Unknown action 'deploy'. Valid actions: send, respond, cancel, amend, check_status, inbox, view_thread, subscribe, unsubscribe",
    );
  });

  it("includes all 9 valid actions in error message for unknown action", async () => {
    const ctx = makeCtx();
    try {
      await dispatchAction({ action: "nope" }, ctx);
      expect.fail("should have thrown");
    } catch (e: unknown) {
      const msg = (e as Error).message;
      expect(msg).toContain("send");
      expect(msg).toContain("respond");
      expect(msg).toContain("cancel");
      expect(msg).toContain("amend");
      expect(msg).toContain("check_status");
      expect(msg).toContain("inbox");
      expect(msg).toContain("view_thread");
      expect(msg).toContain("subscribe");
      expect(msg).toContain("unsubscribe");
    }
  });

  it("throws 'Invalid action' (not 'Missing') for boolean action", async () => {
    const ctx = makeCtx();
    await expect(dispatchAction({ action: true }, ctx)).rejects.toThrow(
      "Invalid action: must be a non-empty string.",
    );
  });
});
