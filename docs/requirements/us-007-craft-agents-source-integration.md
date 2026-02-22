# US-007: Craft Agents Source Integration

## Problem (The Pain)
Cory and Alex have the PACT repo and MCP server code, but they need to connect it to their actual agent platform (Craft Agents) so they can use the 4 PACT tools from within their normal agent sessions. Without proper integration, they would have to run the MCP server manually and the tools would not be available to their agents.

## Who (The User)
- Cory and Alex, both using Craft Agents as their agent platform
- Need the PACT tools available in any session without special setup
- Need the MCP server to start automatically when Craft Agents needs it

## Solution (What We Build)
A Craft Agents source configuration (JSON) that registers the PACT MCP server as a stdio source. When sessions need the PACT tools, Craft Agents starts the MCP server process with the correct environment variables (PACT_REPO, PACT_USER). The 4 tools become available to the agent like any other MCP tool.

## Domain Examples

### Example 1: Cory Adds the PACT Source
Cory opens Craft Agents settings and adds a new MCP source. He points it at the PACT MCP server entry point, sets PACT_REPO to `/Users/cory/repos/acme-pact` and PACT_USER to `cory`. The source appears as "PACT" in his source list. When he starts a session, the 4 pact_* tools are available.

### Example 2: Alex Configures with Her Own Identity
Alex follows the same process but sets PACT_USER to `alex` and PACT_REPO to her own clone path `/Users/alex/repos/acme-pact`. Her sessions show the same 4 tools, but pact_inbox filters for requests addressed to "alex."

### Example 3: Agent Discovers PACT Tools
Cory starts a new session and says "What PACT tools do I have?" The agent sees 4 tools from the "PACT" source: pact_request, pact_inbox, pact_respond, pact_status. Each tool has a description that helps the agent understand when to use it.

## UAT Scenarios (BDD)

### Scenario: Source configuration registers the MCP server
Given Cory adds a source configuration with:
  | setting    | value                              |
  | type       | mcp                                |
  | name       | PACT                               |
  | transport  | stdio                              |
  | command    | node                               |
  | args       | ["/path/to/pact-mcp/index.js"]    |
  | PACT_REPO | /Users/cory/repos/acme-pact       |
  | PACT_USER | cory                               |
When Craft Agents initializes the source
Then the MCP server starts successfully
And reports 4 available tools

### Scenario: All 4 PACT tools are discoverable by the agent
Given the PACT source is configured and running
When the agent lists available tools
Then the following tools are available:
  | tool           | description                                      |
  | pact_request  | Submit a structured PACT request          |
  | pact_inbox    | Check inbox for pending requests                  |
  | pact_respond  | Submit a response to a request                    |
  | pact_status   | Check status of a sent or received request        |

### Scenario: MCP server fails to start with invalid repo path
Given Cory configures PACT_REPO as "/nonexistent/path"
When Craft Agents tries to start the MCP server
Then the server reports an initialization error
And the error message indicates the repo path is invalid

### Scenario: Different users on same machine have separate identities
Given Cory configures with PACT_USER "cory"
And a second Craft Agents profile configures with PACT_USER "alex"
When each profile runs pact_inbox
Then Cory's inbox shows requests addressed to "cory"
And Alex's inbox shows requests addressed to "alex"

## Acceptance Criteria
- [ ] Source config follows Craft Agents MCP source schema (type, name, transport, command, args, env)
- [ ] MCP server starts via stdio transport when Craft Agents initializes the source
- [ ] 4 tools are exposed with descriptive names and descriptions
- [ ] PACT_REPO and PACT_USER are passed as environment variables
- [ ] MCP server validates PACT_REPO on startup (path exists, is a git repo)
- [ ] MCP server validates PACT_USER on startup (user exists in config.json)
- [ ] Tool descriptions are clear enough for agents to select the right tool for the situation

## Technical Notes
- The source config JSON is stored in Craft Agents app data, not in the PACT repo. Each user creates their own.
- The MCP server is a Node.js process (stdio transport). It is stateless between tool calls -- all state lives in the repo.
- Tool descriptions should follow clig.dev patterns: verb-first, concrete, no jargon. Example: "Check inbox for pending PACT requests addressed to you."
- This story can be developed in parallel with US-002/003/004/005 since it only needs the MCP server to expose tool definitions, not implement full functionality.
