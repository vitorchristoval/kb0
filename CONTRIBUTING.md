# Contributing to kb0

Thanks for your interest. kb0 is Apache 2.0 — contributions are welcome.

## Setup

```bash
git clone https://github.com/vitorchristoval/kb0
cd kb0
npm install
npm run test:run   # 148 tests, should all pass
npm run typecheck  # should be clean
```

Node 20+ required.

## Project structure

```
src/
├── cli/          kb0 CLI commands (init, serve, reindex, status)
├── embedding/    EmbeddingProvider interface + OpenAI and Fake impls
├── errors.ts     KbError base class + typed subclasses
├── git/          GitAdapter — isomorphic-git wrapper
├── index/        KbIndex — SQLite + FTS5 + sqlite-vec + hybrid search
├── logger/       Logger interface + FileLogger + NullLogger
├── mcp/          MCP server, tools (10), defineTool helper, schemas
├── parser/       wikilinks + hashtag parser
├── policy/       KbPolicy — ACL engine with glob matching
├── schema/       Frontmatter Zod schema + gray-matter integration
├── store/        KbStore — read/write/update/delete with git + index
├── version.ts    Package version constant
└── watcher/      KbWatcher interface + LocalFileWatcher + FakeWatcher
```

## Conventions

- **TypeScript strict** — no `any` except where the SDK forces it (see `tool-base.ts` comment)
- **Tests for every public method** — vitest, co-located with source (`*.test.ts`)
- **Conventional commits** — `feat:`, `fix:`, `refactor:`, `chore:`, `docs:`
- **No `process.exit` in library code** — only in CLI entry points
- **Errors are typed** — throw `KbError` subclasses, never plain strings or `Error`

## Running tests

```bash
npm run test:run          # all tests once
npm run test              # watch mode
npm run typecheck         # TypeScript only
npm run lint              # ESLint
```

## Submitting a PR

1. Branch off `main`
2. Run `npm run test:run` and `npm run typecheck` — both must be clean
3. Follow the commit convention
4. PR description: what changed and why (not just what — that's in the diff)

## What's in scope for MVP

The MVP scope is intentionally narrow. Before opening a PR that adds a feature, check it isn't on this "not included" list — these are deliberate exclusions, not gaps:

- No multi-vault
- No web dashboard
- No REST adapter implementation
- No auth/SSO
- No PDF/DOCX support

Bug fixes, test coverage, and doc improvements are always welcome.

## License

By contributing you agree your changes will be licensed under Apache 2.0.

### Why Apache 2.0 (and not MIT)

Both are permissive licenses — you can use, modify, sell, and build closed-source
products on top of kb0. The difference that mattered for this project is **patents**.

- **MIT** is silent on patents. It grants copyright permission but says nothing
  about patent rights, leaving a legal gray area.
- **Apache 2.0** includes an **explicit patent grant** — every contributor licenses
  any patents covering their contribution — plus a **patent retaliation clause**:
  sue someone claiming kb0 infringes your patent and you lose your own patent
  license. This is what makes companies' legal teams comfortable adopting it.

Other practical differences: Apache 2.0 asks you to note files you've changed,
preserves a `NOTICE` file for attributions, and explicitly does **not** grant
trademark rights. It's the de-facto standard for production infrastructure
(Kubernetes, most CNCF and MCP-ecosystem projects).

kb0 positions itself as a production-grade, enterprise-ready layer, so the patent
protection and corporate-friendliness of Apache 2.0 were the deciding factors.
One compatibility note: Apache 2.0 is compatible with GPLv3 but **not** GPLv2.
