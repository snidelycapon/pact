/**
 * Handler for the garp_inbox tool.
 *
 * Pulls latest from remote, scans requests/pending/ for envelopes
 * addressed to the current user, groups by thread_id when multiple
 * pending requests share a thread, and returns summaries sorted by
 * created_at ascending. Falls back to local data with a warning
 * when the remote is unreachable.
 */

import type { GitPort, FilePort } from "../ports.ts";
import { RequestEnvelopeSchema } from "../schemas.ts";
import { log } from "../logger.ts";

export interface GarpInboxContext {
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
  skill_path: string;
  attachment_count: number;
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
  skill_path: string;
  attachment_count: number;
}

export interface InboxResult {
  requests: Array<InboxEntry | InboxThreadGroup>;
  warning?: string;
}

export async function handleGarpInbox(
  _params: Record<string, unknown>,
  ctx: GarpInboxContext,
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
    if (envelope.recipient.user_id === ctx.userId) {
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
        skill_path: `${ctx.repoPath}/skills/${envelope.request_type}/SKILL.md`,
        attachment_count: envelope.attachments?.length ?? 0,
      });
    }
  }

  // 4. Group by thread_id
  const threadGroups = new Map<string, InboxEntry[]>();
  for (const entry of entries) {
    // Use thread_id as key, or request_id for entries without thread_id (always standalone)
    const key = entry.thread_id ?? entry.request_id;
    const group = threadGroups.get(key);
    if (group) {
      group.push(entry);
    } else {
      threadGroups.set(key, [entry]);
    }
  }

  // 5. Emit standalone or grouped items
  const requests: Array<InboxEntry | InboxThreadGroup> = [];
  for (const [key, group] of threadGroups) {
    if (group.length === 1) {
      // Standalone: single pending entry in this thread (or no thread_id)
      requests.push(group[0]);
    } else {
      // Thread group: 2+ pending entries share a thread_id
      // Sort group by created_at ascending to find latest
      group.sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
      const latest = group[group.length - 1];
      requests.push({
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
        skill_path: latest.skill_path,
        attachment_count: group.reduce((sum, e) => sum + e.attachment_count, 0),
      });
    }
  }

  // 6. Sort all items by created_at ascending (oldest first)
  requests.sort(
    (a, b) => {
      const aTime = new Date(a.created_at).getTime();
      const bTime = new Date(b.created_at).getTime();
      return aTime - bTime;
    },
  );

  return { requests, ...(warning ? { warning } : {}) };
}
