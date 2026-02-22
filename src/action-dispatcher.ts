/**
 * Action dispatcher for the collapsed pact tool.
 *
 * Maps action strings to handler functions, validates the action field,
 * and delegates to the matching handler with the full params + context.
 */

import type { GitPort, ConfigPort, FilePort } from "./ports.ts";
import { handlePactRequest } from "./tools/pact-request.ts";
import { handlePactRespond } from "./tools/pact-respond.ts";
import { handlePactCancel } from "./tools/pact-cancel.ts";
import { handlePactAmend } from "./tools/pact-amend.ts";
import { handlePactStatus } from "./tools/pact-status.ts";
import { handlePactInbox } from "./tools/pact-inbox.ts";
import { handlePactThread } from "./tools/pact-thread.ts";

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
  send: handlePactRequest as ActionHandler,
  respond: handlePactRespond as ActionHandler,
  cancel: handlePactCancel as ActionHandler,
  amend: handlePactAmend as ActionHandler,
  check_status: handlePactStatus as ActionHandler,
  inbox: handlePactInbox as ActionHandler,
  view_thread: handlePactThread as ActionHandler,
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
