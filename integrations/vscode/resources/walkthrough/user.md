## Your Identity

PACT identifies you by a **user ID** — a short, lowercase string with hyphens instead of spaces.

- `alice`
- `cory-h`
- `bob-smith`

This ID is used to:

- **Route requests** — incoming requests addressed to you appear in your inbox
- **Sign requests** — outgoing requests and responses show your identity
- **Filter subscriptions** — group inboxes you've subscribed to

### Optional: Display Name

You can also set `pact.displayName` for a friendlier name shown in request cards (e.g. "Alice Chen"). If not set, your user ID is used.
