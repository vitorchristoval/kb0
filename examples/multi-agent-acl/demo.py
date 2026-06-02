"""
multi-agent-acl — two agents with different permissions, enforced by kb0.

  research-bot : writes/updates _inbox/** only
  curator      : writes/updates/deletes notes/** only

The demo shows the policy in action: allowed operations succeed, forbidden
ones raise KbACLDeniedError. This is the inbox→canonical promotion workflow
with governance enforced by the vault, not by convention.

Run:
    kb0 init vault
    cp .vault-policy.yaml vault/.vault-policy.yaml   # enable enforced mode
    python demo.py
"""

import asyncio

from kb0 import KbACLDeniedError, VaultClient


async def main() -> None:
    # ── research-bot drafts into the inbox ──────────────────────────────────────
    async with VaultClient(vault="./vault", agent="research-bot") as bot:
        await bot.write(
            "_inbox/finding.md",
            title="Finding: rate limiting",
            content="Token bucket beats fixed window for bursty traffic.",
            tags=["draft"],
        )
        print("✓ research-bot wrote _inbox/finding.md")

        # ...but it may NOT write to canonical notes/
        try:
            await bot.write("notes/canonical.md", title="Nope", content="should fail")
            print("✗ research-bot wrote notes/ — policy NOT enforced!")
        except KbACLDeniedError as e:
            print(f"✓ research-bot DENIED writing notes/ — {e.code}")

    # ── curator promotes the draft to a canonical note ──────────────────────────
    async with VaultClient(vault="./vault", agent="curator") as curator:
        draft = await curator.read("_inbox/finding.md")  # read is allowed for both
        await curator.write(
            "notes/rate-limiting.md",
            title="Rate limiting",
            content=draft["content"],
            status="canonical",
        )
        print("✓ curator promoted draft → notes/rate-limiting.md (canonical)")

        # ...but the curator may NOT touch the inbox
        try:
            await curator.write("_inbox/sneaky.md", title="Nope", content="should fail")
            print("✗ curator wrote _inbox/ — policy NOT enforced!")
        except KbACLDeniedError as e:
            print(f"✓ curator DENIED writing _inbox/ — {e.code}")

    print("\nEach role stayed in its lane — enforced by .vault-policy.yaml, not trust.")
    print("Inspect: `cd vault && git log --oneline` (commits signed per agent)")


if __name__ == "__main__":
    asyncio.run(main())
