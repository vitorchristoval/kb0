import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { KbError, KbNotFoundError } from '../../errors.js';
import { writeTool } from './write.js';
import { readTool } from './read.js';
import { createTestContext, type TestCtx } from './test-helpers.js';

describe('vault.write', () => {
  let t: TestCtx;
  beforeEach(async () => { t = await createTestContext(); });
  afterEach(async () => { await t.cleanup(); });

  it('creates a note and returns hash + id', async () => {
    const out = await writeTool.handler(
      { path: 'notes/test.md', title: 'Test', content: 'Body text', status: 'draft', tags: [] },
      t.ctx,
    );
    expect(out.hash).toHaveLength(64);
    expect(out.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(out.path).toBe('notes/test.md');
  });

  it('always sets author from agentIdentity (not caller-supplied)', async () => {
    await writeTool.handler(
      { path: 'notes/prov.md', title: 'T', content: 'C', status: 'draft', tags: [] },
      t.ctx,
    );
    const note = await t.ctx.store.read('notes/prov.md');
    expect(note.frontmatter.author).toBe('agent:test-agent');
  });

  it('rejects creating a note that already exists', async () => {
    await writeTool.handler(
      { path: 'notes/dup.md', title: 'Dup', content: 'v1', status: 'draft', tags: [] },
      t.ctx,
    );
    await expect(
      writeTool.handler(
        { path: 'notes/dup.md', title: 'Dup2', content: 'v2', status: 'draft', tags: [] },
        t.ctx,
      ),
    ).rejects.toThrow(KbError);
  });

  it('makes the note findable via read', async () => {
    await writeTool.handler(
      { path: 'notes/readable.md', title: 'Readable', content: 'hello world', status: 'draft', tags: [] },
      t.ctx,
    );
    const note = await readTool.handler({ path: 'notes/readable.md' }, t.ctx);
    expect(note.content).toBe('hello world');
  });

  it('format includes full 64-char hash', () => {
    const out = { path: 'p.md', hash: 'a'.repeat(64), id: 'uuid-here' };
    expect(writeTool.format(out)).toContain('a'.repeat(64));
  });
});
