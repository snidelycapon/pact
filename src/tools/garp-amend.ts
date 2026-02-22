/**
 * Handler for the garp_amend tool.
 *
 * Validates the request exists in pending/, verifies the caller is the
 * original sender, appends an amendment entry to the amendments array,
 * writes the updated envelope in place, and commits atomically.
 */

import type { GitPort, FilePort } from "../ports.ts";
import { RequestEnvelopeSchema } from "../schemas.ts";
import type { AmendmentEntry } from "../schemas.ts";

export interface GarpAmendParams {
  request_id: string;
  fields: Record<string, unknown>;
  note?: string;
}

export interface GarpAmendContext {
  userId: string;
  repoPath: string;
  git: GitPort;
  file: FilePort;
}

export async function handleGarpAmend(
  params: GarpAmendParams,
  ctx: GarpAmendContext,
): Promise<{ status: string; request_id: string; amendment_count: number; message: string }> {
  // 1. Validate required fields
  if (!params.request_id) throw new Error("Missing required field: request_id");
  if (!params.fields) throw new Error("Missing required field: fields");

  // 2. Pull latest
  await ctx.git.pull();

  // 3. Find the request -- check pending first, then completed/cancelled for error messages
  const filename = `${params.request_id}.json`;
  const pendingPath = `requests/pending/${filename}`;

  const pendingFiles = await ctx.file.listDirectory("requests/pending");
  if (!pendingFiles.includes(filename)) {
    // Check completed
    const completedFiles = await ctx.file.listDirectory("requests/completed");
    if (completedFiles.includes(filename)) {
      throw new Error(`Request ${params.request_id} is already completed and cannot be amended`);
    }

    // Check cancelled
    const cancelledFiles = await ctx.file.listDirectory("requests/cancelled");
    if (cancelledFiles.includes(filename)) {
      throw new Error(`Request ${params.request_id} is already cancelled and cannot be amended`);
    }

    throw new Error(`Request ${params.request_id} not found`);
  }

  // 4. Read envelope and validate schema
  const raw = await ctx.file.readJSON<unknown>(pendingPath);
  const parsed = RequestEnvelopeSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `Malformed request envelope for ${params.request_id}: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
    );
  }
  const envelope = parsed.data;

  // 5. Verify caller is the sender
  if (envelope.sender.user_id !== ctx.userId) {
    throw new Error("Only the sender can amend a request");
  }

  // 6. Create amendment entry
  const amendment: AmendmentEntry = {
    amended_at: new Date().toISOString(),
    amended_by: ctx.userId,
    fields: params.fields,
    ...(params.note ? { note: params.note } : {}),
  };

  // 7. Build updated envelope with amendment appended
  const existingAmendments = envelope.amendments ?? [];
  const updatedEnvelope = {
    ...envelope,
    amendments: [...existingAmendments, amendment],
  };

  // 8. Write updated envelope back in place
  await ctx.file.writeJSON(pendingPath, updatedEnvelope);

  // 9. Git add, commit, push
  await ctx.git.add([pendingPath]);
  await ctx.git.commit(`[garp] amended: ${params.request_id}`);
  await ctx.git.push();

  return {
    status: "amended",
    request_id: params.request_id,
    amendment_count: updatedEnvelope.amendments.length,
    message: "Request amended",
  };
}
