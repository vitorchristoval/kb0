# Git & history — how your vault is versioned

kb0 turns every change into a git commit, automatically. This page explains what kb0 does for you, and what you do with standard git.

## The short version

- Your vault is a **normal git repository** — created when you run `kb0 init`.
- Every agent write/update/delete is **one commit**, signed with the agent's identity.
- kb0 only ever does: `init`, `add`, `remove`, `commit`. Everything else — viewing, reverting, pushing — is **plain git, done by you**.
- You're never locked in: it's a folder of markdown with git history, readable by any git tool.

```
┌─ kb0 does (automatic) ───────────┐   ┌─ you do (standard git) ─────────┐
│ • git init on kb0 init           │   │ • git log / show / diff          │
│ • 1 commit per write/update/del  │   │ • git revert (undo)              │
│ • signs with the agent identity  │   │ • git push (backup / sync)       │
│ • ignores the SQLite index       │   │ • git clone (new machine)        │
└──────────────────────────────────┘   └──────────────────────────────────┘
        writes the history                   reads & distributes it
```

## kb0 uses embedded git

kb0 versions your vault with [isomorphic-git](https://isomorphic-git.org), a pure-JavaScript git bundled into the package. Two consequences:

- kb0 can **commit without git installed** on the machine.
- The `.git` it creates is **fully compatible** with canonical git. Your terminal, VS Code, GitHub Desktop, Tower — anything — reads it normally.

## What gets committed

Each operation becomes a single commit:

| Action | Commit message | Author |
|---|---|---|
| `kb0 init` | `feat: init vault "<name>"` | `kb0 <kb0@localhost>` |
| `vault.write` | `feat: add <path>` | `agent:<name> <name@kb0.local>` |
| `vault.update` | `feat: update <path>` | `agent:<name>` |
| `vault.delete` | `feat: delete <path>` | `agent:<name>` |

The agent identity comes from `kb0 serve --agent <name>`. So the git history records **which agent** made **which change**, and **when** — provenance for free.

## What is NOT committed

- **`.vault-index/`** — the SQLite search index. It's gitignored because it's a rebuildable cache (`kb0 reindex --rebuild` recreates it). Never versioned.
- **Hand-added file stamps** — when you drop a plain `.md` into the vault and kb0 stamps its frontmatter, the stamp is written to disk but **not auto-committed**. Manual files stay in your own git workflow. The `author: human` field is their provenance.

## Viewing what the agent did

From inside the vault folder, using your normal git:

```bash
cd my-vault

git log --oneline
# a1b2c3d feat: update notes/architecture.md
# e4f5g6h feat: add notes/architecture.md
# 7h8i9j0 feat: init vault "my-vault"

git log --author="agent:research-bot"   # only this agent's writes
git show a1b2c3d                          # the exact diff of one change
git diff e4f5g6h a1b2c3d                  # what changed between two versions
```

## Undoing a change

```bash
git revert a1b2c3d    # reverts that write, keeping the history intact
```

After reverting on disk, run `kb0 reindex` so the search index matches.

## Backup, sync, and sharing

kb0 deliberately does **not** touch remotes — push/pull/branch/merge are yours to run. To back up or share a vault, connect it to a remote like any repo:

```bash
git remote add origin git@github.com:you/my-vault.git
git push -u origin main
```

To use the same vault on another machine:

```bash
git clone git@github.com:you/my-vault.git
cd my-vault
kb0 reindex          # rebuild the local search index from the markdown
kb0 serve --agent my-agent
```

The index is local to each machine (it's gitignored); the markdown + history is what travels.

## Multi-machine and conflicts

Because push/pull is manual, kb0 does not do automatic cross-machine sync or conflict resolution. If two agents on different machines write to the same remote vault, you resolve the merge with normal git, just like code. Coordinated multi-vault sync is on the roadmap (enterprise tier), not in the MVP.

Within a single running server, concurrent writes are handled at the tool boundary via optimistic locking — see [`vault.update`](../README.md#mcp-tools) and its `expectedHash`.
