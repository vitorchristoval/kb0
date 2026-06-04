import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { writeTool } from './write.js';
import { searchTool } from './search.js';
import { createTestContext, type TestCtx } from './test-helpers.js';

describe('vault.search', () => {
  let t: TestCtx;

  beforeEach(async () => {
    t = await createTestContext();
    await writeTool.handler(
      { path: 'notes/rust.md', title: 'Rust Guide', content: 'Rust is a systems language focused on safety.', status: 'draft', tags: ['systems'] },
      t.ctx,
    );
    await writeTool.handler(
      { path: 'notes/go.md', title: 'Go Guide', content: 'Go is a compiled statically typed language.', status: 'draft', tags: ['backend'] },
      t.ctx,
    );
  });

  afterEach(async () => { await t.cleanup(); });

  it('keyword search returns relevant result', async () => {
    const out = await searchTool.handler(
      { query: 'Rust safety', mode: 'keyword', ranking: 'rrf', limit: 10 },
      t.ctx,
    );
    expect(out.results.length).toBeGreaterThan(0);
    expect(out.results[0].title).toBe('Rust Guide');
  });

  it('results include excerpt', async () => {
    const out = await searchTool.handler(
      { query: 'systems language', mode: 'keyword', ranking: 'rrf', limit: 10 },
      t.ctx,
    );
    expect(out.results[0].excerpt).toBeTruthy();
  });

  it('hybrid mode returns results', async () => {
    const out = await searchTool.handler(
      { query: 'programming language', mode: 'hybrid', ranking: 'rrf', limit: 10 },
      t.ctx,
    );
    expect(out.results.length).toBeGreaterThan(0);
  });

  it('auditResult records returned paths and count for the success log', () => {
    const out = {
      results: [
        { path: 'notes/rust.md', title: 'A', author: 'human', status: 'draft', score: 0.9, excerpt: 'x' },
        { path: 'notes/go.md', title: 'B', author: 'human', status: 'draft', score: 0.5, excerpt: 'y' },
      ],
      warnings: [],
    };
    expect(searchTool.auditResult?.(out)).toEqual({
      result_paths: ['notes/rust.md', 'notes/go.md'],
      result_count: 2,
    });
  });

  it('format lists results with title path and score', () => {
    const out = {
      results: [{ path: 'a.md', title: 'A', author: 'human', status: 'draft', score: 0.9, excerpt: 'snippet' }],
      warnings: [],
    };
    const text = searchTool.format(out);
    expect(text).toContain('A');
    expect(text).toContain('a.md');
    expect(text).toContain('snippet');
  });
});
