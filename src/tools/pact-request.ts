/**
 * Handler for the pact_request tool.
 *
 * Validates inputs, builds a request envelope, writes it to
 * requests/pending/{id}.json, commits, and pushes.
 *
 * Supports both:
 *   - recipients: string[]  (new group addressing)
 *   - recipient: string     (legacy single-recipient)
 *
 * Recipients are not validated against a registry — PACT delivers
 * to whatever address the sender provides. IDs are normalized
 * (lowercase, hyphens-for-spaces).
 */

import type { GitPort, ConfigPort, FilePort } from "../ports.ts";
import { generateRequestId } from "../request-id.ts";
import { getRequiredContextFieldsFromYaml, loadFlatFilePactByName, loadPactMetadata } from "../pact-loader.ts";
import type { PactMetadata, BundleSpec, AttachmentSlot } from "../pact-loader.ts";
import { normalizeId } from "../normalize.ts";

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

export interface SendResult {
  request_id: string;
  thread_id: string;
  status: string;
  message: string;
  validation_warnings: string[];
}

export interface ComposeResult {
  mode: "compose";
  request_type: string;
  description: string;
  when_to_use: string[];
  context_bundle: BundleSpec;
  response_bundle: BundleSpec;
  has_hooks: boolean;
  scope?: string;
  defaults?: Record<string, unknown>;
  multi_round?: boolean;
  attachments?: AttachmentSlot[];
}

export async function handlePactRequest(
  params: PactRequestParams,
  ctx: PactRequestContext,
): Promise<SendResult | ComposeResult> {
  // 1. Validate required fields
  if (!params.request_type) throw new Error("Missing required field: request_type");

  // 1b. Compose mode: request_type present but context_bundle missing
  if (!params.context_bundle) {
    return loadComposeResponse(ctx.file, params.request_type);
  }

  // 2. Resolve recipient list: new recipients[] or legacy recipient
  const hasExplicitRecipients = !!(params.recipients && params.recipients.length > 0);
  let recipientIds: string[];
  if (hasExplicitRecipients) {
    recipientIds = params.recipients!.map(normalizeId);
  } else if (params.recipient) {
    recipientIds = [normalizeId(params.recipient)];
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

  // 5. Check pact exists: flat-file store (new) or legacy directory
  const flatFileExists = await ctx.file.fileExists(`pact-store/${params.request_type}.md`);
  const legacyExists = await ctx.file.fileExists(`pacts/${params.request_type}/PACT.md`);
  if (!flatFileExists && !legacyExists) {
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

  // 6. Build recipient refs (no config lookup — just use normalized IDs)
  const recipientRefs = recipientIds.map((id) => ({ user_id: id }));

  // 7. Get sender identity from local config
  const userConfig = await ctx.config.readUserConfig();
  const sender = { user_id: userConfig.user_id, display_name: userConfig.display_name };

  // 8. Generate ID and build envelope
  const requestId = generateRequestId(ctx.userId);
  const attachmentMeta = params.attachments?.map(({ filename, description }) => ({ filename, description }));
  const threadId = params.thread_id ?? requestId;
  const envelope: Record<string, unknown> = {
    request_id: requestId,
    thread_id: threadId,
    request_type: params.request_type,
    sender,
    recipient: recipientRefs[0], // backward compat: first recipient for old readers
    ...(hasExplicitRecipients ? { recipients: recipientRefs } : {}),
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
    for (const attachment of params.attachments) {
      const attachmentPath = `attachments/${requestId}/${attachment.filename}`;
      await ctx.file.writeText(attachmentPath, attachment.content);
      filesToAdd.push(attachmentPath);
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
    validation_warnings: validationWarnings ?? [],
  };
}

// ---------------------------------------------------------------------------
// Compose-mode helper
// ---------------------------------------------------------------------------

/**
 * Load pact metadata and return a compose-mode response.
 *
 * Checks flat-file pact-store/{name}.md first, then falls back to
 * legacy pacts/{name}/PACT.md. Throws when neither format is found.
 */
async function loadComposeResponse(
  file: FilePort,
  requestType: string,
): Promise<ComposeResult> {
  // Try flat-file store first
  let pact: PactMetadata | undefined = await loadFlatFilePactByName(file, requestType);

  // Fall back to legacy directory format
  if (!pact) {
    pact = await loadPactMetadata(file, requestType);
  }

  if (!pact) {
    throw new Error(`No pact found for request type '${requestType}'`);
  }

  return {
    mode: "compose",
    request_type: pact.name,
    description: pact.description,
    when_to_use: pact.when_to_use,
    context_bundle: pact.context_bundle,
    response_bundle: pact.response_bundle,
    has_hooks: pact.has_hooks,
    ...(pact.scope ? { scope: pact.scope } : {}),
    ...(pact.defaults ? { defaults: pact.defaults } : {}),
    ...(pact.multi_round !== undefined ? { multi_round: pact.multi_round } : {}),
    ...(pact.attachments ? { attachments: pact.attachments } : {}),
  };
}
