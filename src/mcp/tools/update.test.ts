import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { KbConflictError, KbNotFoundError } from '../../errors.js';
import { writeTool } from './write.js';
import { readTool } from './read.js';
import { updateTool } from './update.js';
import { createTestContext, type TestCtx } from './test-helpers.js';

describe('vault.update', () => {
  let t: TestCtx;
  beforeEach(async () => { t = await createTestContext(); });
  afterEach(async () => { await t.cleanup(); });

  it('updates content and returns new hash', async () => {
    await writeTool.handler(
      { path: 'notes/u.md', title: 'U', content: 'v1', status: 'draft', tags: [] },
      t.ctx,
    );
    const { hash } = await readTool.handler({ path: 'notes/u.md' }, t.ctx);

    const out = await updateTool.handler(
      { path: 'notes/u.md', expectedHash: hash, content: 'v2' },
      t.ctx,
    );
    expect(out.hash).toHaveLength(64);
    expect(out.hash).not.toBe(hash);
  });

  it('always sets author from agentIdentity', async () => {
    await writeTool.handler(
      { path: 'notes/a.md', title: 'A', content: 'v1', status: 'draft', tags: [] },
      t.ctx,
    );
    const { hash } = await readTool.handler({ path: 'notes/a.md' }, t.ctx);
    await updateTool.handler({ path: 'notes/a.md', expectedHash: hash, content: 'v2' }, t.ctx);

    const note = await t.ctx.store.read('notes/a.md');
    expect(note.frontmatter.author).toBe('agent:test-agent');
  });

  it('throws KbConflictError on wrong hash — detail contains full actual hash', async () => {
    await writeTool.handler(
      { path: 'notes/c.md', title: 'C', content: 'v1', status: 'draft', tags: [] },
      t.ctx,
    );
    const err = await updateTool.handler(
      { path: 'notes/c.md', expectedHash: 'e'.repeat(64), content: 'v2' },
      t.ctx,
    ).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(KbConflictError);
    const conflict = err as KbConflictError;
    expect(conflict.actual).toHaveLength(64);
    expect(conflict.expected).toBe('e'.repeat(64));
  });

  it('throws KbNotFoundError for missing note', async () => {
    await expect(
      updateTool.handler({ path: 'ghost.md', expectedHash: 'e'.repeat(64), content: 'x' }, t.ctx),
    ).rejects.toThrow(KbNotFoundError);
  });

  it('format shows full 64-char hash', () => {
    const out = { path: 'p.md', hash: 'f'.repeat(64) };
    expect(updateTool.format(out)).toContain('f'.repeat(64));
  });
});
