/**
 * Handler for the subscribe action.
 *
 * Adds an ID to the user's subscription list. Subscriptions control
 * which requests appear in the inbox — any request addressed to a
 * subscribed ID is visible alongside requests addressed to the user directly.
 *
 * Persists the change to ~/.pact.json (or PACT_CONFIG path) so it
 * survives server restarts.
 */

import type { ConfigPort } from "../ports.ts";
import { normalizeId } from "../normalize.ts";

export interface PactSubscribeContext {
  userId: string;
  config: ConfigPort;
}

export interface SubscribeResult {
  subscribed: string;
  subscriptions: string[];
}

export async function handlePactSubscribe(
  params: Record<string, unknown>,
  ctx: PactSubscribeContext,
): Promise<SubscribeResult> {
  const raw = params.recipient;

  if (raw === undefined || raw === null || typeof raw !== "string" || raw === "") {
    throw new Error("Missing required field: recipient (the ID to subscribe to)");
  }

  const id = normalizeId(raw);
  const userConfig = await ctx.config.readUserConfig();
  const current = new Set(userConfig.subscriptions);

  if (!current.has(id)) {
    current.add(id);
    await ctx.config.updateSubscriptions([...current]);
  }

  return {
    subscribed: id,
    subscriptions: [...current],
  };
}
