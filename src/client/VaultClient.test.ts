import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  connect: vi.fn(),
  callTool: vi.fn(),
  close: vi.fn(),
}));

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: vi.fn(() => ({ connect: h.connect, callTool: h.callTool, close: h.close })),
}));
vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: vi.fn(() => ({})),
}));

import { VaultClient } from './VaultClient.js';
import { KbAclDeniedError, KbConflictError, KbNotFoundError } from './errors.js';

async function connected(): Promise<VaultClient> {
  h.connect.mockResolvedValue(undefined);
  return VaultClient.connect({ vault: './v', agent: 'bot' });
}

describe('VaultClient', () => {
  beforeEach(() => {
    h.connect.mockReset();
    h.callTool.mockReset();
    h.close.mockReset();
  });

  it('write stamps default status/tags and returns structured content', async () => {
    h.callTool.mockResolvedValue({ structuredContent: { path: 'notes/a.md', hash: 'h', id: 'id' } });
    const kb = await connected();
    const res = await kb.write('notes/a.md', { title: 'A', content: 'x' });

    expect(h.callTool).toHaveBeenCalledWith({
      name: 'vault.write',
      arguments: { path: 'notes/a.md', title: 'A', content: 'x', status: 'draft', tags: [] },
    });
    expect(res).toEqual({ path: 'notes/a.md', hash: 'h', id: 'id' });
  });

  it('search applies hybrid/rrf/limit defaults', async () => {
    h.callTool.mockResolvedValue({ structuredContent: { results: [], warnings: [] } });
    const kb = await connected();
    await kb.search('q');

    expect(h.callTool).toHaveBeenCalledWith({
      name: 'vault.search',
      arguments: { query: 'q', mode: 'hybrid', ranking: 'rrf', limit: 10 },
    });
  });

  it('update only sends optional fields that were provided', async () => {
    h.callTool.mockResolvedValue({ structuredContent: { path: 'p', hash: 'h2' } });
    const kb = await connected();
    await kb.update('p', { content: 'c', expectedHash: 'old', status: 'reviewed' });

    expect(h.callTool).toHaveBeenCalledWith({
      name: 'vault.update',
      arguments: { path: 'p', content: 'c', expectedHash: 'old', status: 'reviewed' },
    });
  });

  it('maps "Not found" to KbNotFoundError', async () => {
    h.callTool.mockResolvedValue({ isError: true, content: [{ type: 'text', text: 'Not found: `x`' }] });
    const kb = await connected();
    await expect(kb.read('x')).rejects.toBeInstanceOf(KbNotFoundError);
  });

  it('maps "Permission denied" to KbAclDeniedError', async () => {
    h.callTool.mockResolvedValue({ isError: true, content: [{ type: 'text', text: 'Permission denied: nope' }] });
    const kb = await connected();
    await expect(kb.write('x', { title: 'T', content: 'c' })).rejects.toBeInstanceOf(KbAclDeniedError);
  });

  it('maps "Conflict" to KbConflictError', async () => {
    h.callTool.mockResolvedValue({ isError: true, content: [{ type: 'text', text: 'Conflict at `x`: changed' }] });
    const kb = await connected();
    await expect(
      kb.update('x', { content: 'c', expectedHash: 'stale' }),
    ).rejects.toBeInstanceOf(KbConflictError);
  });

  it('falls back to parsing JSON text when there is no structuredContent', async () => {
    h.callTool.mockResolvedValue({ content: [{ type: 'text', text: '{"path":"x"}' }] });
    const kb = await connected();
    await expect(kb.delete('x')).resolves.toEqual({ path: 'x' });
  });

  it('close() closes the underlying client', async () => {
    const kb = await connected();
    await kb.close();
    expect(h.close).toHaveBeenCalled();
  });

  it('throws if a tool is called after close', async () => {
    const kb = await connected();
    await kb.close();
    await expect(kb.status()).rejects.toThrow(/not connected/);
  });
});
