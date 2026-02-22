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
vi.mock("../../src/tools/garp-request.ts", () => ({
  handleGarpRequest: vi.fn().mockResolvedValue({ mocked: "request" }),
}));
vi.mock("../../src/tools/garp-respond.ts", () => ({
  handleGarpRespond: vi.fn().mockResolvedValue({ mocked: "respond" }),
}));
vi.mock("../../src/tools/garp-cancel.ts", () => ({
  handleGarpCancel: vi.fn().mockResolvedValue({ mocked: "cancel" }),
}));
vi.mock("../../src/tools/garp-amend.ts", () => ({
  handleGarpAmend: vi.fn().mockResolvedValue({ mocked: "amend" }),
}));
vi.mock("../../src/tools/garp-status.ts", () => ({
  handleGarpStatus: vi.fn().mockResolvedValue({ mocked: "status" }),
}));
vi.mock("../../src/tools/garp-inbox.ts", () => ({
  handleGarpInbox: vi.fn().mockResolvedValue({ mocked: "inbox" }),
}));
vi.mock("../../src/tools/garp-thread.ts", () => ({
  handleGarpThread: vi.fn().mockResolvedValue({ mocked: "thread" }),
}));

import { dispatchAction } from "../../src/action-dispatcher.ts";
import type { DispatchContext } from "../../src/action-dispatcher.ts";
import { handleGarpRequest } from "../../src/tools/garp-request.ts";
import { handleGarpRespond } from "../../src/tools/garp-respond.ts";
import { handleGarpCancel } from "../../src/tools/garp-cancel.ts";
import { handleGarpAmend } from "../../src/tools/garp-amend.ts";
import { handleGarpStatus } from "../../src/tools/garp-status.ts";
import { handleGarpInbox } from "../../src/tools/garp-inbox.ts";
import { handleGarpThread } from "../../src/tools/garp-thread.ts";

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
      readTeamMembers: vi.fn(),
      lookupUser: vi.fn(),
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

  it("routes 'send' to handleGarpRequest", async () => {
    const ctx = makeCtx();
    const params = { action: "send", request_type: "sanity-check", recipient: "bob", context_bundle: {} };
    const result = await dispatchAction(params, ctx);

    expect(handleGarpRequest).toHaveBeenCalledOnce();
    expect(result).toEqual({ mocked: "request" });
  });

  it("routes 'respond' to handleGarpRespond", async () => {
    const ctx = makeCtx();
    const params = { action: "respond", request_id: "req-123" };
    const result = await dispatchAction(params, ctx);

    expect(handleGarpRespond).toHaveBeenCalledOnce();
    expect(result).toEqual({ mocked: "respond" });
  });

  it("routes 'cancel' to handleGarpCancel", async () => {
    const ctx = makeCtx();
    const params = { action: "cancel", request_id: "req-123" };
    const result = await dispatchAction(params, ctx);

    expect(handleGarpCancel).toHaveBeenCalledOnce();
    expect(result).toEqual({ mocked: "cancel" });
  });

  it("routes 'amend' to handleGarpAmend", async () => {
    const ctx = makeCtx();
    const params = { action: "amend", request_id: "req-123", fields: {} };
    const result = await dispatchAction(params, ctx);

    expect(handleGarpAmend).toHaveBeenCalledOnce();
    expect(result).toEqual({ mocked: "amend" });
  });

  it("routes 'check_status' to handleGarpStatus", async () => {
    const ctx = makeCtx();
    const params = { action: "check_status", request_id: "req-123" };
    const result = await dispatchAction(params, ctx);

    expect(handleGarpStatus).toHaveBeenCalledOnce();
    expect(result).toEqual({ mocked: "status" });
  });

  it("routes 'inbox' to handleGarpInbox", async () => {
    const ctx = makeCtx();
    const params = { action: "inbox" };
    const result = await dispatchAction(params, ctx);

    expect(handleGarpInbox).toHaveBeenCalledOnce();
    expect(result).toEqual({ mocked: "inbox" });
  });

  it("routes 'view_thread' to handleGarpThread", async () => {
    const ctx = makeCtx();
    const params = { action: "view_thread", thread_id: "req-123" };
    const result = await dispatchAction(params, ctx);

    expect(handleGarpThread).toHaveBeenCalledOnce();
    expect(result).toEqual({ mocked: "thread" });
  });

  // --- Context passing ---

  it("passes params and context to the handler", async () => {
    const ctx = makeCtx();
    const params = { action: "send", request_type: "sanity-check", recipient: "bob", context_bundle: { q: "test" } };
    await dispatchAction(params, ctx);

    const call = vi.mocked(handleGarpRequest).mock.calls[0];
    // First arg is params (without action), second is context
    expect(call[1]).toMatchObject({
      userId: "alice",
      repoPath: "/tmp/fake-repo",
    });
  });
});
