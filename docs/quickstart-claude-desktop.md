# kb0 + Claude Desktop in 2 minutes

## Prerequisites

- Node 20+
- Claude Desktop installed
- (Optional) OpenAI API key for semantic search

## Step 1 — Install and create a vault

```bash
npm install -g kb0-mcp
kb0 init my-vault
cd my-vault
```

This creates:
```
my-vault/
├── _inbox/      agents write here by default
└── .gitignore   (the vault is a fresh git repo; no ACL file yet — see below)
```

## Step 2 — Configure Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "kb0": {
      "command": "kb0",
      "args": [
        "serve",
        "--agent", "claude",
        "--vault", "/Users/you/my-vault"
      ],
      "env": {
        "OPENAI_API_KEY": "sk-..."
      }
    }
  }
}
```

> Without `OPENAI_API_KEY`, kb0 falls back to keyword-only search. Everything else works normally.

## Step 3 — Restart Claude Desktop

Quit and reopen Claude Desktop. You should see the vault tools in the toolbar (hammer icon).

## Step 4 — Try it

Ask Claude:

> "Create a note about the design decision we made today: we're using SQLite for the index instead of Postgres."

Then:

> "Search my vault for notes about SQLite."

Claude will use `vault.write` and `vault.search` automatically.

## Verify the git history

```bash
cd my-vault
git log --oneline
```

Every write Claude made is a commit with full provenance.

## Configure ACL (recommended)

By default the vault is permissive (any agent, full access) and prints a warning on boot. Create `.vault-policy.yaml` in the vault root to restrict what Claude can write:

```yaml
version: 1
agents:
  claude:
    read: ["**/*"]
    write: ["_inbox/**"]        # Claude can only write to _inbox
    update: ["_inbox/**"]
    delete: []
```

Restart the server. Now Claude can only write to `_inbox/` — you promote notes manually.

## Reindex after adding files manually

```bash
cd my-vault
OPENAI_API_KEY=sk-... kb0 reindex
```
