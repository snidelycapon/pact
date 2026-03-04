import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

export interface ResponseDraft {
  type: "respond";
  requestId: string;
  responseBundle: Record<string, unknown>;
  note?: string;
  filePath: string;
}

export interface SendDraft {
  type: "send";
  requestType: string;
  recipient?: string;
  recipients?: string[];
  subject?: string;
  contextBundle?: Record<string, unknown>;
  deadline?: string;
  note?: string;
  filePath: string;
}

/**
 * Watches {PACT_REPO}/.drafts/ for draft files written by AI agents.
 *
 * When a draft file appears, it is parsed and emitted as a typed event.
 * The extension handles the notification and UI pre-fill.
 *
 * Draft files are consumed once — deleted after being loaded.
 */
export class DraftWatcher implements vscode.Disposable {
  private watcher: vscode.FileSystemWatcher | null = null;
  private draftsDir: string;
  private maxAgeMs: number;

  private readonly _onResponseDraft = new vscode.EventEmitter<ResponseDraft>();
  readonly onResponseDraft = this._onResponseDraft.event;

  private readonly _onSendDraft = new vscode.EventEmitter<SendDraft>();
  readonly onSendDraft = this._onSendDraft.event;

  constructor(repoPath: string, maxAgeDays = 7) {
    this.draftsDir = path.join(repoPath, ".drafts");
    this.maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
  }

  /** Start watching. Creates .drafts/ if needed and processes any existing files. */
  start(): void {
    // Ensure directory exists
    if (!fs.existsSync(this.draftsDir)) {
      fs.mkdirSync(this.draftsDir, { recursive: true });
    }

    // Watch for new/changed .json files
    const pattern = new vscode.RelativePattern(this.draftsDir, "*.json");
    this.watcher = vscode.workspace.createFileSystemWatcher(pattern);

    this.watcher.onDidCreate((uri) => this.processDraftFile(uri.fsPath));
    this.watcher.onDidChange((uri) => this.processDraftFile(uri.fsPath));

    // Process any drafts that arrived while the extension wasn't running
    this.scanExisting();
  }

  /** Update the repo path (e.g. after config change). Restarts the watcher. */
  restart(repoPath: string, maxAgeDays?: number): void {
    this.watcher?.dispose();
    this.watcher = null;
    this.draftsDir = path.join(repoPath, ".drafts");
    if (maxAgeDays !== undefined) {
      this.maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
    }
    this.start();
  }

  dispose(): void {
    this.watcher?.dispose();
    this.watcher = null;
    this._onResponseDraft.dispose();
    this._onSendDraft.dispose();
  }

  /** Remove a draft file after it has been handled. */
  cleanup(filePath: string): void {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch {
      // best-effort cleanup
    }
  }

  private scanExisting(): void {
    try {
      if (!fs.existsSync(this.draftsDir)) return;
      const files = fs.readdirSync(this.draftsDir).filter((f) => f.endsWith(".json"));

      const cutoff = Date.now() - this.maxAgeMs;
      for (const file of files) {
        const filePath = path.join(this.draftsDir, file);
        const stat = fs.statSync(filePath);
        if (stat.mtimeMs >= cutoff) {
          this.processDraftFile(filePath);
        } else {
          // Stale draft — clean up silently
          this.cleanup(filePath);
        }
      }
    } catch {
      // directory may not exist yet
    }
  }

  private processDraftFile(filePath: string): void {
    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      const data = JSON.parse(raw);

      if (data.type === "respond" && data.request_id && data.response_bundle) {
        this._onResponseDraft.fire({
          type: "respond",
          requestId: data.request_id,
          responseBundle: data.response_bundle,
          note: data.note,
          filePath,
        });
      } else if (data.type === "send" && data.request_type) {
        this._onSendDraft.fire({
          type: "send",
          requestType: data.request_type,
          recipient: data.recipient,
          recipients: data.recipients,
          subject: data.subject,
          contextBundle: data.context_bundle,
          deadline: data.deadline,
          note: data.note,
          filePath,
        });
      } else {
        console.warn("[PACT] Ignoring malformed draft file:", filePath);
      }
    } catch (err) {
      console.warn("[PACT] Failed to parse draft file:", filePath, err);
    }
  }
}
