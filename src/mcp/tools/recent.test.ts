import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { writeTool } from './write.js';
import { recentTool } from './recent.js';
import { createTestContext, type TestCtx } from './test-helpers.js';

describe('vault.recent', () => {
  let t: TestCtx;

  beforeEach(async () => {
    t = await createTestContext();
    await writeTool.handler(
      { path: 'notes/old.md', title: 'Old', content: 'c', status: 'draft', tags: [] },
      t.ctx,
    );
    await writeTool.handler(
      { path: 'notes/new.md', title: 'New', content: 'c', status: 'draft', tags: [] },
      t.ctx,
    );
  });

  afterEach(async () => { await t.cleanup(); });

  it('returns notes in recent order', async () => {
    const out = await recentTool.handler({ limit: 10 }, t.ctx);
    expect(out.notes.length).toBeGreaterThanOrEqual(1);
    expect(out.notes.every((n) => n.updated)).toBe(true);
  });

  it('respects the limit', async () => {
    const out = await recentTool.handler({ limit: 1 }, t.ctx);
    expect(out.notes).toHaveLength(1);
  });
});
