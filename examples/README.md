# kb0 examples

Runnable examples showing kb0 in real workflows. Each folder is self-contained with its own README.

| Example | What it shows | Stack |
|---|---|---|
| [research-agent](./research-agent) | An agent writing linked research notes to `_inbox/`, then searching and reading them back | Python ([`kb0-mcp`](https://pypi.org/project/kb0-mcp)) |
| [multi-agent-acl](./multi-agent-acl) | Two agents with different permissions via `.vault-policy.yaml` — governance in action | Python ([`kb0-mcp`](https://pypi.org/project/kb0-mcp)) |

## Prerequisites for all examples

```bash
npm install -g kb0-mcp      # the kb0 server (provides the `kb0` command)
pip install kb0-mcp         # the Python client used by these examples
```

Optional — for semantic search, export an OpenAI key before running:

```bash
export OPENAI_API_KEY=sk-...
```

Without it, kb0 falls back to keyword-only search and everything else still works.
