## PACT Repository

PACT uses a shared **git repository** as its transport layer. Your team should already have one set up — ask your team lead if you're not sure where it is.

The repository contains:

- **pact-store/** — Pact type definitions (what kinds of requests your team uses)
- **requests/** — Pending, active, completed, and cancelled requests
- **responses/** — Responses to requests
- **members/** — User profiles and group subscriptions

### Setting the path

1. Open the Command Palette (`Cmd+Shift+P`)
2. Run **PACT: Configure**
3. Set `pact.repoPath` to the **absolute path** of your local clone

Example: `/Users/you/pact-team`
