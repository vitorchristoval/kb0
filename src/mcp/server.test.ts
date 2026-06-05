import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KbMcpServer, type KbMcpServerConfig } from './server.js';
import type { Tool } from './tool-base.js';
import { createTestContext, type TestCtx } from './tools/test-helpers.js';

describe('KbMcpServer tool injection (Seam 2)', () => {
  let t: TestCtx;
  beforeEach(async () => {
    t = await createTestContext();
  });
  afterEach(async () => {
    await t.cleanup();
  });

  function baseConfig(): KbMcpServerConfig {
    return {
      store: t.ctx.store,
      index: t.ctx.index,
      policy: t.ctx.policy,
      agentIdentity: t.ctx.agentIdentity,
      vaultDir: t.ctx.vaultDir,
    };
  }

  it('registers injected tools instead of the defaults', () => {
    const spy: Tool = { name: 'test.spy', register: vi.fn() };
    const server = new KbMcpServer({ ...baseConfig(), tools: [spy] });
    expect(server).toBeDefined();
    expect(spy.register).toHaveBeenCalledTimes(1);
  });

  it('falls back to the built-in tools when none are injected', () => {
    expect(() => new KbMcpServer(baseConfig())).not.toThrow();
  });
});
