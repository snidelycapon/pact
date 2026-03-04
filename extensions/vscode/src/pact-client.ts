import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { PactConfig } from "./config.js";

/**
 * Wraps the PACT MCP server as a typed client.
 * Spawns the server as a child process via stdio transport.
 */
export class PactClient {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private connecting: Promise<void> | null = null;

  constructor(private config: PactConfig) {}

  /** Connect to the MCP server (idempotent). */
  async connect(): Promise<void> {
    if (this.client) return;
    if (this.connecting) return this.connecting;

    this.connecting = this._connect();
    try {
      await this.connecting;
    } finally {
      this.connecting = null;
    }
  }

  private async _connect(): Promise<void> {
    this.transport = new StdioClientTransport({
      command: "node",
      args: [this.config.serverPath],
      env: {
        ...process.env,
        PACT_REPO: this.config.repoPath,
        PACT_USER: this.config.userId,
        PACT_DISPLAY_NAME: this.config.displayName,
        PACT_LOG_LEVEL: "error", // quiet in extension context
      },
    });

    this.client = new Client(
      { name: "vscode-pact", version: "0.1.0" },
      { capabilities: {} },
    );

    await this.client.connect(this.transport);
  }

  /** Disconnect and clean up. */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
    }
    this.transport = null;
  }

  /** Reconnect with new config. */
  async reconnect(config: PactConfig): Promise<void> {
    this.config = config;
    await this.disconnect();
    await this.connect();
  }

  /** Call pact_discover. */
  async discover(params?: {
    query?: string;
    scope?: string;
    format?: "full" | "compressed";
  }): Promise<unknown> {
    await this.connect();
    const result = await this.client!.callTool({
      name: "pact_discover",
      arguments: params ?? {},
    });
    return this.parseResult(result);
  }

  /** Call pact_do with any action. */
  async do(params: Record<string, unknown>): Promise<unknown> {
    await this.connect();
    const result = await this.client!.callTool({
      name: "pact_do",
      arguments: params,
    });
    return this.parseResult(result);
  }

  // Convenience wrappers for common actions

  async inbox(): Promise<InboxEntry[]> {
    const result = (await this.do({ action: "inbox" })) as {
      requests?: InboxEntry[];
    };
    return result.requests ?? [];
  }

  async checkStatus(requestId: string): Promise<unknown> {
    return this.do({ action: "check_status", request_id: requestId });
  }

  async respond(
    requestId: string,
    responseBundle: Record<string, unknown>,
    note?: string,
  ): Promise<unknown> {
    return this.do({
      action: "respond",
      request_id: requestId,
      response_bundle: responseBundle,
      ...(note ? { note } : {}),
    });
  }

  async send(params: {
    request_type: string;
    subject?: string;
    recipient?: string;
    recipients?: string[];
    context_bundle?: Record<string, unknown>;
    deadline?: string;
    thread_id?: string;
    group_ref?: string;
  }): Promise<unknown> {
    return this.do({ action: "send", ...params });
  }

  async viewThread(threadId: string): Promise<unknown> {
    return this.do({ action: "view_thread", thread_id: threadId });
  }

  async subscribe(recipient?: string): Promise<unknown> {
    return this.do({
      action: "subscribe",
      ...(recipient ? { recipient } : {}),
    });
  }

  async unsubscribe(recipient?: string): Promise<unknown> {
    return this.do({
      action: "unsubscribe",
      ...(recipient ? { recipient } : {}),
    });
  }

  async edit(params: {
    request_id: string;
    fields?: Record<string, unknown>;
    move_to?: "pending" | "active" | "completed" | "cancelled";
    note?: string;
  }): Promise<unknown> {
    return this.do({ action: "edit", ...params });
  }

  private parseResult(result: unknown): unknown {
    const r = result as {
      content?: Array<{ type: string; text?: string }>;
      isError?: boolean;
    };
    if (r.content && r.content.length > 0 && r.content[0].text) {
      const parsed = JSON.parse(r.content[0].text);
      if (r.isError) {
        throw new Error(
          typeof parsed === "string" ? parsed : JSON.stringify(parsed),
        );
      }
      return parsed;
    }
    return result;
  }
}

/** Shape of an inbox entry returned by the MCP server. */
export interface InboxEntry {
  request_id: string;
  short_id: string;
  request_type: string;
  sender: string;
  created_at: string;
  summary: string;
  subject?: string;
  thread_id?: string;
  pact_path: string;
  pact_description?: string;
  response_fields?: string[];
  attachment_count: number;
  amendment_count: number;
  recipients_count?: number;
  group_ref?: string;
  is_thread_group?: boolean;
  round_count?: number;
  latest_request_id?: string;
  request_ids?: string[];
}
