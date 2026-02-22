# US-001: PACT Repo Structure and Protocol Conventions

## Problem (The Pain)
Cory is a tech support engineer who needs to coordinate async work with colleagues through structured requests. Today he interrupts his investigation to manually compose markdown handoffs and post them to Slack, losing context at every hop. Before any tooling can work, there needs to be a shared repository with clear conventions that define how requests, responses, and pacts are organized -- the protocol itself.

## Who (The User)
- Cory, tech support engineer at a startup, daily bug investigation workflow
- Sets up the PACT workspace for his team
- Needs the repo structure to be self-documenting so Alex can understand it on clone

## Solution (What We Build)
A git repository template with directory conventions that define the PACT: where requests live, how lifecycle is tracked via directory placement, where responses go, and where pacts are stored. Plus a config.json for team membership.

## Domain Examples

### Example 1: Fresh Repo Initialization
Cory creates a new private GitHub repo called "acme-pact." He initializes it with the standard directory structure: `requests/pending/`, `requests/active/`, `requests/completed/`, `responses/`, `pacts/`, and a `config.json` listing himself as the first member. He pushes this to GitHub.

### Example 2: Adding Alex to the Team
Cory adds Alex to the config.json members array with user_id "alex" and display_name "Alex". He commits and pushes. When Alex clones the repo, config.json already contains her identity, ready for her MCP server to use.

### Example 3: Adding a New Request Type
Cory creates `pacts/sanity-check/PACT.md` describing how to compose and handle sanity-check requests. He commits and pushes. When Alex does `git pull`, she automatically has the new pact available. No manual installation.

## UAT Scenarios (BDD)

### Scenario: Initialize a PACT repo with standard structure
Given Cory creates a new git repository
When Cory initializes it with the PACT directory structure
Then the repo contains:
  | path                     | type      |
  | config.json              | file      |
  | requests/pending/.gitkeep   | file   |
  | requests/active/.gitkeep    | file   |
  | requests/completed/.gitkeep | file   |
  | responses/.gitkeep          | file   |
  | pacts/.gitkeep             | file   |

### Scenario: Config.json contains valid team membership
Given a PACT repo exists with config.json
When Cory adds a member with user_id "alex" and display_name "Alex"
Then config.json contains 2 members: "cory" and "alex"
And each member has a user_id and display_name

### Scenario: Pact file is accessible after git clone
Given Cory has committed "pacts/sanity-check/PACT.md" to the repo
When Alex clones the repo
Then Alex's local clone contains "pacts/sanity-check/PACT.md"
And the pact file is immediately usable without additional setup

### Scenario: Request lifecycle represented by directory placement
Given a request file "req-20260221-001.json" exists in "requests/pending/"
When the request is completed
Then the file is moved to "requests/completed/" via git mv
And git log shows the move as a tracked operation with timestamp

## Acceptance Criteria
- [ ] Repo structure matches the documented convention (requests/pending, active, completed; responses; pacts)
- [ ] config.json schema supports team members with user_id and display_name
- [ ] .gitkeep files ensure empty directories are tracked by git
- [ ] Pact files in pacts/{type}/PACT.md are synced to all clones via git pull
- [ ] Request lifecycle (pending -> completed) is tracked via directory placement

## Technical Notes
- .gitkeep files are needed because git does not track empty directories
- config.json is the only mutable shared config file -- potential merge conflict source, but changes are rare
- The `requests/active/` directory is reserved for future use (Tier 2: brain acknowledges receipt) -- included now to avoid restructuring later
- Repo should include a README.md documenting the protocol conventions
