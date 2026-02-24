/**
 * Handler for the pact_thread tool.
 *
 * Given a thread_id, scans all request directories (pending, completed,
 * cancelled) for matching requests, pairs each with its response (if
 * exists), and returns chronological history with a thread summary.
 *
 * This tool is read-only -- it does not modify any files or state.
 */

import type { GitPort, FilePort } from "../ports.ts";
import { RequestEnvelopeSchema, ResponseEnvelopeSchema } from "../schemas.ts";
import { log } from "../logger.ts";

export interface PactThreadParams {
  thread_id: string;
}

export interface PactThreadContext {
  userId: string;
  repoPath: string;
  git: GitPort;
  file: FilePort;
}

export interface ThreadEntry {
  request: unknown;
  response?: unknown;
  responses?: unknown[];
}

export interface ThreadSummary {
  participants: string[];
  round_count: number;
  latest_status: string;
  request_type: string;
}

export interface PactThreadResult {
  thread_id: string;
  summary: ThreadSummary;
  entries: ThreadEntry[];
  /** Top-level flat response (single-recipient, single-entry thread) */
  response?: unknown;
  /** Top-level aggregated responses across all entries (group / multi-round threads) */
  responses?: unknown[];
  message?: string;
  warning?: string;
}

const SCAN_DIRS = ["requests/pending", "requests/completed", "requests/cancelled"] as const;

export async function handlePactThread(
  params: PactThreadParams,
  ctx: PactThreadContext,
): Promise<PactThreadResult> {
  // Accept request_id as alias for thread_id (default thread_id equals request_id)
  const threadId = params.thread_id ?? (params as Record<string, unknown>).request_id as string | undefined;
  if (!threadId) throw new Error("Missing required field: thread_id");

  let warning: string | undefined;

  // 1. Pull latest (catch failure, set warning)
  try {
    await ctx.git.pull();
  } catch {
    warning = "Using local data (remote unreachable). Results may be stale.";
  }

  // 2. Scan all directories for requests matching thread_id
  const DIR_STATUS: Record<string, string> = {
    "requests/pending": "pending",
    "requests/completed": "completed",
    "requests/cancelled": "cancelled",
  };
  const entries: Array<{ request: Record<string, unknown>; dir: string; status: string }> = [];

  for (const dir of SCAN_DIRS) {
    let files: string[];
    try {
      files = await ctx.file.listDirectory(dir);
    } catch {
      continue; // Directory may not exist (e.g., cancelled/ in pre-Phase-2 repos)
    }

    for (const fileName of files) {
      const raw = await ctx.file.readJSON<unknown>(`${dir}/${fileName}`);
      const parsed = RequestEnvelopeSchema.safeParse(raw);
      if (!parsed.success) {
        log("warn", "skipping malformed envelope in thread scan", { file: fileName, dir });
        continue;
      }
      if (parsed.data.thread_id === threadId) {
        entries.push({
          request: parsed.data as unknown as Record<string, unknown>,
          dir,
          status: DIR_STATUS[dir] ?? "unknown",
        });
      }
    }
  }

  // 3. Empty thread
  if (entries.length === 0) {
    return {
      thread_id: threadId,
      summary: { participants: [], round_count: 0, latest_status: "unknown", request_type: "unknown" },
      entries: [],
      message: "No requests found for this thread",
      ...(warning ? { warning } : {}),
    };
  }

  // 4. Sort chronologically by created_at
  entries.sort((a, b) => {
    const aTime = new Date(a.request.created_at as string).getTime();
    const bTime = new Date(b.request.created_at as string).getTime();
    return aTime - bTime;
  });

  // 5. Pair each request with its response(s)
  const threadEntries: ThreadEntry[] = [];
  for (const entry of entries) {
    const requestId = entry.request.request_id as string;
    const responseData = await loadResponsesForThread(ctx.file, requestId);
    threadEntries.push({ request: entry.request, ...responseData });
  }

  // 6. Build summary
  const participantSet = new Set<string>();
  for (const entry of entries) {
    const sender = (entry.request.sender as { user_id: string }).user_id;
    participantSet.add(sender);
    // Support both single recipient and recipients[] (group envelopes)
    const recipients = entry.request.recipients as Array<{ user_id: string }> | undefined;
    const recipient = entry.request.recipient as { user_id: string } | undefined;
    if (recipients) {
      for (const recip of recipients) participantSet.add(recip.user_id);
    } else if (recipient) {
      participantSet.add(recipient.user_id);
    }
  }
  // Also include responders from per-respondent responses
  for (const threadEntry of threadEntries) {
    if (threadEntry.responses) {
      for (const resp of threadEntry.responses) {
        const responder = (resp as Record<string, unknown>).responder as { user_id: string } | undefined;
        if (responder) participantSet.add(responder.user_id);
      }
    }
    if (threadEntry.response) {
      const responder = (threadEntry.response as Record<string, unknown>).responder as { user_id: string } | undefined;
      if (responder) participantSet.add(responder.user_id);
    }
  }

  const latest = entries[entries.length - 1];
  const summary: ThreadSummary = {
    participants: [...participantSet].sort(),
    round_count: entries.length,
    latest_status: latest.status,
    request_type: (entries[0].request.request_type as string),
  };

  // Aggregate responses across all entries for top-level convenience
  const allResponses: unknown[] = [];
  let singleResponse: unknown | undefined;
  for (const threadEntry of threadEntries) {
    if (threadEntry.responses) {
      for (const resp of threadEntry.responses) allResponses.push(resp);
    }
    if (threadEntry.response) {
      allResponses.push(threadEntry.response);
      singleResponse = threadEntry.response;
    }
  }

  return {
    thread_id: threadId,
    summary,
    entries: threadEntries,
    ...(allResponses.length > 1 ? { responses: allResponses } : {}),
    ...(allResponses.length === 1 && singleResponse ? { response: singleResponse } : {}),
    ...(warning ? { warning } : {}),
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Load responses for a single request (per-respondent directory or flat file).
 * Returns an object suitable for spreading into a ThreadEntry.
 */
async function loadResponsesForThread(
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
      const rawResponse = await file.readJSON<unknown>(`${responseDir}/${fileName}`);
      const parsedResponse = ResponseEnvelopeSchema.safeParse(rawResponse);
      if (parsedResponse.success) {
        responses.push(parsedResponse.data);
      } else {
        log("warn", "malformed response envelope in thread", { request_id: requestId, file: fileName });
        responses.push(rawResponse);
      }
    }
    return responses.length > 0 ? { responses } : {};
  }

  // Flat response file (legacy single-recipient)
  try {
    const rawResponse = await file.readJSON<unknown>(`responses/${requestId}.json`);
    const parsedResponse = ResponseEnvelopeSchema.safeParse(rawResponse);
    if (parsedResponse.success) {
      return { response: parsedResponse.data };
    }
    log("warn", "malformed response envelope in thread", { request_id: requestId });
    return { response: rawResponse };
  } catch {
    // No response file exists -- that's fine (pending/cancelled requests)
    return {};
  }
}
