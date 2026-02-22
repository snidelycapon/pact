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
  return envelope.attachments.map(a => ({
    filename: a.filename,
    description: a.description,
    path: join(repoPath, "attachments", envelope.request_id, a.filename),
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

  // 2. Search pending/
  const pendingFiles = await ctx.file.listDirectory("requests/pending");
  if (pendingFiles.includes(`${params.request_id}.json`)) {
    const raw = await ctx.file.readJSON<unknown>(`requests/pending/${params.request_id}.json`);
    const request = parseRequestEnvelope(raw, params.request_id);
    const attachment_paths = resolveAttachmentPaths(tryParseEnvelope(raw, params.request_id), ctx.repoPath);
    return { status: "pending", request, response: undefined, ...(attachment_paths ? { attachment_paths } : {}), ...(warning ? { warning } : {}) };
  }

  // 3. Search active/ (Tier 2: brain service acknowledges request)
  const activeFiles = await ctx.file.listDirectory("requests/active");
  if (activeFiles.includes(`${params.request_id}.json`)) {
    const raw = await ctx.file.readJSON<unknown>(`requests/active/${params.request_id}.json`);
    const request = parseRequestEnvelope(raw, params.request_id);
    const attachment_paths = resolveAttachmentPaths(tryParseEnvelope(raw, params.request_id), ctx.repoPath);
    return { status: "active", request, response: undefined, ...(attachment_paths ? { attachment_paths } : {}), ...(warning ? { warning } : {}) };
  }

  // 4. Search completed/
  const completedFiles = await ctx.file.listDirectory("requests/completed");
  if (completedFiles.includes(`${params.request_id}.json`)) {
    const raw = await ctx.file.readJSON<unknown>(`requests/completed/${params.request_id}.json`);
    const request = parseRequestEnvelope(raw, params.request_id);
    const response = parseResponseEnvelope(await ctx.file.readJSON<unknown>(`responses/${params.request_id}.json`), params.request_id);
    const attachment_paths = resolveAttachmentPaths(tryParseEnvelope(raw, params.request_id), ctx.repoPath);
    return { status: "completed", request, response, ...(attachment_paths ? { attachment_paths } : {}), ...(warning ? { warning } : {}) };
  }

  // 5. Search cancelled/
  const cancelledFiles = await ctx.file.listDirectory("requests/cancelled");
  if (cancelledFiles.includes(`${params.request_id}.json`)) {
    const raw = await ctx.file.readJSON<unknown>(`requests/cancelled/${params.request_id}.json`);
    const request = parseRequestEnvelope(raw, params.request_id);
    const attachment_paths = resolveAttachmentPaths(tryParseEnvelope(raw, params.request_id), ctx.repoPath);
    return { status: "cancelled", request, ...(attachment_paths ? { attachment_paths } : {}), ...(warning ? { warning } : {}) };
  }

  // 6. Not found in pending/, active/, completed/, or cancelled/
  throw new Error(`Request ${params.request_id} not found in any directory`);
}
