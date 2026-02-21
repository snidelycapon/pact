/**
 * ConfigPort adapter that reads team configuration from config.json.
 *
 * Reads {repoPath}/config.json, validates it with Zod TeamConfigSchema,
 * and provides team member lookup.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ConfigPort } from "../ports.ts";
import { TeamConfigSchema, type TeamMember } from "../schemas.ts";

export class ConfigAdapter implements ConfigPort {
  private readonly configPath: string;

  constructor(repoPath: string) {
    this.configPath = join(repoPath, "config.json");
  }

  async readTeamMembers(): Promise<TeamMember[]> {
    const raw = await readFile(this.configPath, "utf-8");
    const config = TeamConfigSchema.parse(JSON.parse(raw));
    return config.members;
  }

  async lookupUser(userId: string): Promise<TeamMember | undefined> {
    const members = await this.readTeamMembers();
    return members.find((m) => m.user_id === userId);
  }
}
