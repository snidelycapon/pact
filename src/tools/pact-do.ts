/**
 * pact_do tool handler -- collapsed action dispatch surface.
 *
 * Thin wrapper that extracts the `action` field from params and
 * delegates to the action dispatcher. All adapter context is passed
 * through unchanged.
 */

import type { GitPort, ConfigPort, FilePort } from "../ports.ts";
import { dispatchAction } from "../action-dispatcher.ts";

export interface PactDoContext {
  userId: string;
  repoPath: string;
  git: GitPort;
  config: ConfigPort;
  file: FilePort;
}

export async function handlePactDo(
  params: Record<string, unknown>,
  ctx: PactDoContext,
): Promise<unknown> {
  return dispatchAction(params, ctx);
}
