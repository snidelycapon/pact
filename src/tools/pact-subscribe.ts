/**
 * Handler for the subscribe action.
 *
 * Adds an ID to the user's subscription list. Subscriptions control
 * which requests appear in the inbox — any request addressed to a
 * subscribed ID is visible alongside requests addressed to the user directly.
 *
 * Persists the change to members/{user_id}.json in the pact repo
 * and commits + pushes so subscriptions are shared and versioned.
 */

import type { ConfigPort } from "../ports.ts";
import { normalizeId } from "../normalize.ts";

export interface PactSubscribeContext {
  userId: string;
  config: ConfigPort;
}

export interface SubscribeResult {
  subscribed?: string;
  subscriptions: string[];
}

export async function handlePactSubscribe(
  params: Record<string, unknown>,
  ctx: PactSubscribeContext,
): Promise<SubscribeResult> {
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

  if (!current.has(id)) {
    current.add(id);
    await ctx.config.updateSubscriptions([...current]);
  }

  return {
    subscribed: id,
    subscriptions: [...current],
  };
}
