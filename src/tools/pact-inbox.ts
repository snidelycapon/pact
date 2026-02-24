/**
 * Handler for the pact_inbox tool.
 *
 * Pulls latest from remote, scans requests/pending/ for envelopes
 * addressed to the current user, groups by thread_id when multiple
 * pending requests share a thread, and returns summaries sorted by
 * created_at ascending. Falls back to local data with a warning
 * when the remote is unreachable.
 */

import type { GitPort, FilePort } from "../ports.ts";
import { RequestEnvelopeSchema } from "../schemas.ts";
import { loadPactMetadata } from "../pact-loader.ts";
import type { PactMetadata } from "../pact-loader.ts";
import { log } from "../logger.ts";

export interface PactInboxContext {
  userId: string;
  repoPath: string;
  git: GitPort;
  file: FilePort;
}

export interface InboxEntry {
  request_id: string;
  short_id: string;
  thread_id?: string;
  request_type: string;
  sender: string;
  created_at: string;
  summary: string;
  pact_path: string;
  attachment_count: number;
  amendment_count: number;
  attachments?: Array<{ filename: string; description: string }>;
  pact_description?: string;
  response_fields?: string[];
}

export interface InboxThreadGroup {
  is_thread_group: true;
  thread_id: string;
  request_type: string;
  sender: string;
  round_count: number;
  latest_request_id: string;
  latest_short_id: string;
  latest_summary: string;
  created_at: string;
  request_ids: string[];
  pact_path: string;
  attachment_count: number;
  amendment_count: number;
  pact_description?: string;
  response_fields?: string[];
}

export interface InboxResult {
  requests: Array<InboxEntry | InboxThreadGroup>;
  warning?: string;
}

export async function handlePactInbox(
  _params: Record<string, unknown>,
  ctx: PactInboxContext,
): Promise<InboxResult> {
  let warning: string | undefined;

  // 1. Pull latest (catch failure, set warning)
  try {
    await ctx.git.pull();
  } catch {
    warning = "Using local data (remote unreachable). Results may be stale.";
  }

  // 2. List pending directory
  const files = await ctx.file.listDirectory("requests/pending");

  // 3. Parse each through schema, filter by recipient == userId
  const entries: InboxEntry[] = [];
  for (const file of files) {
    const raw = await ctx.file.readJSON<unknown>(`requests/pending/${file}`);
    const parsed = RequestEnvelopeSchema.safeParse(raw);
    if (!parsed.success) {
      log("warn", "skipping malformed envelope", { file, errors: parsed.error.issues });
      continue;
    }
    const envelope = parsed.data;
    const isRecipient =
      envelope.recipient?.user_id === ctx.userId ||
      envelope.recipients?.some((r) => r.user_id === ctx.userId);
    if (isRecipient) {
      const bundle = envelope.context_bundle as Record<string, unknown>;
      const parts = envelope.request_id.split("-");
      const shortId = parts.slice(-2).join("-");
      entries.push({
        request_id: envelope.request_id,
        short_id: shortId,
        ...(envelope.thread_id ? { thread_id: envelope.thread_id } : {}),
        request_type: envelope.request_type,
        sender: envelope.sender.display_name,
        created_at: envelope.created_at,
        summary:
          (bundle.question as string) ??
          (bundle.issue_summary as string) ??
          "No summary",
        pact_path: `${ctx.repoPath}/pacts/${envelope.request_type}/PACT.md`,
        attachment_count: envelope.attachments?.length ?? 0,
        amendment_count: envelope.amendments?.length ?? 0,
        ...(envelope.attachments && envelope.attachments.length > 0
          ? { attachments: envelope.attachments.map(a => ({ filename: a.filename, description: a.description })) }
          : {}),
      });
    }
  }

  // 4. Enrich entries with pact metadata (cached per request_type)
  const pactCache = new Map<string, PactMetadata | null>();
  for (const entry of entries) {
    if (!pactCache.has(entry.request_type)) {
      try {
        const metadata = await loadPactMetadata(ctx.file, entry.request_type);
        pactCache.set(entry.request_type, metadata ?? null);
      } catch {
        pactCache.set(entry.request_type, null);
      }
    }
    const cached = pactCache.get(entry.request_type);
    if (cached) {
      entry.pact_description = cached.description;
      entry.response_fields = cached.response_bundle.fields
        ? Object.keys(cached.response_bundle.fields)
        : [];
    }
  }

  // 5-6. Group by thread_id and sort by created_at
  const requests = groupByThread(entries);

  return { requests, ...(warning ? { warning } : {}) };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Group inbox entries by thread_id, collapsing multi-round threads into
 * InboxThreadGroup items. Returns the result sorted by created_at ascending.
 */
function groupByThread(
  entries: InboxEntry[],
): Array<InboxEntry | InboxThreadGroup> {
  const threadGroups = new Map<string, InboxEntry[]>();
  for (const entry of entries) {
    const key = entry.thread_id ?? entry.request_id;
    const group = threadGroups.get(key);
    if (group) {
      group.push(entry);
    } else {
      threadGroups.set(key, [entry]);
    }
  }

  const requests: Array<InboxEntry | InboxThreadGroup> = [];
  for (const [key, group] of threadGroups) {
    if (group.length === 1) {
      requests.push(group[0]);
    } else {
      group.sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
      const latest = group[group.length - 1];
      const threadGroup: InboxThreadGroup = {
        is_thread_group: true,
        thread_id: key,
        request_type: latest.request_type,
        sender: latest.sender,
        round_count: group.length,
        latest_request_id: latest.request_id,
        latest_short_id: latest.short_id,
        latest_summary: latest.summary,
        created_at: latest.created_at,
        request_ids: group.map((e) => e.request_id),
        pact_path: latest.pact_path,
        attachment_count: group.reduce((sum, e) => sum + e.attachment_count, 0),
        amendment_count: group.reduce((sum, e) => sum + e.amendment_count, 0),
      };
      if (latest.pact_description) {
        threadGroup.pact_description = latest.pact_description;
      }
      if (latest.response_fields) {
        threadGroup.response_fields = latest.response_fields;
      }
      requests.push(threadGroup);
    }
  }

  // Sort all items by created_at ascending (oldest first)
  requests.sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  return requests;
}
