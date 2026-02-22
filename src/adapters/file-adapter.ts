/**
 * FilePort adapter for JSON file I/O and directory operations.
 *
 * All paths are relative to repoPath. Parent directories are created
 * automatically when writing. Directory listings exclude .gitkeep files.
 */

import { readFile, writeFile, readdir, rename, mkdir, access } from "node:fs/promises";
import { join, dirname } from "node:path";
import type { FilePort } from "../ports.ts";

export class FileAdapter implements FilePort {
  private readonly repoPath: string;

  constructor(repoPath: string) {
    this.repoPath = repoPath;
  }

  async readJSON<T>(path: string): Promise<T> {
    const fullPath = join(this.repoPath, path);
    const raw = await readFile(fullPath, "utf-8");
    return JSON.parse(raw) as T;
  }

  async writeJSON(path: string, data: unknown): Promise<void> {
    const fullPath = join(this.repoPath, path);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, JSON.stringify(data, null, 2), "utf-8");
  }

  async writeText(path: string, content: string): Promise<void> {
    const fullPath = join(this.repoPath, path);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, content, "utf-8");
  }

  async listDirectory(path: string): Promise<string[]> {
    const fullPath = join(this.repoPath, path);
    const entries = await readdir(fullPath);
    return entries.filter((name) => name !== ".gitkeep");
  }

  async readText(path: string): Promise<string> {
    const fullPath = join(this.repoPath, path);
    return readFile(fullPath, "utf-8");
  }

  async fileExists(path: string): Promise<boolean> {
    const fullPath = join(this.repoPath, path);
    try {
      await access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  async moveFile(from: string, to: string): Promise<void> {
    const fromPath = join(this.repoPath, from);
    const toPath = join(this.repoPath, to);
    await mkdir(dirname(toPath), { recursive: true });
    await rename(fromPath, toPath);
  }
}
