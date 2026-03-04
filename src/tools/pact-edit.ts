/**
 * Handler for the pact edit action.
 *
 * General-purpose envelope editor. Agents use it to:
 * - Move requests between status directories (pending, active, completed, cancelled)
 * - Set custom fields on envelopes
 * - Correct mistakes
 *
 * This replaces the implicit status transitions that respond/cancel used to do.
 * PACT is a dumb pipe — the agent decides when and how to change status.
 */

import type { GitPort, FilePort } from "../ports.ts";
import { findRequest } from "./find-request.ts";
import type { RequestStatus } from "./find-request.ts";

export interface PactEditParams {
  request_id: string;
  /** Fields to shallow-merge into the envelope. */
  fields?: Record<string, unknown>;
  /** Move the request to a different status directory. */
  move_to?: RequestStatus;
  /** Optional note explaining the edit. */
  note?: string;
}

export interface PactEditContext {
  userId: string;
  repoPath: string;
  git: GitPort;
  file: FilePort;
}

export interface PactEditResult {
  request_id: string;
  status: string;
  moved: boolean;
  message: string;
}

export async function handlePactEdit(
  params: PactEditParams,
  ctx: PactEditContext,
): Promise<PactEditResult> {
  if (!params.request_id) throw new Error("Missing required field: request_id");
  if (!params.fields && !params.move_to) {
    throw new Error("At least one of 'fields' or 'move_to' is required");
  }

  // 1. Pull latest
  await ctx.git.pull();

  // 2. Find the request in any directory
  const found = await findRequest(params.request_id, ctx.file);
  const raw = await ctx.file.readJSON<Record<string, unknown>>(found.path);

  // 3. Build edit audit entry
  const editEntry: Record<string, unknown> = {
    edited_at: new Date().toISOString(),
    edited_by: ctx.userId,
  };
  if (params.fields) editEntry.fields = params.fields;
  if (params.move_to) editEntry.move_to = params.move_to;
  if (params.note) editEntry.note = params.note;

  // 4. Shallow-merge fields into envelope
  const existingEdits = Array.isArray(raw.edits) ? raw.edits : [];
  const updated: Record<string, unknown> = {
    ...raw,
    ...(params.fields ?? {}),
    edits: [...existingEdits, editEntry],
  };

  // 5. Update status field if moving
  const targetStatus = params.move_to ?? found.status;
  if (params.move_to) {
    updated.status = params.move_to;
  }

  const filename = `${params.request_id}.json`;
  const filesToCommit: string[] = [];

  // 6. Write updated envelope and optionally move
  const moved = params.move_to !== undefined && params.move_to !== found.status;
  if (moved) {
    const targetDir = `requests/${params.move_to}`;
    const targetPath = `${targetDir}/${filename}`;
    await ctx.file.writeJSON(found.path, updated);
    await ctx.git.mv(found.path, targetPath);
    filesToCommit.push(targetPath);
  } else {
    await ctx.file.writeJSON(found.path, updated);
    filesToCommit.push(found.path);
  }

  // 7. Commit and push
  await ctx.git.add(filesToCommit);
  const parts = [];
  if (params.fields) parts.push("fields updated");
  if (moved) parts.push(`${found.status} -> ${params.move_to}`);
  await ctx.git.commit(
    `[pact] edit: ${params.request_id} (${parts.join(", ")})`,
  );
  await ctx.git.push();

  return {
    request_id: params.request_id,
    status: targetStatus,
    moved,
    message: `Request edited${moved ? ` and moved to ${targetStatus}` : ""}`,
  };
}
