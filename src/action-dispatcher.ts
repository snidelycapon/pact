/**
 * Action dispatcher for the collapsed garp tool.
 *
 * Maps action strings to handler functions, validates the action field,
 * and delegates to the matching handler with the full params + context.
 */

import type { GitPort, ConfigPort, FilePort } from "./ports.ts";
import { handleGarpRequest } from "./tools/garp-request.ts";
import { handleGarpRespond } from "./tools/garp-respond.ts";
import { handleGarpCancel } from "./tools/garp-cancel.ts";
import { handleGarpAmend } from "./tools/garp-amend.ts";
import { handleGarpStatus } from "./tools/garp-status.ts";
import { handleGarpInbox } from "./tools/garp-inbox.ts";
import { handleGarpThread } from "./tools/garp-thread.ts";

export interface DispatchContext {
  userId: string;
  repoPath: string;
  git: GitPort;
  config: ConfigPort;
  file: FilePort;
}

type ActionHandler = (
  params: Record<string, unknown>,
  ctx: DispatchContext,
) => Promise<unknown>;

const ACTION_MAP: Record<string, ActionHandler> = {
  send: handleGarpRequest as ActionHandler,
  respond: handleGarpRespond as ActionHandler,
  cancel: handleGarpCancel as ActionHandler,
  amend: handleGarpAmend as ActionHandler,
  check_status: handleGarpStatus as ActionHandler,
  inbox: handleGarpInbox as ActionHandler,
  view_thread: handleGarpThread as ActionHandler,
};

const VALID_ACTIONS = Object.keys(ACTION_MAP);

export async function dispatchAction(
  params: Record<string, unknown>,
  ctx: DispatchContext,
): Promise<unknown> {
  const action = params.action;

  if (action === undefined || action === null) {
    throw new Error(
      "Missing required field: action. " +
        `Valid actions: ${VALID_ACTIONS.join(", ")}`,
    );
  }

  if (typeof action !== "string" || action === "") {
    throw new Error(
      "Invalid action: must be a non-empty string. " +
        `Valid actions: ${VALID_ACTIONS.join(", ")}`,
    );
  }

  const handler = ACTION_MAP[action];
  if (!handler) {
    throw new Error(
      `Unknown action '${action}'. ` +
        `Valid actions: ${VALID_ACTIONS.join(", ")}`,
    );
  }

  return handler(params, ctx);
}
