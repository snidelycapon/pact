# US-007: Craft Agents Source Integration

## Problem (The Pain)
Cory and Alex have the GARP repo and MCP server code, but they need to connect it to their actual agent platform (Craft Agents) so they can use the 4 GARP tools from within their normal agent sessions. Without proper integration, they would have to run the MCP server manually and the tools would not be available to their agents.

## Who (The User)
- Cory and Alex, both using Craft Agents as their agent platform
- Need the GARP tools available in any session without special setup
- Need the MCP server to start automatically when Craft Agents needs it

## Solution (What We Build)
A Craft Agents source configuration (JSON) that registers the GARP MCP server as a stdio source. When sessions need the GARP tools, Craft Agents starts the MCP server process with the correct environment variables (GARP_REPO, GARP_USER). The 4 tools become available to the agent like any other MCP tool.

## Domain Examples

### Example 1: Cory Adds the GARP Source
Cory opens Craft Agents settings and adds a new MCP source. He points it at the GARP MCP server entry point, sets GARP_REPO to `/Users/cory/repos/acme-garp` and GARP_USER to `cory`. The source appears as "GARP" in his source list. When he starts a session, the 4 garp_* tools are available.

### Example 2: Alex Configures with Her Own Identity
Alex follows the same process but sets GARP_USER to `alex` and GARP_REPO to her own clone path `/Users/alex/repos/acme-garp`. Her sessions show the same 4 tools, but garp_inbox filters for requests addressed to "alex."

### Example 3: Agent Discovers GARP Tools
Cory starts a new session and says "What GARP tools do I have?" The agent sees 4 tools from the "GARP" source: garp_request, garp_inbox, garp_respond, garp_status. Each tool has a description that helps the agent understand when to use it.

## UAT Scenarios (BDD)

### Scenario: Source configuration registers the MCP server
Given Cory adds a source configuration with:
  | setting    | value                              |
  | type       | mcp                                |
  | name       | GARP                               |
  | transport  | stdio                              |
  | command    | node                               |
  | args       | ["/path/to/garp-mcp/index.js"]    |
  | GARP_REPO | /Users/cory/repos/acme-garp       |
  | GARP_USER | cory                               |
When Craft Agents initializes the source
Then the MCP server starts successfully
And reports 4 available tools

### Scenario: All 4 GARP tools are discoverable by the agent
Given the GARP source is configured and running
When the agent lists available tools
Then the following tools are available:
  | tool           | description                                      |
  | garp_request  | Submit a structured GARP request          |
  | garp_inbox    | Check inbox for pending requests                  |
  | garp_respond  | Submit a response to a request                    |
  | garp_status   | Check status of a sent or received request        |

### Scenario: MCP server fails to start with invalid repo path
Given Cory configures GARP_REPO as "/nonexistent/path"
When Craft Agents tries to start the MCP server
Then the server reports an initialization error
And the error message indicates the repo path is invalid

### Scenario: Different users on same machine have separate identities
Given Cory configures with GARP_USER "cory"
And a second Craft Agents profile configures with GARP_USER "alex"
When each profile runs garp_inbox
Then Cory's inbox shows requests addressed to "cory"
And Alex's inbox shows requests addressed to "alex"

## Acceptance Criteria
- [ ] Source config follows Craft Agents MCP source schema (type, name, transport, command, args, env)
- [ ] MCP server starts via stdio transport when Craft Agents initializes the source
- [ ] 4 tools are exposed with descriptive names and descriptions
- [ ] GARP_REPO and GARP_USER are passed as environment variables
- [ ] MCP server validates GARP_REPO on startup (path exists, is a git repo)
- [ ] MCP server validates GARP_USER on startup (user exists in config.json)
- [ ] Tool descriptions are clear enough for agents to select the right tool for the situation

## Technical Notes
- The source config JSON is stored in Craft Agents app data, not in the GARP repo. Each user creates their own.
- The MCP server is a Node.js process (stdio transport). It is stateless between tool calls -- all state lives in the repo.
- Tool descriptions should follow clig.dev patterns: verb-first, concrete, no jargon. Example: "Check inbox for pending GARP requests addressed to you."
- This story can be developed in parallel with US-002/003/004/005 since it only needs the MCP server to expose tool definitions, not implement full functionality.
