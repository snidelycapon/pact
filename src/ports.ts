/**
 * Driven port interfaces for PACT.
 *
 * These define the infrastructure boundaries the application logic
 * depends on. Adapters implement these interfaces. Test doubles
 * replace them at the port boundary.
 *
 * All methods are async -- infrastructure operations are inherently
 * asynchronous (git, file I/O, config reads).
 */

import type { UserConfig } from "./schemas.ts";

// ---------------------------------------------------------------------------
// GitPort -- wraps git operations on the local repo clone
// ---------------------------------------------------------------------------

export interface GitPort {
  pull(): Promise<void>;
  add(files: string[]): Promise<void>;
  commit(message: string): Promise<void>;
  push(): Promise<void>;
  mv(from: string, to: string): Promise<void>;
  log(): Promise<string[]>;
}

// ---------------------------------------------------------------------------
// ConfigPort -- reads local user configuration (~/.pact.json)
// ---------------------------------------------------------------------------

export interface ConfigPort {
  readUserConfig(): Promise<UserConfig>;
  updateSubscriptions(subscriptions: string[]): Promise<void>;
}

// ---------------------------------------------------------------------------
// FilePort -- reads/writes JSON files and manages directories
// ---------------------------------------------------------------------------

export interface FilePort {
  readJSON<T>(path: string): Promise<T>;
  writeJSON(path: string, data: unknown): Promise<void>;
  readText(path: string): Promise<string>;
  writeText(path: string, content: string): Promise<void>;
  listDirectory(path: string): Promise<string[]>;
  fileExists(path: string): Promise<boolean>;
  moveFile(from: string, to: string): Promise<void>;
}
