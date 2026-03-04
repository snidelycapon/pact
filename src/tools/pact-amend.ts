/**
 * Handler for the pact amend action.
 *
 * Finds the request in any directory, appends an amendment entry,
 * and commits. No sender authorization or status gating — anyone
 * with repo access can amend any request in any state.
 */

import type { GitPort, FilePort } from "../ports.ts";
import type { AmendmentEntry } from "../schemas.ts";
import { findRequest } from "./find-request.ts";

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
  if (!params.request_id) throw new Error("Missing required field: request_id");
  if (!params.fields) throw new Error("Missing required field: fields");

  // 1. Pull latest
  await ctx.git.pull();

  // 2. Find the request in any directory
  const found = await findRequest(params.request_id, ctx.file);

  // 3. Create amendment entry
  const amendment: AmendmentEntry = {
    amended_at: new Date().toISOString(),
    amended_by: ctx.userId,
    fields: params.fields,
    ...(params.note ? { note: params.note } : {}),
  };

  // 4. Build updated envelope with amendment appended
  const existingAmendments = found.envelope.amendments ?? [];
  const updatedEnvelope = {
    ...found.envelope,
    amendments: [...existingAmendments, amendment],
  };

  // 5. Write updated envelope back in place
  await ctx.file.writeJSON(found.path, updatedEnvelope);

  // 6. Git add, commit, push
  await ctx.git.add([found.path]);
  await ctx.git.commit(`[pact] amended: ${params.request_id}`);
  await ctx.git.push();

  return {
    status: found.status,
    request_id: params.request_id,
    amendment_count: updatedEnvelope.amendments.length,
    message: "Request amended",
  };
}
