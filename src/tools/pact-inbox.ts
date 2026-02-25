/**
 * Handler for the pact_inbox tool.
 *
 * Pulls latest from remote, scans requests/pending/ for envelopes
 * addressed to the current user or any of their subscriptions,
 * groups by thread_id when multiple pending requests share a thread,
 * and returns summaries sorted by created_at ascending.
 * Falls back to local data with a warning when the remote is unreachable.
 */

import type { GitPort, ConfigPort, FilePort } from "../ports.ts";
import { RequestEnvelopeSchema } from "../schemas.ts";
import { loadFlatFilePactByName, loadPactMetadata } from "../pact-loader.ts";
import type { PactMetadata } from "../pact-loader.ts";
import { log } from "../logger.ts";
import { normalizeId } from "../normalize.ts";

export interface PactInboxContext {
  userId: string;
  repoPath: string;
  git: GitPort;
  config: ConfigPort;
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
  recipients_count?: number;
  group_ref?: string;
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

  // 2. Build the set of inbox names to match against
  //    Always includes user_id, plus any subscriptions from local config
  const userConfig = await ctx.config.readUserConfig();
  const inboxNames = new Set<string>([ctx.userId, ...userConfig.subscriptions]);

  // 3. List pending directory
  const files = await ctx.file.listDirectory("requests/pending");

  // 4. Parse each through schema, filter by recipient matching any inbox name
  const entries: InboxEntry[] = [];
  for (const fileName of files) {
    const raw = await ctx.file.readJSON<unknown>(`requests/pending/${fileName}`);
    const parsed = RequestEnvelopeSchema.safeParse(raw);
    if (!parsed.success) {
      log("warn", "skipping malformed envelope", { file: fileName, errors: parsed.error.issues });
      continue;
    }
    const envelope = parsed.data;

    // Check if any recipient matches any of our inbox names
    const recipientIds: string[] = [];
    if (envelope.recipient?.user_id) {
      recipientIds.push(normalizeId(envelope.recipient.user_id));
    }
    if (envelope.recipients) {
      for (const r of envelope.recipients) {
        recipientIds.push(normalizeId(r.user_id));
      }
    }
    const isForMe = recipientIds.some((id) => inboxNames.has(id));

    if (isForMe) {
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
        pact_path: `${ctx.repoPath}/pact-store/${envelope.request_type}.md`,
        attachment_count: envelope.attachments?.length ?? 0,
        amendment_count: envelope.amendments?.length ?? 0,
        ...(envelope.attachments && envelope.attachments.length > 0
          ? { attachments: envelope.attachments.map(att => ({ filename: att.filename, description: att.description })) }
          : {}),
        ...(envelope.recipients && envelope.recipients.length > 0
          ? { recipients_count: envelope.recipients.length }
          : {}),
        ...(envelope.group_ref ? { group_ref: envelope.group_ref } : {}),
      });
    }
  }

  // 5. Enrich entries with pact metadata (cached per request_type)
  //    Try flat-file pact-store/ first, fall back to legacy pacts/ directory
  const pactCache = new Map<string, PactMetadata | null>();
  for (const entry of entries) {
    if (!pactCache.has(entry.request_type)) {
      try {
        const metadata =
          await loadFlatFilePactByName(ctx.file, entry.request_type) ??
          await loadPactMetadata(ctx.file, entry.request_type);
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

  // 6-7. Group by thread_id and sort by created_at
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
