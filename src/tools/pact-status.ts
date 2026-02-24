/**
 * Handler for the pact_status tool.
 *
 * Pulls latest from remote, searches requests/pending/, requests/active/,
 * requests/completed/, and requests/cancelled/ for the given request_id,
 * and returns the status with original request data and response (if completed).
 * Falls back to local data with a staleness warning when the
 * remote is unreachable.
 */

import { join } from "node:path";
import type { GitPort, FilePort } from "../ports.ts";
import { RequestEnvelopeSchema, ResponseEnvelopeSchema } from "../schemas.ts";
import { log } from "../logger.ts";

export interface PactStatusParams {
  request_id: string;
}

export interface PactStatusContext {
  userId: string;
  repoPath: string;
  git: GitPort;
  file: FilePort;
}

export interface PactStatusResult {
  status: "pending" | "active" | "completed" | "cancelled";
  request: unknown;
  response?: unknown;
  responses?: unknown[];
  attachment_paths?: Array<{ filename: string; description: string; path: string }>;
  warning?: string;
}

function parseRequestEnvelope(raw: unknown, requestId: string): unknown {
  const parsed = RequestEnvelopeSchema.safeParse(raw);
  if (!parsed.success) {
    log("warn", "malformed request envelope", { request_id: requestId, errors: parsed.error.issues });
    return raw; // Return raw data so the user still sees something
  }
  return parsed.data;
}

function parseResponseEnvelope(raw: unknown, requestId: string): unknown {
  const parsed = ResponseEnvelopeSchema.safeParse(raw);
  if (!parsed.success) {
    log("warn", "malformed response envelope", { request_id: requestId, errors: parsed.error.issues });
    return raw;
  }
  return parsed.data;
}

/** Parse raw JSON into a typed envelope for attachment resolution. Falls back to a minimal stub. */
function tryParseEnvelope(raw: unknown, requestId: string): { attachments?: Array<{ filename: string; description: string }>; request_id: string } {
  const parsed = RequestEnvelopeSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  return { request_id: requestId };
}

function resolveAttachmentPaths(
  envelope: { attachments?: Array<{ filename: string; description: string }>; request_id: string },
  repoPath: string,
): Array<{ filename: string; description: string; path: string }> | undefined {
  if (!envelope.attachments || envelope.attachments.length === 0) return undefined;
  return envelope.attachments.map(att => ({
    filename: att.filename,
    description: att.description,
    path: join(repoPath, "attachments", envelope.request_id, att.filename),
  }));
}

export async function handlePactStatus(
  params: PactStatusParams,
  ctx: PactStatusContext,
): Promise<PactStatusResult> {
  if (!params.request_id) throw new Error("Missing required field: request_id");

  let warning: string | undefined;

  // 1. Pull latest (catch failure, set warning)
  try {
    await ctx.git.pull();
  } catch {
    warning = "Using local data (remote unreachable). Results may be stale.";
  }

  // 2. Search directories in priority order
  const searchDirs: Array<{ dir: string; status: PactStatusResult["status"] }> = [
    { dir: "requests/pending", status: "pending" },
    { dir: "requests/active", status: "active" },
    { dir: "requests/completed", status: "completed" },
    { dir: "requests/cancelled", status: "cancelled" },
  ];

  for (const { dir, status } of searchDirs) {
    const files = await ctx.file.listDirectory(dir);
    if (!files.includes(`${params.request_id}.json`)) continue;

    const raw = await ctx.file.readJSON<unknown>(`${dir}/${params.request_id}.json`);
    const request = parseRequestEnvelope(raw, params.request_id);
    const attachmentPaths = resolveAttachmentPaths(tryParseEnvelope(raw, params.request_id), ctx.repoPath);

    // For completed requests, also load responses
    if (status === "completed") {
      const responseData = await loadResponses(ctx.file, params.request_id);
      return buildResult(status, request, attachmentPaths, warning, responseData);
    }

    return buildResult(status, request, attachmentPaths, warning);
  }

  throw new Error(`Request ${params.request_id} not found in any directory`);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

type AttachmentPathList = Array<{ filename: string; description: string; path: string }>;

/** Load responses for a completed request (per-respondent directory or flat file). */
async function loadResponses(
  file: FilePort,
  requestId: string,
): Promise<{ response?: unknown; responses?: unknown[] }> {
  const responseDir = `responses/${requestId}`;
  const hasFlatResponse = await file.fileExists(`${responseDir}.json`);
  const hasResponseDir = await file.fileExists(responseDir);

  if (hasResponseDir && !hasFlatResponse) {
    const responseFiles = await file.listDirectory(responseDir);
    const responses: unknown[] = [];
    for (const fileName of responseFiles) {
      responses.push(parseResponseEnvelope(
        await file.readJSON<unknown>(`${responseDir}/${fileName}`),
        requestId,
      ));
    }
    return { responses };
  }

  const response = parseResponseEnvelope(
    await file.readJSON<unknown>(`responses/${requestId}.json`),
    requestId,
  );
  return { response };
}

/** Build a PactStatusResult with optional fields. */
function buildResult(
  status: PactStatusResult["status"],
  request: unknown,
  attachmentPaths: AttachmentPathList | undefined,
  warning: string | undefined,
  responseData?: { response?: unknown; responses?: unknown[] },
): PactStatusResult {
  return {
    status,
    request,
    ...responseData,
    ...(attachmentPaths ? { attachment_paths: attachmentPaths } : {}),
    ...(warning ? { warning } : {}),
  };
}
