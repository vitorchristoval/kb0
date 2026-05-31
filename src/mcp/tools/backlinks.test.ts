import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { writeTool } from './write.js';
import { backlinksTool } from './backlinks.js';
import { createTestContext, type TestCtx } from './test-helpers.js';

describe('vault.backlinks', () => {
  let t: TestCtx;

  beforeEach(async () => {
    t = await createTestContext();
    await writeTool.handler(
      { path: 'notes/target.md', title: 'Target', content: 'I am the target.', status: 'draft', tags: [] },
      t.ctx,
    );
    await writeTool.handler(
      { path: 'notes/source.md', title: 'Source', content: 'See [[notes/target.md]] for details.', status: 'draft', tags: [] },
      t.ctx,
    );
  });

  afterEach(async () => { await t.cleanup(); });

  it('returns notes that link to the target', async () => {
    const out = await backlinksTool.handler({ path: 'notes/target.md' }, t.ctx);
    expect(out.backlinks).toHaveLength(1);
    expect(out.backlinks[0].title).toBe('Source');
    expect(out.backlinks[0].path).toBe('notes/source.md');
  });

  it('returns empty array when no backlinks', async () => {
    const out = await backlinksTool.handler({ path: 'notes/source.md' }, t.ctx);
    expect(out.backlinks).toHaveLength(0);
  });
});
