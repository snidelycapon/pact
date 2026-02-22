/**
 * Shared helper for locating a pending request by ID.
 *
 * Used by garp_amend and garp_cancel which both need the same
 * "find in pending, or produce a specific error if the request
 * is in completed/cancelled" logic.
 */

import type { FilePort } from "../ports.ts";
import { RequestEnvelopeSchema } from "../schemas.ts";
import type { RequestEnvelope } from "../schemas.ts";

export interface FindPendingResult {
  envelope: RequestEnvelope;
  pendingPath: string;
}

/**
 * Locate a request in pending/ and return its parsed envelope.
 *
 * Throws with a descriptive message if the request is not pending:
 * - "already completed and cannot be {action}" if in completed/
 * - "already cancelled and cannot be {action}" if in cancelled/
 * - "not found" if absent from all directories
 * - "Malformed request envelope" if the JSON fails schema validation
 */
export async function findPendingRequest(
  requestId: string,
  file: FilePort,
  action: string,
): Promise<FindPendingResult> {
  const filename = `${requestId}.json`;
  const pendingPath = `requests/pending/${filename}`;

  const pendingFiles = await file.listDirectory("requests/pending");
  if (!pendingFiles.includes(filename)) {
    const completedFiles = await file.listDirectory("requests/completed");
    if (completedFiles.includes(filename)) {
      throw new Error(`Request ${requestId} is already completed and cannot be ${action}`);
    }

    const cancelledFiles = await file.listDirectory("requests/cancelled");
    if (cancelledFiles.includes(filename)) {
      throw new Error(`Request ${requestId} is already cancelled and cannot be ${action}`);
    }

    throw new Error(`Request ${requestId} not found`);
  }

  const raw = await file.readJSON<unknown>(pendingPath);
  const parsed = RequestEnvelopeSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `Malformed request envelope for ${requestId}: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
    );
  }

  return { envelope: parsed.data, pendingPath };
}
