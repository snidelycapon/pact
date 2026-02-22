/**
 * Structured JSON logger for PACT.
 *
 * Writes to stderr (stdout is reserved for MCP JSON-RPC).
 * Respects PACT_LOG_LEVEL env var (debug, info, warn, error; default: info).
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export function log(
  level: LogLevel,
  msg: string,
  fields?: Record<string, unknown>,
): void {
  const env = process.env.PACT_LOG_LEVEL;
  const currentLevel: LogLevel = env && env in LOG_LEVEL_PRIORITY ? (env as LogLevel) : "info";
  if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[currentLevel]) return;

  const entry = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...fields,
  };

  process.stderr.write(JSON.stringify(entry) + "\n");
}
