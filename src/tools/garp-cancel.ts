/**
 * Handler for the garp_cancel tool.
 *
 * Validates the request exists and the current user is the sender,
 * updates the status to "cancelled", optionally sets cancel_reason,
 * moves the request from pending/ to cancelled/ via git mv, and
 * commits atomically.
 */

import type { GitPort, FilePort } from "../ports.ts";
import { RequestEnvelopeSchema } from "../schemas.ts";

export interface GarpCancelParams {
  request_id: string;
  reason?: string;
}

export interface GarpCancelContext {
  userId: string;
  repoPath: string;
  git: GitPort;
  file: FilePort;
}

export async function handleGarpCancel(
  params: GarpCancelParams,
  ctx: GarpCancelContext,
): Promise<{ status: string; request_id: string; message: string }> {
  // 1. Validate required fields
  if (!params.request_id) throw new Error("Missing required field: request_id");

  // 2. Pull latest
  await ctx.git.pull();

  // 3. Find the request - check pending first, then completed/cancelled for errors
  const filename = `${params.request_id}.json`;

  const pendingFiles = await ctx.file.listDirectory("requests/pending");
  if (!pendingFiles.includes(filename)) {
    const completedFiles = await ctx.file.listDirectory("requests/completed");
    if (completedFiles.includes(filename)) {
      throw new Error(`Request ${params.request_id} is already completed`);
    }
    const cancelledFiles = await ctx.file.listDirectory("requests/cancelled");
    if (cancelledFiles.includes(filename)) {
      throw new Error(`Request ${params.request_id} is already cancelled`);
    }
    throw new Error(`Request ${params.request_id} not found`);
  }

  // 4. Read envelope, validate schema
  const raw = await ctx.file.readJSON<unknown>(`requests/pending/${filename}`);
  const parsed = RequestEnvelopeSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `Malformed request envelope for ${params.request_id}: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
    );
  }
  const envelope = parsed.data;

  // 5. Verify sender: only the original sender can cancel
  if (envelope.sender.user_id !== ctx.userId) {
    throw new Error(`Only the sender can cancel a request`);
  }

  // 6. Update envelope: set status and optional cancel_reason
  const updated = { ...envelope, status: "cancelled" } as Record<string, unknown>;
  if (params.reason) {
    updated.cancel_reason = params.reason;
  }

  // 7. Write updated envelope back to pending/ location
  await ctx.file.writeJSON(`requests/pending/${filename}`, updated);

  // 8. Git mv from pending/ to cancelled/
  await ctx.git.mv(`requests/pending/${filename}`, `requests/cancelled/${filename}`);

  // 9. Git add the cancelled/ file
  await ctx.git.add([`requests/cancelled/${filename}`]);

  // 10. Git commit
  await ctx.git.commit(`[garp] cancelled: ${params.request_id}`);

  // 11. Push
  await ctx.git.push();

  return { status: "cancelled", request_id: params.request_id, message: "Request cancelled" };
}
