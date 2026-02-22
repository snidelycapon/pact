/**
 * Handler for the garp_inbox tool.
 *
 * Pulls latest from remote, scans requests/pending/ for envelopes
 * addressed to the current user, and returns summaries sorted by
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

export interface InboxResult {
  requests: InboxEntry[];
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
  const requests: InboxEntry[] = [];
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
      requests.push({
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

  // 4. Sort by created_at ascending (oldest first)
  requests.sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  return { requests, ...(warning ? { warning } : {}) };
}
