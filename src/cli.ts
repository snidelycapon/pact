/**
 * PACT CLI entry point.
 *
 * Lightweight CLI for headless MCP server users who want inbox
 * notifications and background git sync without an editor extension.
 *
 * Commands:
 *   pact inbox                      Show pending inbox items
 *   pact poll                       One-shot poll (same as inbox)
 *   pact poll --watch               Watch mode (continuous polling)
 *   pact poll --watch --interval N  Poll every N seconds (default: 60)
 *   pact poll --notify              Desktop notifications for new items
 *
 * Configuration (in priority order):
 *   1. Environment variables: PACT_REPO, PACT_USER, PACT_DISPLAY_NAME
 *   2. Config file: ~/.pact.json
 *
 * Usage: PACT_REPO=/path/to/repo PACT_USER=alice pact inbox
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { execSync } from "node:child_process";
import { FileAdapter } from "./adapters/file-adapter.ts";
import { GitAdapter } from "./adapters/git-adapter.ts";
import { ConfigAdapter } from "./adapters/config-adapter.ts";
import { PactPoller } from "./poller.ts";
import type { PollDiff } from "./poller.ts";
import { normalizeId } from "./normalize.ts";
import type {
  InboxEntry,
  InboxThreadGroup,
} from "./tools/pact-inbox.ts";

// ---------------------------------------------------------------------------
// Config resolution
// ---------------------------------------------------------------------------

interface CliConfig {
  repoPath: string;
  userId: string;
  displayName: string;
  pollInterval: number;
}

function resolveConfig(): CliConfig {
  let repoPath = process.env.PACT_REPO;
  let userId = process.env.PACT_USER;
  let displayName = process.env.PACT_DISPLAY_NAME;
  let pollInterval = 60;

  // Fall back to ~/.pact.json
  if (!repoPath || !userId) {
    const configPath = join(homedir(), ".pact.json");
    if (existsSync(configPath)) {
      try {
        const raw = JSON.parse(readFileSync(configPath, "utf-8"));
        repoPath = repoPath || raw.repo;
        userId = userId || raw.user;
        displayName = displayName || raw.display_name;
        if (typeof raw.poll_interval === "number") {
          pollInterval = raw.poll_interval;
        }
      } catch {
        // Ignore malformed config
      }
    }
  }

  if (!repoPath) {
    console.error("Error: No pact repo configured.");
    console.error(
      'Set PACT_REPO env var or create ~/.pact.json with { "repo": "..." }',
    );
    process.exit(1);
  }

  if (!userId) {
    console.error("Error: No user configured.");
    console.error(
      'Set PACT_USER env var or create ~/.pact.json with { "user": "..." }',
    );
    process.exit(1);
  }

  if (!existsSync(join(repoPath, ".git"))) {
    console.error(`Error: '${repoPath}' is not a git repository`);
    process.exit(1);
  }

  return {
    repoPath,
    userId: normalizeId(userId),
    displayName: displayName || userId,
    pollInterval,
  };
}

// ---------------------------------------------------------------------------
// Output formatting
// ---------------------------------------------------------------------------

function formatEntry(entry: InboxEntry | InboxThreadGroup): string {
  if ("is_thread_group" in entry) {
    return `  ${entry.request_type} from ${entry.sender} [${entry.latest_short_id}] (${entry.round_count} rounds)\n    "${entry.latest_summary}"`;
  }
  return `  ${entry.request_type} from ${entry.sender} [${entry.short_id}]\n    "${entry.summary}"`;
}

function formatTime(): string {
  return new Date().toLocaleTimeString("en-US", { hour12: false });
}

// ---------------------------------------------------------------------------
// Desktop notifications
// ---------------------------------------------------------------------------

function sendNotification(title: string, body: string): void {
  try {
    if (process.platform === "darwin") {
      const escaped = body.replace(/"/g, '\\"');
      execSync(
        `osascript -e 'display notification "${escaped}" with title "${title}"'`,
      );
    } else if (process.platform === "linux") {
      execSync(`notify-send "${title}" "${body}"`);
    }
  } catch {
    // Silent — notifications are best-effort
  }
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function createPoller(config: CliConfig): PactPoller {
  const file = new FileAdapter(config.repoPath);
  const git = new GitAdapter(config.repoPath);
  const configAdapter = new ConfigAdapter(
    config.userId,
    config.displayName,
    file,
    git,
  );

  return new PactPoller({
    userId: config.userId,
    repoPath: config.repoPath,
    git,
    config: configAdapter,
    file,
  });
}

async function cmdInbox(config: CliConfig): Promise<void> {
  const poller = createPoller(config);
  const { current } = await poller.poll();

  if (current.requests.length === 0) {
    console.log("[PACT] No pending requests");
    return;
  }

  console.log(
    `[PACT] ${current.requests.length} pending request${current.requests.length === 1 ? "" : "s"}`,
  );
  for (const entry of current.requests) {
    console.log(formatEntry(entry));
  }

  if (current.warning) {
    console.error(`  Warning: ${current.warning}`);
  }
}

async function cmdPoll(
  config: CliConfig,
  watch: boolean,
  interval: number | undefined,
  notify: boolean,
): Promise<void> {
  if (!watch) {
    return cmdInbox(config);
  }

  const intervalMs = (interval ?? config.pollInterval) * 1000;
  const poller = createPoller(config);

  console.log(
    `[PACT] Watching for changes every ${intervalMs / 1000}s (Ctrl+C to stop)`,
  );

  const onPoll = (diff: PollDiff) => {
    if (diff.isFirstPoll) {
      const count = diff.current.requests.length;
      console.log(
        `[${formatTime()}] ${count} pending request${count === 1 ? "" : "s"}`,
      );
      for (const entry of diff.current.requests) {
        console.log(formatEntry(entry));
      }
      return;
    }

    if (diff.newEntries.length === 0 && diff.removedIds.length === 0) {
      console.log(
        `[${formatTime()}] ${diff.current.requests.length} pending, no changes`,
      );
      return;
    }

    if (diff.newEntries.length > 0) {
      console.log(
        `[${formatTime()}] ${diff.newEntries.length} new request${diff.newEntries.length === 1 ? "" : "s"}`,
      );
      for (const entry of diff.newEntries) {
        console.log(formatEntry(entry));
      }

      if (notify && diff.newEntries.length > 0) {
        const count = diff.newEntries.length;
        const first = diff.newEntries[0]!;
        const summary =
          "is_thread_group" in first ? first.latest_summary : first.summary;
        sendNotification(
          `PACT: ${count} new request${count === 1 ? "" : "s"}`,
          count === 1 ? summary : `${summary} and ${count - 1} more`,
        );
      }
    }

    if (diff.removedIds.length > 0) {
      console.log(
        `[${formatTime()}] ${diff.removedIds.length} request${diff.removedIds.length === 1 ? "" : "s"} resolved`,
      );
    }

    if (diff.current.warning) {
      console.error(`  Warning: ${diff.current.warning}`);
    }
  };

  const onError = (err: Error) => {
    console.error(`[${formatTime()}] Error: ${err.message}`);
  };

  poller.start(intervalMs, onPoll, onError);

  process.on("SIGINT", () => {
    console.log("\n[PACT] Stopped");
    poller.stop();
    process.exit(0);
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function printUsage(): void {
  console.log(`pact — CLI for the Protocol for Agent Context Transfer

Usage: pact <command> [options]

Commands:
  inbox                     Show pending inbox items
  poll                      One-shot poll (same as inbox)
  poll --watch              Watch mode (continuous polling)
  poll --watch --interval N Poll every N seconds (default: 60)
  poll --notify             Send desktop notifications for new requests

Configuration:
  Set PACT_REPO and PACT_USER environment variables, or create ~/.pact.json:

  {
    "repo": "/path/to/pact-repo",
    "user": "your-user-id",
    "display_name": "Your Name",
    "poll_interval": 60
  }`);
}

const args = process.argv.slice(2);
const command = args[0];

if (!command || command === "--help" || command === "-h") {
  printUsage();
  process.exit(0);
}

const config = resolveConfig();

switch (command) {
  case "inbox":
    await cmdInbox(config);
    break;

  case "poll": {
    const watch = args.includes("--watch");
    const notify = args.includes("--notify");
    const intervalIdx = args.indexOf("--interval");
    const intervalArg = intervalIdx !== -1 ? args[intervalIdx + 1] : undefined;
    const interval = intervalArg !== undefined ? parseInt(intervalArg, 10) : undefined;
    if (interval !== undefined && (isNaN(interval) || interval < 1)) {
      console.error("Error: --interval must be a positive integer (seconds)");
      process.exit(1);
    }
    await cmdPoll(config, watch, interval, notify);
    break;
  }

  default:
    console.error(`Unknown command: ${command}`);
    printUsage();
    process.exit(1);
}
