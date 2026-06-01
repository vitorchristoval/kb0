import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { writeTool } from './write.js';
import { statusTool } from './status.js';
import { createTestContext, type TestCtx } from './test-helpers.js';

describe('vault.status', () => {
  let t: TestCtx;
  beforeEach(async () => { t = await createTestContext(); });
  afterEach(async () => { await t.cleanup(); });

  it('returns vault path and agent identity', async () => {
    const out = await statusTool.handler({}, t.ctx);
    expect(out.vault).toBe(t.ctx.vaultDir);
    expect(out.agent).toBe('test-agent');
  });

  it('returns 0 notes for empty vault', async () => {
    const out = await statusTool.handler({}, t.ctx);
    expect(out.notes).toBe(0);
  });

  it('returns correct note count after writing', async () => {
    await writeTool.handler(
      { path: 'notes/a.md', title: 'A', content: 'c', status: 'draft', tags: [] },
      t.ctx,
    );
    await writeTool.handler(
      { path: 'notes/b.md', title: 'B', content: 'c', status: 'draft', tags: [] },
      t.ctx,
    );
    const out = await statusTool.handler({}, t.ctx);
    expect(out.notes).toBe(2);
  });

  it('reflects permissive policy_mode in test context', async () => {
    const out = await statusTool.handler({}, t.ctx);
    expect(out.policy_mode).toBe('permissive');
    expect(out.policy_file).toBe(false);
  });

  it('includes kb0 version and embedding model', async () => {
    const out = await statusTool.handler({}, t.ctx);
    expect(out.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(out.embedding_model).toBe('fake-v1');
  });

  it('format includes policy_mode and note count', () => {
    const out = {
      vault: '/vault', agent: 'a', version: '0.1.0', notes: 5,
      stale_embeddings: 0, embedding_model: 'fake-v1',
      policy_mode: 'enforced' as const, policy_file: true, log_file: '/log',
    };
    const text = statusTool.format(out);
    expect(text).toContain('enforced');
    expect(text).toContain('5');
  });
});
