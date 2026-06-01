# kb0

**The knowledge base layer for AI agents.** Markdown-first, MCP-native, git-backed, with ACL built in.

[![npm](https://img.shields.io/npm/v/kb0?color=22c55e)](https://www.npmjs.com/package/kb0)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-111%20passing-22c55e)](#)

---

## Why kb0

Most AI agents write to flat files, SQLite, or ad-hoc vector stores with no history, no permissions, and no way to audit what changed. kb0 is the missing persistence layer: every note is a markdown file, every write is a git commit, and every agent operation goes through a typed MCP interface with optional ACL.

| | kb0 | basic-memory | mcp-obsidian | Mem0 / Letta | Pinecone |
|---|---|---|---|---|---|
| Markdown files | ✓ | ✓ | ✓ | ✗ | ✗ |
| Git-backed history | ✓ | ✗ | ✗ | ✗ | ✗ |
| MCP-native | ✓ | partial | ✓ | ✗ | ✗ |
| ACL per agent | ✓ | ✗ | ✗ | ✗ | ✗ |
| Hybrid search (FTS5 + vec) | ✓ | ✗ | ✗ | ✓ | ✓ |
| No external service | ✓ | ✓ | requires Obsidian | ✗ | ✗ |

---

## Quickstart

```bash
npm install -g kb0

kb0 init my-vault
cd my-vault

# Optional: configure agent permissions
# nano .vault-policy.yaml

kb0 serve --agent my-agent
```

Your vault is now a running MCP server. Connect any agent.

**Claude Desktop** — add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "kb0": {
      "command": "kb0",
      "args": ["serve", "--agent", "claude", "--vault", "/absolute/path/to/my-vault"],
      "env": { "OPENAI_API_KEY": "sk-..." }
    }
  }
}
```

**Anthropic SDK / OpenAI / LangGraph** — see [docs/quickstart-sdk.md](docs/quickstart-sdk.md).

---

## How it works

```
┌──────────────────────────────────────────────┐
│              Your AI Agent                   │
│  Claude / GPT-4o / LangGraph / custom        │
└──────────────────┬───────────────────────────┘
                   │  MCP protocol (stdio)
┌──────────────────▼───────────────────────────┐
│               kb0 server                     │
│                                              │
│  10 MCP tools                                │
│  ├── KbStore   markdown + git commits        │
│  ├── KbIndex   SQLite + FTS5 + sqlite-vec    │
│  └── KbPolicy  glob-based ACL per agent      │
└──────────────────┬───────────────────────────┘
                   │
┌──────────────────▼───────────────────────────┐
│                 Vault                        │
│                                              │
│  notes/           _inbox/                   │
│  .vault-policy.yaml   .gitignore            │
│  .git/            .vault-index/index.db     │
└──────────────────────────────────────────────┘
```

Every `vault.write` or `vault.update` call:
1. Validates against ACL policy
2. Writes the markdown file with frontmatter (author, id, timestamps)
3. Creates a git commit (full audit trail)
4. Updates the search index synchronously

---

## MCP Tools

| Tool | What it does |
|---|---|
| `vault.write` | Create a new note. Server sets author, id, timestamps — agent cannot forge provenance. |
| `vault.read` | Read a note. Returns content, frontmatter, and SHA-256 hash for optimistic locking. |
| `vault.update` | Update a note. Requires `expectedHash` to prevent overwriting concurrent edits. |
| `vault.delete` | Delete a note. Recorded in git history. |
| `vault.search` | Hybrid search (FTS5 keyword + semantic via embeddings). Returns ranked results with excerpts. |
| `vault.list` | List notes by prefix, tag, or status. ACL-filtered. |
| `vault.recent` | Most recently updated notes. |
| `vault.backlinks` | Notes that link to a given note via `[[wikilinks]]`. |
| `vault.links` | Outgoing links from a note. |
| `vault.status` | Vault health: note count, stale embeddings, policy mode, log file. |

All tools return structured errors (`NOT_FOUND`, `CONFLICT`, `VALIDATION`, `ACL_DENIED`) — never silent failures.

---

## Frontmatter schema

Every note has a validated frontmatter block:

```yaml
---
id: 550e8400-e29b-41d4-a716-446655440000   # auto-generated UUID
title: "My Note"
author: agent:my-agent                      # always set by server
status: draft                               # draft | reviewed | canonical
tags: [typescript, architecture]
created: 2024-01-01T12:00:00.000Z
updated: 2024-01-01T12:00:00.000Z
---

Note content here. Supports [[wikilinks]] and #tags.
```

Unknown fields pass through unchanged (extensibility).

---

## ACL policy

Create `.vault-policy.yaml` in your vault root:

```yaml
version: 1
agents:
  research-agent:
    read: ["**/*"]
    write: ["_inbox/**"]
    update: ["_inbox/**"]
    delete: []
  curator:
    read: ["**/*"]
    write: ["notes/**"]
    update: ["notes/**"]
    delete: ["notes/**"]
# Agents not listed and no 'default' = DENY ALL
```

Start with `--strict` to fail if no policy file exists:

```bash
kb0 serve --agent my-agent --strict
```

---

## Search

kb0 uses hybrid search by default — combines BM25 keyword ranking (FTS5) with semantic similarity (OpenAI `text-embedding-3-small`) via Reciprocal Rank Fusion.

```bash
# Set API key for semantic search (optional — falls back to keyword-only without it)
export OPENAI_API_KEY=sk-...

# Reindex existing notes
kb0 reindex

# Full rebuild
kb0 reindex --rebuild
```

---

## CLI reference

```
kb0 init <name>              Initialize a new vault
kb0 serve                    Start MCP server (stdio)
  --agent <name>             Agent identity (required)
  --vault <path>             Vault directory (default: cwd)
  --strict                   Fail if .vault-policy.yaml is absent
kb0 reindex                  Incremental reindex
  --rebuild                  Full rebuild
kb0 status                   Vault health and index stats
  --vault <path>             Vault directory (default: cwd)
```

---

## Integrate with your agent

See the guides:

- [Claude Desktop setup](docs/quickstart-claude-desktop.md)
- [Anthropic SDK / OpenAI / LangGraph](docs/quickstart-sdk.md)
- [Architecture deep dive](docs/architecture.md)

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## License

Apache 2.0 — see [LICENSE](LICENSE).
