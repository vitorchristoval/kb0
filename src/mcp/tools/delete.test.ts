import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { KbNotFoundError } from '../../errors.js';
import { writeTool } from './write.js';
import { readTool } from './read.js';
import { deleteTool } from './delete.js';
import { createTestContext, type TestCtx } from './test-helpers.js';

describe('vault.delete', () => {
  let t: TestCtx;
  beforeEach(async () => { t = await createTestContext(); });
  afterEach(async () => { await t.cleanup(); });

  it('deletes the note so it can no longer be read', async () => {
    await writeTool.handler(
      { path: 'notes/del.md', title: 'Del', content: 'bye', status: 'draft', tags: [] },
      t.ctx,
    );
    await deleteTool.handler({ path: 'notes/del.md' }, t.ctx);
    await expect(readTool.handler({ path: 'notes/del.md' }, t.ctx)).rejects.toThrow(KbNotFoundError);
  });

  it('throws KbNotFoundError for missing note', async () => {
    await expect(deleteTool.handler({ path: 'ghost.md' }, t.ctx)).rejects.toThrow(KbNotFoundError);
  });
});
