import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { writeTool } from './write.js';
import { linksTool } from './links.js';
import { createTestContext, type TestCtx } from './test-helpers.js';

describe('vault.links', () => {
  let t: TestCtx;

  beforeEach(async () => {
    t = await createTestContext();
    await writeTool.handler(
      { path: 'notes/dest.md', title: 'Destination', content: 'target note', status: 'draft', tags: [] },
      t.ctx,
    );
    await writeTool.handler(
      { path: 'notes/src.md', title: 'Source', content: 'Links to [[notes/dest.md]] and [[missing.md]].', status: 'draft', tags: [] },
      t.ctx,
    );
  });

  afterEach(async () => { await t.cleanup(); });

  it('returns outgoing links with resolved titles', async () => {
    const out = await linksTool.handler({ path: 'notes/src.md' }, t.ctx);
    expect(out.links).toHaveLength(2);
    const dest = out.links.find((l) => l.path === 'notes/dest.md');
    expect(dest?.title).toBe('Destination');
  });

  it('falls back to path as title for unindexed targets', async () => {
    const out = await linksTool.handler({ path: 'notes/src.md' }, t.ctx);
    const missing = out.links.find((l) => l.path === 'missing.md');
    expect(missing?.title).toBe('missing.md');
  });

  it('returns empty array for a note with no links', async () => {
    const out = await linksTool.handler({ path: 'notes/dest.md' }, t.ctx);
    expect(out.links).toHaveLength(0);
  });
});
