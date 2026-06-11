import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VaultClient } from './VaultClient.js';
import { KbAclDeniedError, KbConflictError, KbNotFoundError } from './errors.js';

const CLOUD = 'https://cloud.test';

interface Captured {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

let calls: Captured[];

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

/** Route a mocked fetch against a tiny in-memory cloud vault. */
function installFetch(handler: (c: Captured) => Response): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const headers = init.headers as Record<string, string>;
      const captured: Captured = {
        method: init.method ?? 'GET',
        url: String(url),
        headers,
        body: init.body ? JSON.parse(init.body as string) : undefined,
      };
      calls.push(captured);
      return handler(captured);
    }),
  );
}

async function hosted(): Promise<VaultClient> {
  return VaultClient.connect({
    vault: 'kb0://team-kb',
    agent: 'bot',
    apiKey: 'kb0_live_x',
    cloudUrl: CLOUD,
  });
}

describe('VaultClient hosted (kb0://) mode', () => {
  beforeEach(() => {
    calls = [];
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requires an apiKey for a hosted vault', async () => {
    await expect(
      VaultClient.connect({ vault: 'kb0://team-kb', agent: 'bot' }),
    ).rejects.toThrow(/apiKey/);
  });

  it('does not spawn a subprocess (no MCP transport)', async () => {
    installFetch(() => json({ entries: [] }));
    const kb = await hosted();
    // recent hits the cloud, proving the REST path is live.
    await kb.recent();
    expect(calls[0].url).toBe(`${CLOUD}/v1/vault/tree`);
    expect(calls[0].headers.authorization).toBe('Bearer kb0_live_x');
    // the kb0://team-kb name routes to the named vault server-side
    expect(calls[0].headers['x-kb0-vault']).toBe('team-kb');
    await kb.close();
  });

  it('writes via PUT and maps to WriteOutput', async () => {
    installFetch((c) =>
      json(
        {
          path: 'notes/a.md',
          title: 'A',
          content: 'body',
          hash: 'h1',
          frontmatter: { id: c.body && (c.body as { frontmatter?: { id?: string } }).frontmatter?.id, status: 'draft' },
          updatedAt: '2026-01-01T00:00:00Z',
        },
        201,
      ),
    );
    const kb = await hosted();
    const out = await kb.write('notes/a.md', { title: 'A', content: 'body', tags: ['x'] });

    const put = calls[0];
    expect(put.method).toBe('PUT');
    expect(put.url).toBe(`${CLOUD}/v1/vault/notes/notes/a.md`);
    const body = put.body as { title: string; frontmatter: { author: string; tags: string[] } };
    expect(body.title).toBe('A');
    expect(body.frontmatter.author).toBe('bot');
    expect(body.frontmatter.tags).toEqual(['x']);
    expect(out.path).toBe('notes/a.md');
    expect(out.hash).toBe('h1');
    expect(out.id).toBeTruthy();
    await kb.close();
  });

  it('reads and fills frontmatter defaults', async () => {
    installFetch(() =>
      json({
        path: 'notes/a.md',
        title: 'A',
        content: 'hi',
        hash: 'h1',
        frontmatter: { title: 'A', created: '2026-01-01T00:00:00Z' },
        updatedAt: '2026-01-02T00:00:00Z',
      }),
    );
    const kb = await hosted();
    const out = await kb.read('notes/a.md');
    expect(out.content).toBe('hi');
    expect(out.frontmatter.status).toBe('draft');
    expect(out.frontmatter.tags).toEqual([]);
    expect(out.frontmatter.updated).toBe('2026-01-02T00:00:00Z');
    await kb.close();
  });

  it('updates with an If-Match header', async () => {
    installFetch(() =>
      json({ path: 'notes/a.md', title: 'A', content: 'v2', hash: 'h2', frontmatter: {}, updatedAt: 'x' }),
    );
    const kb = await hosted();
    const out = await kb.update('notes/a.md', { content: 'v2', expectedHash: 'h1', status: 'reviewed' });
    expect(calls[0].headers['if-match']).toBe('h1');
    expect((calls[0].body as { frontmatter: { status: string } }).frontmatter.status).toBe('reviewed');
    expect(out.hash).toBe('h2');
    await kb.close();
  });

  it('lists with a client-side prefix filter', async () => {
    installFetch(() =>
      json({
        entries: [
          { path: 'notes/a.md', title: 'A', status: 'draft', tags: [], updatedAt: '2026-01-03T00:00:00Z' },
          { path: 'archive/b.md', title: 'B', status: 'draft', tags: [], updatedAt: '2026-01-02T00:00:00Z' },
        ],
      }),
    );
    const kb = await hosted();
    const out = await kb.list({ prefix: 'notes/' });
    expect(out.notes).toHaveLength(1);
    expect(out.notes[0].path).toBe('notes/a.md');
    await kb.close();
  });

  it('maps cloud error statuses to typed errors', async () => {
    installFetch(() => json({ error: 'not_found', message: 'no note' }, 404));
    let kb = await hosted();
    await expect(kb.read('missing.md')).rejects.toBeInstanceOf(KbNotFoundError);
    await kb.close();

    installFetch(() => json({ error: 'stale', message: 'changed' }, 409));
    kb = await hosted();
    await expect(kb.update('a.md', { content: 'x', expectedHash: 'old' })).rejects.toBeInstanceOf(
      KbConflictError,
    );
    await kb.close();

    installFetch(() => json({ error: 'missing scope', message: 'denied' }, 403));
    kb = await hosted();
    await expect(kb.write('a.md', { title: 'A', content: 'x' })).rejects.toBeInstanceOf(
      KbAclDeniedError,
    );
    await kb.close();
  });

  it('searches, links and backlinks via the cloud index', async () => {
    installFetch((c) => {
      if (c.url.includes('/v1/vault/search')) {
        return json({ results: [{ path: 'notes/a.md', title: 'A', author: 'bot', status: 'draft', score: 0.5, excerpt: 'JWT…' }], warnings: [] });
      }
      if (c.url.includes('/v1/vault/links')) return json({ path: 'notes/a.md', links: [{ path: 'notes/b.md', title: 'B' }] });
      if (c.url.includes('/v1/vault/backlinks')) return json({ path: 'notes/b.md', backlinks: [{ path: 'notes/a.md', title: 'A' }] });
      return json({});
    });
    const kb = await hosted();

    const s = await kb.search('jwt', { limit: 5, filters: { status: 'draft', tags: ['auth'] } });
    expect(calls[0].url).toContain('/v1/vault/search?q=jwt');
    expect(calls[0].url).toContain('limit=5');
    expect(calls[0].url).toContain('status=draft');
    expect(calls[0].url).toContain('tag=auth');
    expect(s.results[0].path).toBe('notes/a.md');

    const l = await kb.links('notes/a.md');
    expect(l.links).toEqual([{ path: 'notes/b.md', title: 'B' }]);

    const b = await kb.backlinks('notes/b.md');
    expect(b.backlinks).toEqual([{ path: 'notes/a.md', title: 'A' }]);
    await kb.close();
  });
});
