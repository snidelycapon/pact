/**
 * Shared helper for locating a request by ID in any status directory.
 *
 * Searches pending, active, completed, and cancelled directories.
 * Returns wherever the request is found — no status-based rejection.
 * Used by cancel, amend, edit, and respond handlers.
 */

import type { FilePort } from "../ports.ts";
import { RequestEnvelopeSchema } from "../schemas.ts";
import type { RequestEnvelope } from "../schemas.ts";

/** Status directories in search order. */
const STATUS_DIRS = [
  { dir: "requests/pending", status: "pending" },
  { dir: "requests/active", status: "active" },
  { dir: "requests/completed", status: "completed" },
  { dir: "requests/cancelled", status: "cancelled" },
] as const;

export type RequestStatus = (typeof STATUS_DIRS)[number]["status"];

export interface FindRequestResult {
  envelope: RequestEnvelope;
  path: string;
  dir: string;
  status: RequestStatus;
}

/**
 * Locate a request in any status directory and return its parsed envelope.
 *
 * Throws only when the request is genuinely not found or malformed.
 * Does NOT reject based on current status — that's the agent's concern.
 */
export async function findRequest(
  requestId: string,
  file: FilePort,
): Promise<FindRequestResult> {
  const filename = `${requestId}.json`;

  for (const { dir, status } of STATUS_DIRS) {
    let files: string[];
    try {
      files = await file.listDirectory(dir);
    } catch {
      continue; // directory doesn't exist yet
    }

    if (!files.includes(filename)) continue;

    const path = `${dir}/${filename}`;
    const raw = await file.readJSON<unknown>(path);
    const parsed = RequestEnvelopeSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(
        `Malformed request envelope for ${requestId}: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
      );
    }

    return { envelope: parsed.data, path, dir, status };
  }

  throw new Error(`Request ${requestId} not found`);
}
