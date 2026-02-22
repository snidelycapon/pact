/**
 * Request ID generator for PACT.
 *
 * Format: req-{YYYYMMDD}-{HHmmss}-{user_id}-{random4hex}
 *
 * The date prefix enables chronological sorting and human readability.
 * The user_id segment prevents cross-client collisions at the same second.
 * The 4-hex random suffix handles same-user-same-second edge cases.
 */

import { randomBytes } from "node:crypto";

export function generateRequestId(userId: string): string {
  const now = new Date();

  const date = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, "0"),
    String(now.getUTCDate()).padStart(2, "0"),
  ].join("");

  const time = [
    String(now.getUTCHours()).padStart(2, "0"),
    String(now.getUTCMinutes()).padStart(2, "0"),
    String(now.getUTCSeconds()).padStart(2, "0"),
  ].join("");

  const hex = randomBytes(2).toString("hex");

  return `req-${date}-${time}-${userId}-${hex}`;
}
