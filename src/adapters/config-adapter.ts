/**
 * ConfigPort adapter that holds pre-loaded user configuration.
 *
 * Config is read once at startup (index.ts) and passed in.
 * No file I/O at runtime — config is static for the process lifetime.
 */

import type { ConfigPort } from "../ports.ts";
import type { UserConfig } from "../schemas.ts";

export class ConfigAdapter implements ConfigPort {
  private readonly userConfig: UserConfig;

  constructor(userConfig: UserConfig) {
    this.userConfig = userConfig;
  }

  async readUserConfig(): Promise<UserConfig> {
    return this.userConfig;
  }
}
