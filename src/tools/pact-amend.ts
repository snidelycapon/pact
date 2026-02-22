/**
 * Handler for the pact_amend tool.
 *
 * Validates the request exists in pending/, verifies the caller is the
 * original sender, appends an amendment entry to the amendments array,
 * writes the updated envelope in place, and commits atomically.
 */

import type { GitPort, FilePort } from "../ports.ts";
import type { AmendmentEntry } from "../schemas.ts";
import { findPendingRequest } from "./find-pending-request.ts";

export interface PactAmendParams {
  request_id: string;
  fields: Record<string, unknown>;
  note?: string;
}

export interface PactAmendContext {
  userId: string;
  repoPath: string;
  git: GitPort;
  file: FilePort;
}

export async function handlePactAmend(
  params: PactAmendParams,
  ctx: PactAmendContext,
): Promise<{ status: string; request_id: string; amendment_count: number; message: string }> {
  // 1. Validate required fields
  if (!params.request_id) throw new Error("Missing required field: request_id");
  if (!params.fields) throw new Error("Missing required field: fields");

  // 2. Pull latest
  await ctx.git.pull();

  // 3. Find and validate the pending request
  const { envelope, pendingPath } = await findPendingRequest(
    params.request_id, ctx.file, "amended",
  );

  // 4. Verify caller is the sender
  if (envelope.sender.user_id !== ctx.userId) {
    throw new Error("Only the sender can amend a request");
  }

  // 5. Create amendment entry
  const amendment: AmendmentEntry = {
    amended_at: new Date().toISOString(),
    amended_by: ctx.userId,
    fields: params.fields,
    ...(params.note ? { note: params.note } : {}),
  };

  // 6. Build updated envelope with amendment appended
  const existingAmendments = envelope.amendments ?? [];
  const updatedEnvelope = {
    ...envelope,
    amendments: [...existingAmendments, amendment],
  };

  // 7. Write updated envelope back in place
  await ctx.file.writeJSON(pendingPath, updatedEnvelope);

  // 8. Git add, commit, push
  await ctx.git.add([pendingPath]);
  await ctx.git.commit(`[pact] amended: ${params.request_id}`);
  await ctx.git.push();

  return {
    status: "amended",
    request_id: params.request_id,
    amendment_count: updatedEnvelope.amendments.length,
    message: "Request amended",
  };
}
