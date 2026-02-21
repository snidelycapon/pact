/**
 * GitPort adapter using simple-git.
 *
 * All paths are relative to repoPath. Push includes a single retry:
 * if push fails, pull --rebase and push again.
 */

import simpleGit, { type SimpleGit } from "simple-git";
import type { GitPort } from "../ports.ts";
import { log } from "../logger.ts";

export class GitAdapter implements GitPort {
  private readonly git: SimpleGit;

  constructor(repoPath: string) {
    this.git = simpleGit(repoPath);
  }

  async pull(): Promise<void> {
    const start = Date.now();
    await this.git.pull(["--rebase"]);
    log("debug", "git pull", { operation: "pull", duration_ms: Date.now() - start });
  }

  async add(files: string[]): Promise<void> {
    await this.git.add(files);
  }

  async commit(message: string): Promise<void> {
    await this.git.commit(message);
  }

  async push(): Promise<void> {
    const start = Date.now();
    try {
      await this.git.push();
      log("debug", "git push", { operation: "push", duration_ms: Date.now() - start });
    } catch {
      // Retry once: pull --rebase, then push again
      log("warn", "git push conflict, retrying with pull-rebase", { operation: "push", retry_count: 1 });
      await this.git.pull(["--rebase"]);
      await this.git.push();
      log("debug", "git push retry succeeded", { operation: "push", duration_ms: Date.now() - start });
    }
  }

  async mv(from: string, to: string): Promise<void> {
    await this.git.mv(from, to);
  }

  async log(): Promise<string[]> {
    const result = await this.git.log();
    return result.all.map((entry) => entry.message);
  }
}
