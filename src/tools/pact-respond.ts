/**
 * Handler for the pact respond action.
 *
 * Writes a response file to responses/. Does NOT change the request's
 * status or move it between directories — that's the agent's job via
 * the `edit` action. PACT is a dumb pipe.
 */

import type { GitPort, ConfigPort, FilePort } from "../ports.ts";
import { findRequest } from "./find-request.ts";

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
  if (!params.request_id) throw new Error("Missing required field: request_id");
  if (!params.response_bundle) throw new Error("Missing required field: response_bundle");

  // 1. Pull latest
  await ctx.git.pull();

  // 2. Find the request in any status directory
  const found = await findRequest(params.request_id, ctx.file);
  const envelope = found.envelope;
  const isGroupEnvelope = envelope.recipients && envelope.recipients.length > 0;

  // 3. Get responder identity from local config
  const userConfig = await ctx.config.readUserConfig();
  const responder = { user_id: userConfig.user_id, display_name: userConfig.display_name };

  // 4. Write response file (per-respondent directory for group envelopes, flat for legacy)
  const response = {
    request_id: params.request_id,
    responder,
    responded_at: new Date().toISOString(),
    response_bundle: params.response_bundle,
  };
  const responsePath = isGroupEnvelope
    ? `responses/${params.request_id}/${ctx.userId}.json`
    : `responses/${params.request_id}.json`;
  await ctx.file.writeJSON(responsePath, response);

  // 5. Commit and push (response only — no status change)
  await ctx.git.add([responsePath]);
  const senderUserId = envelope.sender.user_id;
  await ctx.git.commit(
    `[pact] response: ${params.request_id} (${envelope.request_type}) ${ctx.userId} -> ${senderUserId}`,
  );
  await ctx.git.push();

  return { status: found.status, request_id: params.request_id, message: "Response submitted" };
}
