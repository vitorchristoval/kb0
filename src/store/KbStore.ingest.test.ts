import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeEmbeddingProvider } from '../embedding/FakeEmbeddingProvider.js';
import type { GitAdapter } from '../git/GitAdapter.js';
import { KbIndex } from '../index/KbIndex.js';
import { parseNote } from '../schema/frontmatter.js';
import { KbStore } from './KbStore.js';

function mockGit(): GitAdapter {
  return {
    init: vi.fn(),
    add: vi.fn(),
    remove: vi.fn(),
    commit: vi.fn().mockResolvedValue('a'.repeat(40)),
    addAndCommit: vi.fn().mockResolvedValue('a'.repeat(40)),
    removeAndCommit: vi.fn().mockResolvedValue('a'.repeat(40)),
    log: vi.fn().mockResolvedValue([]),
  } as unknown as GitAdapter;
}

describe('KbStore.ingest', () => {
  let tmpDir: string;
  let store: KbStore;
  let index: KbIndex;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'kb0-ingest-'));
    index = new KbIndex({
      dbPath: join(tmpDir, '.vault-index', 'index.db'),
      vaultDir: tmpDir,
      embedding: new FakeEmbeddingProvider(8),
    });
    store = new KbStore(tmpDir, mockGit(), { index });
  });

  afterEach(async () => {
    index.close();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('stamps a plain markdown file with author: human', async () => {
    await writeFile(join(tmpDir, 'manual.md'), '# Manual Note\n\nDropped in by hand.', 'utf-8');
    await store.ingest('manual.md');

    const note = await store.read('manual.md');
    expect(note.frontmatter.author).toBe('human');
    expect(note.frontmatter.title).toBe('Manual Note');
    expect(note.frontmatter.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('makes a manually-added file searchable', async () => {
    await writeFile(join(tmpDir, 'searchable.md'), '# Searchable\n\nfindable content here', 'utf-8');
    await store.ingest('searchable.md');

    const result = await index.search('findable', { mode: 'keyword' });
    expect(result.results).toHaveLength(1);
    expect(result.results[0].path).toBe('searchable.md');
  });

  it('persists the stamp to disk so the id is stable across ingests', async () => {
    await writeFile(join(tmpDir, 'stable.md'), 'no frontmatter', 'utf-8');
    await store.ingest('stable.md');
    const firstId = parseNote(await readFile(join(tmpDir, 'stable.md'), 'utf-8')).frontmatter.id;

    await store.ingest('stable.md');
    const secondId = parseNote(await readFile(join(tmpDir, 'stable.md'), 'utf-8')).frontmatter.id;

    expect(secondId).toBe(firstId);
  });

  it('leaves an already-valid file unchanged on disk', async () => {
    await store.write('valid.md', { title: 'Valid', author: 'human', content: 'body' });
    const before = await readFile(join(tmpDir, 'valid.md'), 'utf-8');

    await store.ingest('valid.md');
    const after = await readFile(join(tmpDir, 'valid.md'), 'utf-8');

    expect(after).toBe(before);
  });

  it('throws KbNotFoundError for a missing file', async () => {
    await expect(store.ingest('ghost.md')).rejects.toThrow();
  });
});
