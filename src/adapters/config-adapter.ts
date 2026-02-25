/**
 * ConfigPort adapter that holds user configuration.
 *
 * Config is read once at startup (index.ts) and passed in.
 * Subscriptions can be updated at runtime via updateSubscriptions(),
 * which updates both in-memory state and the config file on disk.
 */

import { writeFile } from "node:fs/promises";
import type { ConfigPort } from "../ports.ts";
import type { UserConfig } from "../schemas.ts";

export class ConfigAdapter implements ConfigPort {
  private userConfig: UserConfig;
  private readonly configPath: string | undefined;

  constructor(userConfig: UserConfig, configPath?: string) {
    this.userConfig = { ...userConfig };
    this.configPath = configPath;
  }

  async readUserConfig(): Promise<UserConfig> {
    return this.userConfig;
  }

  async updateSubscriptions(subscriptions: string[]): Promise<void> {
    this.userConfig = { ...this.userConfig, subscriptions };

    if (this.configPath) {
      const json = JSON.stringify(this.userConfig, null, 2) + "\n";
      await writeFile(this.configPath, json, "utf-8");
    }
  }
}
