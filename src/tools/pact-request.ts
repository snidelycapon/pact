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

import { basename } from "node:path";
import type { GitPort, ConfigPort, FilePort } from "../ports.ts";
import { generateRequestId } from "../request-id.ts";
import { getRequiredContextFieldsFromYaml, loadFlatFilePactByName, loadPactMetadata } from "../pact-loader.ts";
import type { PactMetadata, BundleSpec, AttachmentSlot } from "../pact-loader.ts";
import { normalizeId } from "../normalize.ts";

export interface AttachmentInput {
  /** Filename stored in the repo. Defaults to basename of path when path is used. */
  filename?: string;
  description?: string;
  /** Provide content as a string (text files, agent-generated content). */
  content?: string;
  /** Provide an absolute local file path (any file type, binary-safe). */
  path?: string;
}

export interface PactRequestParams {
  request_type: string;
  subject?: string;
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
  subject_hint?: string;
}

export async function handlePactRequest(
  params: PactRequestParams,
  ctx: PactRequestContext,
): Promise<SendResult | ComposeResult> {
  if (!params.request_type) throw new Error("Missing required field: request_type");

  // No context_bundle means the caller wants the pact schema, not a send
  if (!params.context_bundle) {
    return loadComposeResponse(ctx.file, params.request_type);
  }

  // Resolve recipient list: new recipients[] or legacy singular recipient
  const hasExplicitRecipients = (params.recipients?.length ?? 0) > 0;
  let recipientIds: string[];
  if (hasExplicitRecipients) {
    recipientIds = params.recipients!.map(normalizeId);
  } else if (params.recipient) {
    recipientIds = [normalizeId(params.recipient)];
  } else {
    throw new Error("Missing required field: recipient or recipients");
  }

  if (recipientIds.length === 0) {
    throw new Error("Recipients list must not be empty");
  }

  if (recipientIds.includes(ctx.userId)) {
    throw new Error("Sender cannot be a recipient");
  }

  // Pact must exist in either flat-file store or legacy directory
  const flatFileExists = await ctx.file.fileExists(`pact-store/${params.request_type}.md`);
  const legacyExists = await ctx.file.fileExists(`pacts/${params.request_type}/PACT.md`);
  if (!flatFileExists && !legacyExists) {
    throw new Error(`No pact found for request type '${params.request_type}'`);
  }

  // Warn (don't reject) when required context fields are missing
  let validationWarnings: string[] | undefined;
  const requiredFields = await getRequiredContextFieldsFromYaml(ctx.file, params.request_type);
  if (requiredFields) {
    const submittedKeys = Object.keys(params.context_bundle);
    const missing = requiredFields.filter((field) => !submittedKeys.includes(field));
    if (missing.length > 0) {
      validationWarnings = missing.map((field) => `Missing required field '${field}'`);
    }
  }

  const recipientRefs = recipientIds.map((id) => ({ user_id: id }));

  const userConfig = await ctx.config.readUserConfig();
  const sender = { user_id: userConfig.user_id, display_name: userConfig.display_name };

  const requestId = generateRequestId(ctx.userId);
  const threadId = params.thread_id ?? requestId;

  // Resolve attachment inputs → metadata (for envelope) + write plan (for disk)
  const resolvedAttachments = params.attachments?.map((att) => {
    if (!att.content && !att.path) {
      throw new Error("Attachment must have either 'content' or 'path'");
    }
    const rawName = att.filename ?? (att.path ? basename(att.path) : undefined);
    if (!rawName) {
      throw new Error("Attachment must have a 'filename' or a 'path' to derive one from");
    }
    // Sanitize: strip any directory components to prevent path traversal
    const filename = basename(rawName);
    return { ...att, filename, description: att.description ?? "" };
  });

  const attachmentMeta = resolvedAttachments?.map(({ filename, description }) => ({ filename, description }));

  const envelope: Record<string, unknown> = {
    request_id: requestId,
    thread_id: threadId,
    ...(params.subject ? { subject: params.subject } : {}),
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

  if (params.group_ref) {
    envelope.group_ref = params.group_ref;
  }

  const filesToAdd = [`requests/pending/${requestId}.json`];
  if (resolvedAttachments?.length) {
    for (const attachment of resolvedAttachments) {
      const destPath = `attachments/${requestId}/${attachment.filename}`;
      if (attachment.path) {
        // Binary-safe: copy file from absolute path on disk
        await ctx.file.copyFileIn(attachment.path, destPath);
      } else {
        // Text content provided as string
        await ctx.file.writeText(destPath, attachment.content!);
      }
      filesToAdd.push(destPath);
    }
  }

  const recipientLabel = recipientIds.length === 1
    ? recipientIds[0]
    : `[${recipientIds.join(",")}]`;
  await ctx.file.writeJSON(`requests/pending/${requestId}.json`, envelope);
  await ctx.git.add(filesToAdd);
  const subjectTag = params.subject ? ` "${params.subject}"` : "";
  await ctx.git.commit(
    `[pact] new request: ${requestId} (${params.request_type})${subjectTag} -> ${recipientLabel}`,
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
    ...(pact.subject_hint ? { subject_hint: pact.subject_hint } : {}),
  };
}
