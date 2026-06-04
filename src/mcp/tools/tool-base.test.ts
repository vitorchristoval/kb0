import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { KbError, KbNotFoundError } from '../../errors.js';
import { defineTool } from '../tool-base.js';
import { createTestContext, type TestCtx } from './test-helpers.js';

describe('defineTool', () => {
  let t: TestCtx;
  beforeEach(async () => { t = await createTestContext(); });
  afterEach(async () => { await t.cleanup(); });

  it('exposes handler and format directly for testing', async () => {
    const tool = defineTool({
      name: 'test.tool',
      description: 'test',
      inputSchema: z.object({ x: z.string() }),
      handler: async (input) => ({ result: input.x.toUpperCase() }),
      format: (out) => `Result: ${out.result}`,
    });

    const out = await tool.handler({ x: 'hello' }, t.ctx);
    expect(out.result).toBe('HELLO');
    expect(tool.format(out)).toBe('Result: HELLO');
  });

  it('unexpected errors propagate (not swallowed)', async () => {
    const tool = defineTool({
      name: 'test.throws',
      description: 'test',
      inputSchema: z.object({}),
      handler: async () => { throw new TypeError('internal bug'); },
      format: () => '',
    });

    await expect(tool.handler({}, t.ctx)).rejects.toThrow(TypeError);
  });

  it('exposes the audit hook so the wrapper can log content-free fields', () => {
    const tool = defineTool({
      name: 'test.audit',
      description: 'test',
      inputSchema: z.object({ path: z.string() }),
      audit: (input) => ({ path: input.path }),
      handler: async () => ({}),
      format: () => '',
    });

    expect(tool.audit?.({ path: 'notes/a.md' })).toEqual({ path: 'notes/a.md' });
  });

  it('audit is undefined when no hook is declared', () => {
    const tool = defineTool({
      name: 'test.no-audit',
      description: 'test',
      inputSchema: z.object({}),
      handler: async () => ({}),
      format: () => '',
    });

    expect(tool.audit).toBeUndefined();
  });

  it('KbError subclasses are catchable as KbError', () => {
    const err = new KbNotFoundError('notes/x.md');
    expect(err).toBeInstanceOf(KbError);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.detail).toMatchObject({ path: 'notes/x.md' });
  });
});
