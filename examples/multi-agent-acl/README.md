# multi-agent-acl

Two agents, two roles, enforced by the vault — not by trust. This is kb0's governance differentiator: permissions per agent per operation, via a glob-based policy file.

| Agent | read | write / update | delete |
|---|---|---|---|
| `research-bot` | everything | `_inbox/**` | — |
| `curator` | everything | `notes/**` | `notes/**` |

The demo runs the **inbox → canonical promotion** workflow: `research-bot` drafts into `_inbox/`, `curator` promotes to `notes/`. Each is blocked from the other's territory.

## Setup

```bash
npm install -g kb0-mcp
pip install kb0-mcp

kb0 init vault
cp .vault-policy.yaml vault/.vault-policy.yaml   # turns on enforced ACL
```

> Without the policy file in the vault, kb0 runs in **permissive** mode (a clear
> warning is printed) and nothing is denied. Copying it in is what enables enforcement.

## Run

```bash
python demo.py
```

Expected output:

```
✓ research-bot wrote _inbox/finding.md
✓ research-bot DENIED writing notes/ — ACL_DENIED
✓ curator promoted draft → notes/rate-limiting.md (canonical)
✓ curator DENIED writing _inbox/ — ACL_DENIED

Each role stayed in its lane — enforced by .vault-policy.yaml, not trust.
```

## How it works

`kb0 serve --agent <name>` runs the server as that identity. Every `write` /
`update` / `delete` is checked against the agent's globs in `.vault-policy.yaml`
before anything touches disk. A denied call returns a structured `ACL_DENIED`
error — which the Python client raises as `KbACLDeniedError`. Reads and searches
are also filtered to what the agent is allowed to see, so denied paths never leak
through search results.

To require the policy file (fail closed if it's missing), start with `--strict`:

```python
VaultClient(vault="./vault", agent="research-bot", strict=True)
```
