# kb0

**The knowledge base layer for AI agents.** Markdown-first, MCP-native, git-backed, with ACL built in.

[![npm](https://img.shields.io/npm/v/kb0-mcp?color=22c55e)](https://www.npmjs.com/package/kb0-mcp)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-139%20passing-22c55e)](#)

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
npm install -g kb0-mcp

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

**TypeScript** — the npm `kb0-mcp` package ships a typed client at `kb0-mcp/client`, no extra install:

```ts
import { VaultClient } from 'kb0-mcp/client';

const kb = await VaultClient.connect({ vault: './my-vault', agent: 'my-agent' });
await kb.write('notes/auth.md', { title: 'Auth', content: '…', tags: ['auth'] });
const hits = await kb.search('token security', { limit: 5 });
await kb.close();
```

**Python** — `pip install kb0-mcp` for a native async client ([kb0-python](https://github.com/vitorchristoval/kb0-python)). **Anthropic SDK / OpenAI / LangGraph** — see [docs/quickstart-sdk.md](docs/quickstart-sdk.md).

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

### Adding notes by hand

You don't have to go through an agent. Drop a plain markdown file into the vault — even with no frontmatter — and kb0 stamps it on the next `kb0 reindex` (or live, while `kb0 serve` is running):

```bash
echo "# My Idea

Written straight in my editor." > my-vault/notes/idea.md

kb0 reindex
```

kb0 fills in `author: human`, a stable id, a title from the first `# heading` (or the filename), and timestamps from the file. Files you wrote keep their `human` provenance; agent writes are tagged `agent:<name>`. The stamp is written to disk but not auto-committed — your manual files stay in your own git workflow.

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

## Configuration

kb0 runs **entirely on your machine** — it's not a hosted service. The vault is a local folder, and the npm package is the server. There's no account to create and nothing to connect to.

### Git — zero config

kb0 uses an embedded git implementation ([isomorphic-git](https://isomorphic-git.org)), so **you don't need git installed** and it **doesn't touch your personal `~/.gitconfig`**. Every write is committed under the agent's own identity for provenance:

```
kb0 init    → author: kb0 <kb0@localhost>
kb0 serve   → author: agent:<name> <name@kb0.local>
```

You never configure git. It just works. To see the agent's history, undo a change, or push your vault to GitHub, you use plain git — see [Git & history](docs/git-and-history.md).

### Embeddings — one optional env var

Semantic search needs an embedding provider. Without one, kb0 falls back to **keyword-only search** (everything else works normally).

| Env var | Default | Purpose |
|---|---|---|
| `OPENAI_API_KEY` | — | Enables semantic search. Absent = keyword-only. |
| `KB0_EMBEDDING_MODEL` | `text-embedding-3-small` | Any OpenAI embedding model. |
| `KB0_EMBEDDING_DIMENSIONS` | per-model (1536 / 3072) | Override vector size. |
| `KB0_OPENAI_BASE_URL` | OpenAI | Point at a compatible endpoint (Azure, LiteLLM, Ollama). |

```bash
# Default — OpenAI text-embedding-3-small
export OPENAI_API_KEY=sk-...

# Larger model
export KB0_EMBEDDING_MODEL=text-embedding-3-large

# Local Ollama (OpenAI-compatible)
export OPENAI_API_KEY=ollama
export KB0_OPENAI_BASE_URL=http://localhost:11434/v1
export KB0_EMBEDDING_MODEL=nomic-embed-text
export KB0_EMBEDDING_DIMENSIONS=768
```

Changing the model is safe: kb0 tracks the model and dimensions per embedding, detects the mismatch on next boot, and re-embeds stale notes in the background.

## Search

kb0 uses hybrid search by default — combines BM25 keyword ranking (FTS5) with semantic similarity via Reciprocal Rank Fusion.

```bash
# Reindex existing notes (incremental)
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
- [Git & history — versioning, undo, backup, sync](docs/git-and-history.md)
- [Architecture deep dive](docs/architecture.md)

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## License

Apache 2.0 — see [LICENSE](LICENSE).
