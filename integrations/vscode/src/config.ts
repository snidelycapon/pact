import * as vscode from "vscode";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";

export interface PactConfig {
  repoPath: string;
  userId: string;
  displayName: string;
  pollInterval: number;
  serverPath: string;
  draftMaxAgeDays: number;
}

const FALLBACK_SERVER_PATH = path.join(os.homedir(), "pact", "dist", "index.js");

/** Set once from extension.ts activate() */
let extensionPath = "";

export function setExtensionPath(extPath: string): void {
  extensionPath = extPath;
}

function resolveBundledServerPath(): string {
  if (extensionPath) {
    const bundled = path.join(extensionPath, "resources", "pact-mcp-server", "index.js");
    if (fs.existsSync(bundled)) return bundled;
  }
  return FALLBACK_SERVER_PATH;
}

export function getConfig(): PactConfig {
  const cfg = vscode.workspace.getConfiguration("pact");
  const userId = cfg.get<string>("userId", "");
  return {
    repoPath: cfg.get<string>("repoPath", ""),
    userId,
    displayName: cfg.get<string>("displayName", "") || userId,
    pollInterval: cfg.get<number>("pollInterval", 300),
    serverPath: cfg.get<string>("serverPath", "") || resolveBundledServerPath(),
    draftMaxAgeDays: cfg.get<number>("draftMaxAgeDays", 7),
  };
}

export function isConfigured(): boolean {
  const cfg = getConfig();
  return cfg.repoPath.length > 0 && cfg.userId.length > 0;
}

export function onConfigChange(cb: () => void): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration("pact")) {
      cb();
    }
  });
}
