import * as vscode from "vscode";

let outputChannel: vscode.LogOutputChannel | null = null;

function getChannel(): vscode.LogOutputChannel {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel("PACT", { log: true });
  }
  return outputChannel;
}

/**
 * Scoped logger with hierarchical prefixes.
 *
 * Usage:
 *   const log = createLogger("Inbox");
 *   log.info("Refreshing");          // → [PACT:Inbox] Refreshing
 *   const sub = log.child("Poll");
 *   sub.debug("Tick");               // → [PACT:Inbox:Poll] Tick
 */
export interface Logger {
  trace(msg: string, ...args: unknown[]): void;
  debug(msg: string, ...args: unknown[]): void;
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
  /** Show error notification with "Show Output" button. */
  errorNotify(msg: string, ...args: unknown[]): void;
  /** Create a child logger with an appended scope prefix. */
  child(scope: string): Logger;
}

export function createLogger(scope: string): Logger {
  const prefix = `[PACT:${scope}]`;

  return {
    trace(msg, ...args) {
      getChannel().trace(`${prefix} ${msg}`, ...args);
    },
    debug(msg, ...args) {
      getChannel().debug(`${prefix} ${msg}`, ...args);
    },
    info(msg, ...args) {
      getChannel().info(`${prefix} ${msg}`, ...args);
    },
    warn(msg, ...args) {
      getChannel().warn(`${prefix} ${msg}`, ...args);
    },
    error(msg, ...args) {
      getChannel().error(`${prefix} ${msg}`, ...args);
    },
    errorNotify(msg, ...args) {
      getChannel().error(`${prefix} ${msg}`, ...args);
      vscode.window
        .showErrorMessage(`PACT: ${msg}`, "Show Output")
        .then((action) => {
          if (action === "Show Output") getChannel().show();
        });
    },
    child(childScope) {
      return createLogger(`${scope}:${childScope}`);
    },
  };
}

/** Dispose the output channel (call from extension deactivate). */
export function disposeLogger(): void {
  outputChannel?.dispose();
  outputChannel = null;
}
