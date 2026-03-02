/**
 * ConfigPort adapter that manages user identity and subscriptions.
 *
 * Identity (user_id, display_name) comes from environment variables
 * and is immutable at runtime.
 *
 * Subscriptions are stored in the pact repo at members/{user_id}.json.
 * This makes them visible to the team, versioned in git, and eliminates
 * the need for a platform-specific dotfile (~/.pact.json).
 *
 * On first read, loads subscriptions from disk. Updates write back to
 * the repo file and commit + push via git.
 */

import { join } from "node:path";
import type { ConfigPort } from "../ports.ts";
import type { GitPort, FilePort } from "../ports.ts";
import type { UserConfig } from "../schemas.ts";

export class ConfigAdapter implements ConfigPort {
  private readonly userId: string;
  private readonly displayName: string;
  private readonly file: FilePort;
  private readonly git: GitPort;
  private subscriptions: string[];
  private loaded = false;

  constructor(
    userId: string,
    displayName: string,
    file: FilePort,
    git: GitPort,
  ) {
    this.userId = userId;
    this.displayName = displayName;
    this.file = file;
    this.git = git;
    this.subscriptions = [];
  }

  /** Repo-relative path to this user's member file. */
  private get memberPath(): string {
    return join("members", `${this.userId}.json`);
  }

  /**
   * Load subscriptions from repo on first access.
   * If the member file doesn't exist yet, starts with empty subscriptions.
   */
  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;

    // FilePort methods take repo-relative paths (FileAdapter prepends repoPath)
    if (await this.file.fileExists(this.memberPath)) {
      try {
        const data = await this.file.readJSON<{ subscriptions?: string[] }>(this.memberPath);
        this.subscriptions = Array.isArray(data.subscriptions) ? data.subscriptions : [];
      } catch {
        // Malformed file — start fresh
        this.subscriptions = [];
      }
    }
  }

  async readUserConfig(): Promise<UserConfig> {
    await this.ensureLoaded();
    return {
      user_id: this.userId,
      display_name: this.displayName,
      subscriptions: this.subscriptions,
    };
  }

  async updateSubscriptions(subscriptions: string[]): Promise<void> {
    await this.ensureLoaded();
    this.subscriptions = subscriptions;

    // Write member file to repo
    const data = {
      user_id: this.userId,
      display_name: this.displayName,
      subscriptions: this.subscriptions,
    };
    await this.file.writeJSON(this.memberPath, data);

    // Commit and push
    await this.git.add([this.memberPath]);
    await this.git.commit(`[pact] ${this.userId} updated subscriptions`);
    await this.git.push();
  }
}
