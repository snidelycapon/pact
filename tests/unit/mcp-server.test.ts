/**
 * Unit tests for GARP MCP server wiring.
 *
 * Tests enter through the MCP protocol (driving port) using InMemoryTransport
 * to verify tool registration and env var validation.
 *
 * Test Budget: 2 behaviors (tool registration, env var validation) x 2 = 4 max
 */

import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../../src/mcp-server.ts";

describe("MCP server wiring", () => {
  it("registers all GARP tools", async () => {
    const mcpServer = createMcpServer({ repoPath: "/tmp/test-repo", userId: "alice" });
    const client = new Client({ name: "test-client", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    await mcpServer.connect(serverTransport);
    await client.connect(clientTransport);

    const result = await client.listTools();
    const toolNames = result.tools.map((t) => t.name).sort();

    expect(toolNames).toEqual(["garp_amend", "garp_cancel", "garp_inbox", "garp_request", "garp_respond", "garp_skills", "garp_status", "garp_thread"]);

    await client.close();
    await mcpServer.close();
  });

  it("createMcpServer throws when repoPath is empty", () => {
    expect(() => createMcpServer({ repoPath: "", userId: "alice" })).toThrow("repoPath");
  });

  it("createMcpServer throws when userId is empty", () => {
    expect(() => createMcpServer({ repoPath: "/tmp/repo", userId: "" })).toThrow("userId");
  });
});
