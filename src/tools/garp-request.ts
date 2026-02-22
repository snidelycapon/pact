/**
 * Handler for the garp_request tool.
 *
 * Validates inputs, builds a request envelope, writes it to
 * requests/pending/{id}.json, commits, and pushes.
 */

import type { GitPort, ConfigPort, FilePort } from "../ports.ts";
import { generateRequestId } from "../request-id.ts";
import { existsSync } from "node:fs";
import { join } from "node:path";

export interface AttachmentInput {
  filename: string;
  description: string;
  content: string;
}

export interface GarpRequestParams {
  request_type: string;
  recipient: string;
  context_bundle: Record<string, unknown>;
  deadline?: string;
  thread_id?: string;
  attachments?: AttachmentInput[];
}

export interface GarpRequestContext {
  userId: string;
  repoPath: string;
  git: GitPort;
  config: ConfigPort;
  file: FilePort;
}

export async function handleGarpRequest(
  params: GarpRequestParams,
  ctx: GarpRequestContext,
): Promise<{ request_id: string; status: string; message: string }> {
  // 1. Validate required fields
  if (!params.request_type) throw new Error("Missing required field: request_type");
  if (!params.recipient) throw new Error("Missing required field: recipient");
  if (!params.context_bundle) throw new Error("Missing required field: context_bundle");

  // 2. Check skill exists: skills/{type}/SKILL.md
  const skillPath = join(ctx.repoPath, "skills", params.request_type, "SKILL.md");
  if (!existsSync(skillPath)) {
    throw new Error(`No skill found for request type '${params.request_type}'`);
  }

  // 3. Validate recipient in config
  const recipient = await ctx.config.lookupUser(params.recipient);
  if (!recipient) {
    throw new Error(`Recipient '${params.recipient}' not found in team config`);
  }

  // 4. Look up sender
  const sender = await ctx.config.lookupUser(ctx.userId);
  if (!sender) {
    throw new Error(`Sender '${ctx.userId}' not found in team config`);
  }

  // 5. Generate ID and build envelope
  const requestId = generateRequestId(ctx.userId);
  const attachmentMeta = params.attachments?.map(({ filename, description }) => ({ filename, description }));
  const envelope = {
    request_id: requestId,
    ...(params.thread_id ? { thread_id: params.thread_id } : {}),
    request_type: params.request_type,
    sender: { user_id: sender.user_id, display_name: sender.display_name },
    recipient: { user_id: recipient.user_id, display_name: recipient.display_name },
    status: "pending",
    created_at: new Date().toISOString(),
    deadline: params.deadline ?? null,
    context_bundle: params.context_bundle,
    expected_response: { type: "text" },
    ...(attachmentMeta?.length ? { attachments: attachmentMeta } : {}),
  };

  // 6. Write attachment files
  const filesToAdd = [`requests/pending/${requestId}.json`];
  if (params.attachments?.length) {
    for (const att of params.attachments) {
      const attPath = `attachments/${requestId}/${att.filename}`;
      await ctx.file.writeText(attPath, att.content);
      filesToAdd.push(attPath);
    }
  }

  // 7. Write envelope, commit, push
  await ctx.file.writeJSON(`requests/pending/${requestId}.json`, envelope);
  await ctx.git.add(filesToAdd);
  await ctx.git.commit(
    `[garp] new request: ${requestId} (${params.request_type}) -> ${params.recipient}`,
  );
  await ctx.git.push();

  return { request_id: requestId, status: "pending", message: "Request submitted" };
}
