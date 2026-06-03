---
name: kb0
description: Integrate and use kb0 — the markdown/git/MCP knowledge base for AI agents. Use when adding kb0 to a project (install, create a vault, wire the MCP host config) or when reading, writing, searching, or linking notes in a kb0 vault.
---

# kb0

kb0 is a local MCP server that gives an agent a git-backed, markdown "vault" with 10 typed tools, per-agent ACL, and server-owned provenance. Use this skill to **(A) integrate kb0 into a project** and **(B) use a vault correctly**.

## A. Integrate kb0 into a project

1. **Install** (Node >= 20): `npm install -g kb0-mcp` — provides the `kb0` binary.
2. **Create a vault**: `kb0 init <vault>` — git-inits a folder with an `_inbox/`.
3. **Wire the MCP host.** Detect the host and add a `kb0` server entry:
   - Claude Desktop → `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Claude Code / Cursor / Windsurf → a project-level `.mcp.json` (or the host's config)

   ```json
   {
     "mcpServers": {
       "kb0": {
         "command": "kb0",
         "args": ["serve", "--agent", "<agent-name>", "--vault", "<absolute-vault-path>"],
         "env": { "OPENAI_API_KEY": "sk-..." }
       }
     }
   }
   ```

   Use an **absolute** vault path. `OPENAI_API_KEY` is optional — it enables semantic
   search; without it, search falls back to keyword-only.
4. **Verify**: call `vault.status` (or run `kb0 status` inside the vault). It reports
   notes indexed, policy mode, and the embedding model.

When writing application code, prefer a native client over raw MCP:
- **TypeScript**: `import { VaultClient } from 'kb0-mcp/client'` (ships inside `kb0-mcp`).
- **Python**: `from kb0 import VaultClient` (`pip install kb0-mcp`).

## B. Use a vault correctly

Tools: `vault.search` · `vault.read` · `vault.list` · `vault.write` · `vault.update`
· `vault.delete` · `vault.backlinks` · `vault.links` · `vault.recent` · `vault.status`.

Follow these rules — they prevent the common mistakes:

- **Don't set `author` / `id` / `created` / `updated`.** The server stamps them from the
  agent identity; callers can't forge provenance. Pass only `title`, `content`, `status`, `tags`.
- **To modify a note**, `vault.read` first to get its `hash`, then `vault.update` with
  `expectedHash`. On a `CONFLICT` error, re-read and retry — someone else changed it.
- **Write drafts to `_inbox/`.** Promote to canonical paths (e.g. `notes/`) explicitly;
  don't write straight to canonical unless that is the workflow.
- **`ACL_DENIED` is intentional** — the `.vault-policy.yaml` doesn't allow that agent that
  operation on that path. Adjust the path or the policy; don't retry blindly.
- **Use `[[path/to/note.md]]` wikilinks**; query relationships with `vault.backlinks` / `vault.links`.
- **Search**: default mode is `hybrid` (RRF). Use `mode: 'keyword'` when there's no
  `OPENAI_API_KEY`, or `mode: 'semantic'` for meaning-based retrieval.

## Errors

All structured and recoverable: `NOT_FOUND`, `CONFLICT` (stale hash), `VALIDATION`
(bad input, or note already exists on write), `ACL_DENIED` (policy).

## More

Repo: https://github.com/vitorchristoval/kb0 · Site: https://kb0.dev (machine-readable: https://kb0.dev/llms.txt)
