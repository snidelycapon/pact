/**
 * Handler for the pact_cancel tool.
 *
 * Validates the request exists and the current user is the sender,
 * updates the status to "cancelled", optionally sets cancel_reason,
 * moves the request from pending/ to cancelled/ via git mv, and
 * commits atomically.
 */

import type { GitPort, FilePort } from "../ports.ts";
import { findPendingRequest } from "./find-pending-request.ts";

export interface PactCancelParams {
  request_id: string;
  reason?: string;
}

export interface PactCancelContext {
  userId: string;
  repoPath: string;
  git: GitPort;
  file: FilePort;
}

export async function handlePactCancel(
  params: PactCancelParams,
  ctx: PactCancelContext,
): Promise<{ status: string; request_id: string; message: string }> {
  // 1. Validate required fields
  if (!params.request_id) throw new Error("Missing required field: request_id");

  // 2. Pull latest
  await ctx.git.pull();

  // 3. Find and validate the pending request
  const { envelope, pendingPath } = await findPendingRequest(
    params.request_id, ctx.file, "cancelled",
  );

  // 4. Verify sender: only the original sender can cancel
  if (envelope.sender.user_id !== ctx.userId) {
    throw new Error("Only the sender can cancel a request");
  }

  // 5. Update envelope: set status and optional cancel_reason
  const updated = { ...envelope, status: "cancelled" as const, ...(params.reason ? { cancel_reason: params.reason } : {}) };

  // 6. Write updated envelope, git mv to cancelled/, commit, push
  const filename = `${params.request_id}.json`;
  const cancelledPath = `requests/cancelled/${filename}`;
  await ctx.file.writeJSON(pendingPath, updated);
  await ctx.git.mv(pendingPath, cancelledPath);
  await ctx.git.add([cancelledPath]);
  await ctx.git.commit(`[pact] cancelled: ${params.request_id}`);
  await ctx.git.push();

  return { status: "cancelled", request_id: params.request_id, message: "Request cancelled" };
}
