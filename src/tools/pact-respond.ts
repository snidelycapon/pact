/**
 * Handler for the pact_respond tool.
 *
 * Validates the request exists and the current user is the designated
 * recipient, writes a response envelope to responses/, moves the
 * request from pending/ to completed/ via git mv, and commits
 * atomically.
 */

import type { GitPort, ConfigPort, FilePort } from "../ports.ts";
import { RequestEnvelopeSchema } from "../schemas.ts";

export interface PactRespondParams {
  request_id: string;
  response_bundle?: Record<string, unknown>;
}

export interface PactRespondContext {
  userId: string;
  repoPath: string;
  git: GitPort;
  config: ConfigPort;
  file: FilePort;
}

export async function handlePactRespond(
  params: PactRespondParams,
  ctx: PactRespondContext,
): Promise<{ status: string; request_id: string; message: string }> {
  // 1. Validate required fields
  if (!params.request_id) throw new Error("Missing required field: request_id");
  if (!params.response_bundle) throw new Error("Missing required field: response_bundle");

  // 2. Pull latest
  await ctx.git.pull();

  // 3. Find the request - check pending, active, then completed
  const filename = `${params.request_id}.json`;
  let sourceDir: string | undefined;

  const pendingFiles = await ctx.file.listDirectory("requests/pending");
  if (pendingFiles.includes(filename)) {
    sourceDir = "requests/pending";
  } else {
    const activeFiles = await ctx.file.listDirectory("requests/active");
    if (activeFiles.includes(filename)) {
      sourceDir = "requests/active";
    } else {
      const completedFiles = await ctx.file.listDirectory("requests/completed");
      if (completedFiles.includes(filename)) {
        throw new Error(`Request ${params.request_id} is already completed`);
      }
      throw new Error(`Request ${params.request_id} not found in any directory`);
    }
  }

  // 4. Read request envelope, validate schema, verify current user is recipient
  const raw = await ctx.file.readJSON<unknown>(`${sourceDir}/${filename}`);
  const parsed = RequestEnvelopeSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Malformed request envelope for ${params.request_id}: ${parsed.error.issues.map((i) => i.message).join(", ")}`);
  }
  const envelope = parsed.data;
  const isRecipient =
    envelope.recipient?.user_id === ctx.userId ||
    envelope.recipients?.some((r) => r.user_id === ctx.userId);
  if (!isRecipient) {
    throw new Error(`You are not the recipient of request ${params.request_id}`);
  }

  // 5. Update status to "completed" before moving (US-015)
  const updatedEnvelope = { ...raw as Record<string, unknown>, status: "completed" };
  await ctx.file.writeJSON(`${sourceDir}/${filename}`, updatedEnvelope);

  // 6. Look up responder from config
  const responder = await ctx.config.lookupUser(ctx.userId);

  // 7. Write response file (per-respondent directory for group envelopes, flat for legacy)
  const response = {
    request_id: params.request_id,
    responder: { user_id: responder!.user_id, display_name: responder!.display_name },
    responded_at: new Date().toISOString(),
    response_bundle: params.response_bundle,
  };
  const isGroupEnvelope = envelope.recipients && envelope.recipients.length > 0;
  const responsePath = isGroupEnvelope
    ? `responses/${params.request_id}/${ctx.userId}.json`
    : `responses/${params.request_id}.json`;
  await ctx.file.writeJSON(responsePath, response);

  // 8. Git mv request to completed
  await ctx.git.mv(`${sourceDir}/${filename}`, `requests/completed/${filename}`);

  // 9. Atomic commit (both response write + request move)
  await ctx.git.add([responsePath, `requests/completed/${filename}`]);
  const senderUserId = envelope.sender.user_id;
  await ctx.git.commit(
    `[pact] response: ${params.request_id} (${envelope.request_type}) ${ctx.userId} -> ${senderUserId}`,
  );

  // 10. Push
  await ctx.git.push();

  return { status: "completed", request_id: params.request_id, message: "Response submitted" };
}
