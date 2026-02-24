/**
 * Handler for the pact_request tool.
 *
 * Validates inputs, builds a request envelope, writes it to
 * requests/pending/{id}.json, commits, and pushes.
 *
 * Supports both:
 *   - recipients: string[]  (new group addressing)
 *   - recipient: string     (legacy single-recipient)
 */

import type { GitPort, ConfigPort, FilePort } from "../ports.ts";
import { generateRequestId } from "../request-id.ts";
import { getRequiredContextFieldsFromYaml } from "../pact-loader.ts";
import { existsSync } from "node:fs";
import { join } from "node:path";

export interface AttachmentInput {
  filename: string;
  description: string;
  content: string;
}

export interface PactRequestParams {
  request_type: string;
  recipient?: string;
  recipients?: string[];
  group_ref?: string;
  context_bundle: Record<string, unknown>;
  deadline?: string;
  thread_id?: string;
  attachments?: AttachmentInput[];
}

export interface PactRequestContext {
  userId: string;
  repoPath: string;
  git: GitPort;
  config: ConfigPort;
  file: FilePort;
}

export async function handlePactRequest(
  params: PactRequestParams,
  ctx: PactRequestContext,
): Promise<{ request_id: string; thread_id: string; status: string; message: string; validation_warnings?: string[] }> {
  // 1. Validate required fields
  if (!params.request_type) throw new Error("Missing required field: request_type");
  if (!params.context_bundle) throw new Error("Missing required field: context_bundle");

  // 2. Resolve recipient list: new recipients[] or legacy recipient
  const usedRecipientsArray = !!(params.recipients && params.recipients.length > 0);
  let recipientIds: string[];
  if (usedRecipientsArray) {
    recipientIds = params.recipients!;
  } else if (params.recipient) {
    recipientIds = [params.recipient];
  } else {
    throw new Error("Missing required field: recipient or recipients");
  }

  // 3. Validate non-empty
  if (recipientIds.length === 0) {
    throw new Error("Recipients list must not be empty");
  }

  // 4. Validate sender not in recipients
  if (recipientIds.includes(ctx.userId)) {
    throw new Error("Sender cannot be a recipient");
  }

  // 5. Check pact exists: pacts/{type}/PACT.md (legacy location)
  const pactPath = join(ctx.repoPath, "pacts", params.request_type, "PACT.md");
  if (!existsSync(pactPath)) {
    throw new Error(`No pact found for request type '${params.request_type}'`);
  }

  // 5b. Schema validation: warn on missing required context fields
  let validationWarnings: string[] | undefined;
  const requiredFields = await getRequiredContextFieldsFromYaml(ctx.file, params.request_type);
  if (requiredFields) {
    const submittedKeys = Object.keys(params.context_bundle);
    const missing = requiredFields.filter((field) => !submittedKeys.includes(field));
    if (missing.length > 0) {
      validationWarnings = missing.map((field) => `Missing required field '${field}'`);
    }
  }

  // 6. Validate all recipients exist in team config and build UserRef[]
  const recipientRefs: Array<{ user_id: string; display_name: string }> = [];
  for (const rid of recipientIds) {
    const user = await ctx.config.lookupUser(rid);
    if (!user) {
      throw new Error(`Recipient '${rid}' not found in team config`);
    }
    recipientRefs.push({ user_id: user.user_id, display_name: user.display_name });
  }

  // 7. Look up sender
  const sender = await ctx.config.lookupUser(ctx.userId);
  if (!sender) {
    throw new Error(`Sender '${ctx.userId}' not found in team config`);
  }

  // 8. Generate ID and build envelope
  const requestId = generateRequestId(ctx.userId);
  const attachmentMeta = params.attachments?.map(({ filename, description }) => ({ filename, description }));
  const threadId = params.thread_id ?? requestId;
  const envelope: Record<string, unknown> = {
    request_id: requestId,
    thread_id: threadId,
    request_type: params.request_type,
    sender: { user_id: sender.user_id, display_name: sender.display_name },
    recipient: recipientRefs[0], // backward compat: first recipient for old readers
    ...(usedRecipientsArray ? { recipients: recipientRefs } : {}),
    status: "pending",
    created_at: new Date().toISOString(),
    deadline: params.deadline ?? null,
    context_bundle: params.context_bundle,
    expected_response: { type: "text" },
    ...(attachmentMeta?.length ? { attachments: attachmentMeta } : {}),
  };

  // Include group_ref if provided
  if (params.group_ref) {
    envelope.group_ref = params.group_ref;
  }

  // 9. Write attachment files
  const filesToAdd = [`requests/pending/${requestId}.json`];
  if (params.attachments?.length) {
    for (const att of params.attachments) {
      const attPath = `attachments/${requestId}/${att.filename}`;
      await ctx.file.writeText(attPath, att.content);
      filesToAdd.push(attPath);
    }
  }

  // 10. Write envelope, commit, push
  const recipientLabel = recipientIds.length === 1
    ? recipientIds[0]
    : `[${recipientIds.join(",")}]`;
  await ctx.file.writeJSON(`requests/pending/${requestId}.json`, envelope);
  await ctx.git.add(filesToAdd);
  await ctx.git.commit(
    `[pact] new request: ${requestId} (${params.request_type}) -> ${recipientLabel}`,
  );
  await ctx.git.push();

  return {
    request_id: requestId,
    thread_id: threadId,
    status: "pending",
    message: "Request submitted",
    ...(validationWarnings ? { validation_warnings: validationWarnings } : {}),
  };
}
