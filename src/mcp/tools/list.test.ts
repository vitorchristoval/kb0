import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { writeTool } from './write.js';
import { listTool } from './list.js';
import { createTestContext, type TestCtx } from './test-helpers.js';

describe('vault.list', () => {
  let t: TestCtx;

  beforeEach(async () => {
    t = await createTestContext();
    await writeTool.handler(
      { path: 'notes/a.md', title: 'Alpha', content: 'c', status: 'draft', tags: ['tag1'] },
      t.ctx,
    );
    await writeTool.handler(
      { path: 'notes/b.md', title: 'Beta', content: 'c', status: 'reviewed', tags: ['tag2'] },
      t.ctx,
    );
    await writeTool.handler(
      { path: 'inbox/c.md', title: 'Gamma', content: 'c', status: 'draft', tags: ['tag1'] },
      t.ctx,
    );
  });

  afterEach(async () => { await t.cleanup(); });

  it('returns all notes when no filters', async () => {
    const out = await listTool.handler({ limit: 50 }, t.ctx);
    expect(out.total).toBe(3);
  });

  it('filters by prefix', async () => {
    const out = await listTool.handler({ prefix: 'notes/', limit: 50 }, t.ctx);
    expect(out.total).toBe(2);
    expect(out.notes.every((n) => n.path.startsWith('notes/'))).toBe(true);
  });

  it('filters by tag', async () => {
    const out = await listTool.handler({ tag: 'tag1', limit: 50 }, t.ctx);
    expect(out.total).toBe(2);
  });

  it('filters by status', async () => {
    const out = await listTool.handler({ status: 'reviewed', limit: 50 }, t.ctx);
    expect(out.total).toBe(1);
    expect(out.notes[0].title).toBe('Beta');
  });

  it('results include tags', async () => {
    const out = await listTool.handler({ limit: 50 }, t.ctx);
    const alpha = out.notes.find((n) => n.title === 'Alpha');
    expect(alpha?.tags).toContain('tag1');
  });
});
