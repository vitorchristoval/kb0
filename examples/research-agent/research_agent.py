"""
research-agent — writes linked research notes into a kb0 vault's _inbox/,
then searches and reads them back.

Demonstrates the kb0-mcp Python client (VaultClient): write, search, read,
backlinks, list. No LLM key required — the "findings" are canned so the
example runs out of the box. See the README for how to swap in Claude to
generate the notes for real.

Run:
    kb0 init vault                 # one-time: create the vault
    python research_agent.py
"""

import asyncio

from kb0 import VaultClient

# In a real agent, these would come from an LLM researching a topic.
# Note the [[wikilinks]] — kb0 indexes them so backlinks/links work.
FINDINGS = [
    {
        "path": "_inbox/jwt-vs-sessions.md",
        "title": "JWT vs server sessions",
        "tags": ["auth", "security"],
        "content": (
            "Stateless JWTs scale horizontally with no shared session store, but "
            "can't be revoked before expiry. Server sessions are revocable but need "
            "a shared store. Mitigate JWT's weakness with "
            "[[_inbox/refresh-token-rotation.md]]."
        ),
    },
    {
        "path": "_inbox/refresh-token-rotation.md",
        "title": "Refresh token rotation",
        "tags": ["auth", "security"],
        "content": (
            "Issue short-lived access tokens plus a long-lived refresh token. "
            "Rotate the refresh token on every use and detect reuse to catch theft. "
            "Pairs well with the stateless model in [[_inbox/jwt-vs-sessions.md]]."
        ),
    },
    {
        "path": "_inbox/key-management.md",
        "title": "Signing key management",
        "tags": ["auth", "ops"],
        "content": (
            "Rotate signing keys on a schedule and publish them via JWKS so verifiers "
            "pick up new keys automatically. Relevant to anyone shipping "
            "[[_inbox/jwt-vs-sessions.md]]."
        ),
    },
]


async def main() -> None:
    async with VaultClient(vault="./vault", agent="research-bot") as kb:
        print("→ writing findings to _inbox/")
        for note in FINDINGS:
            res = await kb.write(
                note["path"],
                title=note["title"],
                content=note["content"],
                tags=note["tags"],
            )
            print(f"  ✓ {res['path']}  ({res['hash'][:12]}…)")

        print("\n→ searching the vault for 'token security'")
        hits = await kb.search("token security", limit=5)
        if hits["warnings"]:
            print(f"  ⚠ {', '.join(hits['warnings'])}")
        for r in hits["results"]:
            print(f"  {r['score']:.3f}  {r['title']}  ({r['path']})")

        print("\n→ which notes link to jwt-vs-sessions.md?")
        back = await kb.backlinks("_inbox/jwt-vs-sessions.md")
        for b in back["backlinks"]:
            print(f"  ← {b['title']}  ({b['path']})")

        print("\n→ everything in the inbox")
        listing = await kb.list(prefix="_inbox/")
        for n in listing["notes"]:
            tags = " ".join(f"#{t}" for t in n["tags"])
            print(f"  • {n['title']}  [{n['status']}]  {tags}")

    print("\nDone. Inspect the vault: `cd vault && git log --oneline`")


if __name__ == "__main__":
    asyncio.run(main())
