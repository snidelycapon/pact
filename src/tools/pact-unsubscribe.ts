/**
 * Handler for the unsubscribe action.
 *
 * Removes an ID from the user's subscription list. If the ID is not
 * currently subscribed, this is a no-op (idempotent).
 *
 * Persists the change to members/{user_id}.json in the pact repo
 * and commits + pushes so subscriptions are shared and versioned.
 */

import type { ConfigPort } from "../ports.ts";
import { normalizeId } from "../normalize.ts";

export interface PactUnsubscribeContext {
  userId: string;
  config: ConfigPort;
}

export interface UnsubscribeResult {
  unsubscribed?: string;
  subscriptions: string[];
}

export async function handlePactUnsubscribe(
  params: Record<string, unknown>,
  ctx: PactUnsubscribeContext,
): Promise<UnsubscribeResult> {
  const raw = params.recipient;
  const userConfig = await ctx.config.readUserConfig();
  const current = new Set(userConfig.subscriptions);

  // No recipient → list current subscriptions
  if (raw === undefined || raw === null || raw === "") {
    return { subscriptions: [...current] };
  }

  if (typeof raw !== "string") {
    throw new Error("recipient must be a string");
  }

  const id = normalizeId(raw);

  if (current.has(id)) {
    current.delete(id);
    await ctx.config.updateSubscriptions([...current]);
  }

  return {
    unsubscribed: id,
    subscriptions: [...current],
  };
}
