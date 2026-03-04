/**
 * Handler for the pact cancel action.
 *
 * Finds the request in any directory, sets status to "cancelled",
 * moves to cancelled/, and commits. No sender authorization —
 * anyone with repo access can cancel. The agent decides if it's appropriate.
 */

import type { GitPort, FilePort } from "../ports.ts";
import { findRequest } from "./find-request.ts";

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
  if (!params.request_id) throw new Error("Missing required field: request_id");

  // 1. Pull latest
  await ctx.git.pull();

  // 2. Find the request in any directory
  const found = await findRequest(params.request_id, ctx.file);

  // 3. Update envelope: set status and optional cancel_reason
  const raw = await ctx.file.readJSON<Record<string, unknown>>(found.path);
  const updated = {
    ...raw,
    status: "cancelled",
    ...(params.reason ? { cancel_reason: params.reason } : {}),
  };

  // 4. Write updated envelope, git mv to cancelled/, commit, push
  const filename = `${params.request_id}.json`;
  const cancelledPath = `requests/cancelled/${filename}`;
  await ctx.file.writeJSON(found.path, updated);
  if (found.status !== "cancelled") {
    await ctx.git.mv(found.path, cancelledPath);
  }
  await ctx.git.add([cancelledPath]);
  await ctx.git.commit(`[pact] cancelled: ${params.request_id}`);
  await ctx.git.push();

  return { status: "cancelled", request_id: params.request_id, message: "Request cancelled" };
}
