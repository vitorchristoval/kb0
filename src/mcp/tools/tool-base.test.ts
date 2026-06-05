import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { KbError, KbNotFoundError } from '../../errors.js';
import { defineTool, type OperationEvent, type ToolContext } from '../tool-base.js';
import { createTestContext, type TestCtx } from './test-helpers.js';

// Capture the callback the tool registers, so we can drive the full
// register → emit path without spinning up a real MCP server.
function registerAndGetCallback(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tool: { register: (server: any, ctx: ToolContext) => void },
  ctx: ToolContext,
): (args: Record<string, unknown>) => Promise<unknown> {
  let cb: ((args: Record<string, unknown>) => Promise<unknown>) | undefined;
  const fakeServer = {
    tool: (_n: string, _d: string, _s: unknown, fn: typeof cb) => {
      cb = fn;
    },
  };
  tool.register(fakeServer, ctx);
  if (!cb) throw new Error('tool did not register a callback');
  return cb;
}

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

  it('emits a content-free OperationEvent to onEvent on success', async () => {
    const events: OperationEvent[] = [];
    const ctx: ToolContext = { ...t.ctx, onEvent: (e) => events.push(e) };
    const tool = defineTool({
      name: 'test.read',
      description: 'test',
      inputSchema: z.object({ path: z.string() }),
      audit: (input) => ({ path: input.path }),
      auditResult: () => ({ result_count: 2 }),
      handler: async () => ({}),
      format: () => '',
    });

    const cb = registerAndGetCallback(tool, ctx);
    await cb({ path: 'notes/a.md' });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      tool: 'test.read',
      agent: 'test-agent',
      ok: true,
      mutates: false,
      fields: { path: 'notes/a.md', result_count: 2 },
    });
    expect(events[0].errorCode).toBeUndefined();
    expect(typeof events[0].ts).toBe('string');
  });

  it('emits ok=false with the error code on a KbError, carrying input fields', async () => {
    const events: OperationEvent[] = [];
    const ctx: ToolContext = { ...t.ctx, onEvent: (e) => events.push(e) };
    const tool = defineTool({
      name: 'test.read',
      description: 'test',
      inputSchema: z.object({ path: z.string() }),
      audit: (input) => ({ path: input.path }),
      handler: async () => {
        throw new KbNotFoundError('notes/ghost.md');
      },
      format: () => '',
    });

    const cb = registerAndGetCallback(tool, ctx);
    await cb({ path: 'notes/ghost.md' });

    expect(events[0]).toMatchObject({
      ok: false,
      errorCode: 'NOT_FOUND',
      fields: { path: 'notes/ghost.md' },
    });
  });

  it('marks mutates:true for tools declared as mutating', async () => {
    const events: OperationEvent[] = [];
    const ctx: ToolContext = { ...t.ctx, onEvent: (e) => events.push(e) };
    const tool = defineTool({
      name: 'test.write',
      description: 'test',
      inputSchema: z.object({ path: z.string() }),
      mutates: true,
      audit: (input) => ({ path: input.path }),
      handler: async () => ({}),
      format: () => '',
    });

    const cb = registerAndGetCallback(tool, ctx);
    await cb({ path: 'notes/a.md' });

    expect(events[0].mutates).toBe(true);
  });

  it('does nothing when no onEvent sink is set (defaulted off)', async () => {
    const tool = defineTool({
      name: 'test.read',
      description: 'test',
      inputSchema: z.object({ path: z.string() }),
      handler: async () => ({}),
      format: () => '',
    });

    // t.ctx has no onEvent — the callback must still resolve normally.
    const cb = registerAndGetCallback(tool, t.ctx);
    await expect(cb({ path: 'notes/a.md' })).resolves.toBeDefined();
  });

  it('KbError subclasses are catchable as KbError', () => {
    const err = new KbNotFoundError('notes/x.md');
    expect(err).toBeInstanceOf(KbError);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.detail).toMatchObject({ path: 'notes/x.md' });
  });
});
