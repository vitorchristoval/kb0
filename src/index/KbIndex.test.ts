import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FakeEmbeddingProvider } from '../embedding/FakeEmbeddingProvider.js';
import { buildFrontmatter, parseNote, serializeNote } from '../schema/frontmatter.js';
import { KbIndex } from './KbIndex.js';

async function createNote(
  vaultDir: string,
  relPath: string,
  opts: { title: string; content: string; author?: string },
): Promise<void> {
  const fm = buildFrontmatter({ title: opts.title, author: opts.author ?? 'human' });
  const raw = serializeNote(opts.content, fm);
  const absPath = join(vaultDir, relPath);
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, raw, 'utf-8');
}

describe('KbIndex', () => {
  let tmpDir: string;
  let index: KbIndex;
  let embedding: FakeEmbeddingProvider;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'kb0-idx-'));
    embedding = new FakeEmbeddingProvider(8);
    index = new KbIndex({
      dbPath: join(tmpDir, '.vault-index', 'index.db'),
      vaultDir: tmpDir,
      embedding,
    });
  });

  afterEach(async () => {
    index.close();
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe('indexNote', () => {
    it('indexes a note so it appears in keyword search', async () => {
      await createNote(tmpDir, 'notes/ts.md', {
        title: 'TypeScript Guide',
        content: 'TypeScript is a typed superset of JavaScript.',
      });
      await index.indexNote('notes/ts.md');

      const result = await index.search('TypeScript', { mode: 'keyword' });
      expect(result.results).toHaveLength(1);
      expect(result.results[0].title).toBe('TypeScript Guide');
    });

    it('indexes tags and links', async () => {
      await createNote(tmpDir, 'notes/linked.md', {
        title: 'Linked',
        content: 'See [[Architecture]] and [[API]]. Tags: #backend #api',
      });
      await index.indexNote('notes/linked.md');

      const result = await index.search('Linked', { mode: 'keyword' });
      expect(result.results).toHaveLength(1);
    });

    it('updates an existing note on re-index', async () => {
      await createNote(tmpDir, 'notes/edit.md', {
        title: 'Original Title',
        content: 'original content',
      });
      await index.indexNote('notes/edit.md');

      // Overwrite preserving the same frontmatter ID (realistic editor save)
      const existing = await readFile(join(tmpDir, 'notes/edit.md'), 'utf-8');
      const { frontmatter } = parseNote(existing);
      const updatedFm = buildFrontmatter({
        ...frontmatter,
        title: 'Updated Title',
        updated: new Date().toISOString(),
      });
      await writeFile(join(tmpDir, 'notes/edit.md'), serializeNote('updated content', updatedFm), 'utf-8');
      await index.indexNote('notes/edit.md');

      const result = await index.search('Updated', { mode: 'keyword' });
      expect(result.results[0].title).toBe('Updated Title');
    });

    it('handles a file re-created at the same path with a new UUID', async () => {
      await createNote(tmpDir, 'notes/recreate.md', { title: 'Old Note', content: 'old' });
      await index.indexNote('notes/recreate.md');

      // Overwrite with completely new frontmatter (new UUID — simulates delete + recreate)
      await createNote(tmpDir, 'notes/recreate.md', { title: 'New Note', content: 'new' });
      await index.indexNote('notes/recreate.md');

      const result = await index.search('New Note', { mode: 'keyword' });
      expect(result.results[0].title).toBe('New Note');
      const oldResult = await index.search('Old Note', { mode: 'keyword' });
      expect(oldResult.results).toHaveLength(0);
    });
  });

  describe('deleteNote', () => {
    it('removes the note from search results', async () => {
      await createNote(tmpDir, 'notes/del.md', {
        title: 'Delete Me',
        content: 'this note will be deleted',
      });
      await index.indexNote('notes/del.md');
      index.deleteNote('notes/del.md');

      const result = await index.search('Delete Me', { mode: 'keyword' });
      expect(result.results).toHaveLength(0);
    });

    it('is a no-op when the note does not exist in the index', () => {
      expect(() => index.deleteNote('nonexistent.md')).not.toThrow();
    });
  });

  describe('search', () => {
    beforeEach(async () => {
      await createNote(tmpDir, 'notes/a.md', {
        title: 'Rust Programming',
        content: 'Rust is a systems programming language focused on safety.',
      });
      await createNote(tmpDir, 'notes/b.md', {
        title: 'Go Programming',
        content: 'Go is a statically typed compiled language.',
      });
      await createNote(tmpDir, 'notes/c.md', {
        title: 'Python Scripting',
        content: 'Python is a dynamic scripting language.',
      });
      await index.indexNote('notes/a.md');
      await index.indexNote('notes/b.md');
      await index.indexNote('notes/c.md');
    });

    it('keyword search returns relevant results', async () => {
      const result = await index.search('Rust safety', { mode: 'keyword' });
      expect(result.results[0].title).toBe('Rust Programming');
    });

    it('semantic search returns results', async () => {
      const result = await index.search('compiled statically typed', { mode: 'semantic' });
      expect(result.results.length).toBeGreaterThan(0);
    });

    it('hybrid rrf search returns results', async () => {
      const result = await index.search('programming language', { mode: 'hybrid', ranking: 'rrf' });
      expect(result.results.length).toBeGreaterThan(0);
    });

    it('hybrid weighted search returns results', async () => {
      const result = await index.search('programming language', {
        mode: 'hybrid',
        ranking: 'weighted',
        alpha: 0.5,
      });
      expect(result.results.length).toBeGreaterThan(0);
    });

    it('respects the limit option', async () => {
      const result = await index.search('programming', { mode: 'keyword', limit: 1 });
      expect(result.results).toHaveLength(1);
    });

    it('returns no warnings when all embeddings are fresh', async () => {
      const result = await index.search('language', { mode: 'hybrid' });
      expect(result.warnings).toHaveLength(0);
    });

    it('returns SEMANTIC_DEGRADED warning when stale embeddings exist', async () => {
      // Swap to a different embedding provider to trigger stale detection
      const differentEmbedding = new FakeEmbeddingProvider(16);
      const index2 = new KbIndex({
        dbPath: join(tmpDir, '.vault-index', 'index.db'),
        vaultDir: tmpDir,
        embedding: differentEmbedding,
      });
      const result = await index2.search('language', { mode: 'hybrid' });
      expect(result.warnings).toContain('SEMANTIC_DEGRADED');
      index2.close();
    });
  });

  describe('filterNeedsIndexing', () => {
    it('returns all paths when nothing is indexed yet', async () => {
      await createNote(tmpDir, 'notes/new.md', { title: 'New', content: 'content' });
      const paths = await index.filterNeedsIndexing(['notes/new.md']);
      expect(paths).toContain('notes/new.md');
    });

    it('excludes already-indexed files with no mtime change', async () => {
      await createNote(tmpDir, 'notes/indexed.md', { title: 'Indexed', content: 'content' });
      await index.indexNote('notes/indexed.md');
      const paths = await index.filterNeedsIndexing(['notes/indexed.md']);
      // mtime should not be newer than last_indexed_at since no changes were made
      expect(paths).toHaveLength(0);
    });
  });

  describe('rebuild', () => {
    it('clears all indexed data', async () => {
      await createNote(tmpDir, 'notes/clear.md', { title: 'Clear', content: 'content' });
      await index.indexNote('notes/clear.md');
      index.rebuild();

      const result = await index.search('Clear', { mode: 'keyword' });
      expect(result.results).toHaveLength(0);
    });
  });
});
