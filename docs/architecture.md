# Why I built kb0 — the knowledge base layer for AI agents

Most AI agent implementations I've seen store knowledge in one of three ways: a folder of text files with no structure, a SQLite database that's invisible to humans, or a vector store with no history and no way to audit changes. None of these are right.

The problem is not storing vectors. The problem is **knowledge management** — and that's a solved problem in the human world. We use markdown files, version control, and structured metadata. kb0 brings that same infrastructure to AI agents.

## The design decisions, and why

### Git is the substrate

Every `vault.write` and `vault.update` creates a git commit. This sounds obvious in retrospect but I haven't seen another agent memory system do it.

The consequences are significant:
- Full audit trail of what the agent wrote and when
- Rollback for free — `git revert` works on notes just like code
- Concurrent access is resolved at the tool boundary via optimistic locking (SHA-256 hash of the current file must match before an update is accepted)
- The vault is just a folder — it syncs via standard git tooling

The git layer uses `isomorphic-git` so there's no system git dependency, and it runs everywhere Node.js runs.

### Markdown is the source of truth

The index (SQLite + FTS5 + sqlite-vec) is fully rebuildable from the markdown files. If the index gets corrupted, `kb0 reindex --rebuild` reconstructs it. The user is never locked into kb0's format.

This also means the vault is human-readable and human-editable. You can open the folder in Obsidian, edit a note in VS Code, and the agent sees the changes on next search — the file watcher picks it up and reindexes incrementally while `kb0 serve` is running.

You can even drop a plain markdown file into the vault with no frontmatter at all. kb0 stamps it on ingest: `author: human`, a stable generated id, a title taken from the first `# heading` (or the filename), and timestamps from the file's mtime. The stamp is written back to disk so the id stays stable, but it is not auto-committed — external files belong to your own git workflow. This is what makes "markdown is the source of truth" literally true: you are never required to go through an agent to add knowledge.

### Provenance in frontmatter, always

```yaml
---
id: 550e8400-e29b-41d4-a716-446655440000
title: "API design decision"
author: agent:research-bot                # always set by server
status: draft
created: 2024-01-15T10:30:00.000Z
updated: 2024-01-15T10:30:00.000Z
---
```

The `author` field cannot be set by the agent — the server always writes it from the agent's identity configured at startup. An agent cannot forge provenance. This matters for multi-agent vaults where you need to know which agent wrote what.

### Inbox before canonical

Agents write to `_inbox/` by default. Humans (or a separate curation agent) promote notes to `notes/` when they're ready. This pattern prevents agents from polluting the main knowledge base with unreviewed output.

The ACL policy enforces this:

```yaml
agents:
  research-bot:
    write: ["_inbox/**"]   # can only create new notes in inbox
    update: ["_inbox/**"]  # can update its own inbox notes
    delete: []             # cannot delete anything
```

### Optimistic locking, not global locks

`vault.update` requires an `expectedHash` — the SHA-256 of the current file on disk. If the file changed since you read it, the update is rejected with a `CONFLICT` error that includes the actual current hash. The agent reads the note again and decides what to do.

This is how git resolves conflicts, how Stripe resolves idempotency, and how most distributed systems handle concurrent writes. It's simple, correct, and requires no coordination infrastructure.

### Hybrid search without an external service

kb0 uses SQLite with two extensions:
- **FTS5** for BM25 keyword ranking
- **sqlite-vec** for cosine similarity on float32 embeddings

Search combines both via Reciprocal Rank Fusion (RRF) — a technique that merges two ranked lists without needing to normalize their scores. The result is better than either alone, especially for queries that mix specific keywords with semantic concepts.

The database file lives in `.vault-index/index.db` inside the vault. No external service, no network dependency, no vector database subscription.

### MCP-first, not REST

The Model Context Protocol is the right interface for AI agents — it's typed, structured, and designed for tool use. kb0's 10 tools map directly to the operations agents need: read, write, update, delete, search, list, backlinks, links, recent, and status.

REST is a future option (the abstraction is already clean) but it's not in the MVP. Every decision that adds scope without adding value for the core use case gets deferred.

## What's next

Sprint 5 is documentation and launch. Sprint 6 is the public release on npm.

Future work after launch:
- HTTP/SSE transport for cloud-hosted agents
- Multi-vault isolation (enterprise tier)
- Promotion workflow with human review
- Web dashboard for vault curation

The core design — git substrate, markdown source of truth, embedded SQLite index, typed MCP interface — is locked. Everything else is additive.

---

*kb0 is open source under Apache 2.0. [GitHub](https://github.com/vitorchristoval/kb0)*
