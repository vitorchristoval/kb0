# research-agent

An agent that writes linked research notes into a kb0 vault's `_inbox/`, then searches and reads them back. Uses the [`kb0-mcp`](https://pypi.org/project/kb0-mcp) Python client.

This is the **inbox pattern**: agents write to `_inbox/`, humans (or a curator agent) promote notes to canonical later. See [multi-agent-acl](../multi-agent-acl) for the promotion side.

## Setup

```bash
npm install -g kb0-mcp        # the kb0 server
pip install -r requirements.txt

kb0 init vault                # creates ./vault (one-time)
```

Optional — semantic search:

```bash
export OPENAI_API_KEY=sk-...
```

## Run

```bash
python research_agent.py
```

Expected output (abridged):

```
→ writing findings to _inbox/
  ✓ _inbox/jwt-vs-sessions.md  (a1b2c3d4e5f6…)
  ✓ _inbox/refresh-token-rotation.md  (…)
  ✓ _inbox/key-management.md  (…)

→ searching the vault for 'token security'
  0.500  Refresh token rotation  (_inbox/refresh-token-rotation.md)
  ...

→ which notes link to jwt-vs-sessions.md?
  ← Refresh token rotation  (_inbox/refresh-token-rotation.md)
  ← Signing key management  (_inbox/key-management.md)

→ everything in the inbox
  • JWT vs server sessions  [draft]  #auth #security
  ...
```

Every write was a git commit, signed by `research-bot`:

```bash
cd vault && git log --oneline
```

## Make it a real agent (optional)

The findings here are canned so the example runs with no LLM key. To generate them
for real, replace the `FINDINGS` list with a call to Claude and write whatever it
returns. The MCP tool surface is identical — see
[docs/quickstart-sdk.md](../../docs/quickstart-sdk.md) for the full Claude tool-use
loop, or simply:

```python
import anthropic

client = anthropic.Anthropic()
msg = client.messages.create(
    model="claude-opus-4-8",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Summarize JWT vs sessions in 3 sentences."}],
)
content = msg.content[0].text
await kb.write("_inbox/jwt-vs-sessions.md", title="JWT vs sessions", content=content)
```
