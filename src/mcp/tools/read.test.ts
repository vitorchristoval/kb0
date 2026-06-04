import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { KbNotFoundError } from '../../errors.js';
import { writeTool } from './write.js';
import { readTool } from './read.js';
import { createTestContext, type TestCtx } from './test-helpers.js';

describe('vault.read', () => {
  let t: TestCtx;
  beforeEach(async () => { t = await createTestContext(); });
  afterEach(async () => { await t.cleanup(); });

  it('returns content, hash, and frontmatter', async () => {
    await writeTool.handler(
      { path: 'notes/r.md', title: 'Read Me', content: 'Hello', status: 'draft', tags: ['x'] },
      t.ctx,
    );
    const out = await readTool.handler({ path: 'notes/r.md' }, t.ctx);
    expect(out.content).toBe('Hello');
    expect(out.hash).toHaveLength(64);
    expect(out.frontmatter.title).toBe('Read Me');
    expect(out.frontmatter.tags).toEqual(['x']);
    expect(out.frontmatter.author).toBe('agent:test-agent');
  });

  it('audit records the path so reads are attributable in the log', () => {
    expect(readTool.audit?.({ path: 'notes/r.md' })).toEqual({ path: 'notes/r.md' });
  });

  it('throws KbNotFoundError for missing note', async () => {
    await expect(readTool.handler({ path: 'ghost.md' }, t.ctx)).rejects.toThrow(KbNotFoundError);
  });

  it('format includes hash and metadata prefix then separator then content', () => {
    const hash = 'b'.repeat(64);
    const out = {
      path: 'p.md',
      hash,
      content: 'body here',
      frontmatter: { id: 'id', title: 'T', author: 'human', status: 'draft', tags: [], created: 'c', updated: 'u' },
    };
    const text = readTool.format(out);
    expect(text).toContain(hash);
    expect(text).toContain('---');
    expect(text).toContain('body here');
    expect(text).not.toContain('---\nbody'); // separator has blank lines around it
  });
});
