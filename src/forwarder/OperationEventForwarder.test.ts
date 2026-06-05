import { describe, expect, it, vi } from 'vitest';
import type { OperationEvent } from '../mcp/tool-base.js';
import { OperationEventForwarder, type ForwardedEvent } from './OperationEventForwarder.js';

interface Call {
  url: string;
  auth: string;
  events: ForwardedEvent[];
}

function makeFetch(opts: { failTimes?: number } = {}): {
  fetchImpl: typeof fetch;
  calls: Call[];
} {
  let fails = opts.failTimes ?? 0;
  const calls: Call[] = [];
  const fetchImpl = (async (url: string | URL, init?: RequestInit): Promise<Response> => {
    const body = JSON.parse(String(init?.body)) as { events: ForwardedEvent[] };
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({ url: String(url), auth: headers.authorization, events: body.events });
    if (fails > 0) {
      fails -= 1;
      throw new Error('network down');
    }
    return { ok: true, status: 200 } as unknown as Response;
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

function ev(over: Partial<OperationEvent> = {}): OperationEvent {
  return {
    tool: 'vault.read',
    agent: 'research-bot',
    ts: '2026-01-01T00:00:00.000Z',
    ok: true,
    durationMs: 1,
    mutates: false,
    fields: { path: 'notes/x.md' },
    ...over,
  };
}

describe('OperationEventForwarder', () => {
  it('flushes a full batch with Bearer auth and content-free events', async () => {
    const { fetchImpl, calls } = makeFetch();
    const f = new OperationEventForwarder({
      endpoint: 'http://ingest',
      apiKey: 'secret',
      batchSize: 3,
      fetchImpl,
    });

    f.enqueue(ev());
    f.enqueue(ev());
    f.enqueue(ev()); // reaching batchSize triggers the flush

    await vi.waitFor(() => expect(f.pending).toBe(0)); // delivery fully settled
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('http://ingest');
    expect(calls[0].auth).toBe('Bearer secret');
    expect(calls[0].events).toHaveLength(3);
    // content-free: only metadata fields, never a note body
    expect(calls[0].events[0].fields).toEqual({ path: 'notes/x.md' });
    expect(calls[0].events[0]).not.toHaveProperty('content');
    expect(f.pending).toBe(0);
  });

  it('flushes the remaining partial batch on close', async () => {
    const { fetchImpl, calls } = makeFetch();
    const f = new OperationEventForwarder({
      endpoint: 'http://ingest',
      apiKey: 'k',
      batchSize: 100,
      fetchImpl,
    });

    f.enqueue(ev());
    f.enqueue(ev());
    expect(calls).toHaveLength(0); // below batchSize — nothing sent yet

    await f.close();
    expect(calls).toHaveLength(1);
    expect(calls[0].events).toHaveLength(2);
  });

  it('retains events and retries on failure (at-least-once)', async () => {
    const { fetchImpl, calls } = makeFetch({ failTimes: 1 });
    // Large batchSize so enqueue never auto-flushes — the flushes below are explicit
    // and fully awaited, keeping the retry deterministic.
    const f = new OperationEventForwarder({
      endpoint: 'http://ingest',
      apiKey: 'k',
      batchSize: 100,
      fetchImpl,
    });

    f.enqueue(ev());
    f.enqueue(ev());

    await f.flush(); // first attempt fails
    expect(calls).toHaveLength(1);
    expect(f.pending).toBe(2); // nothing dropped

    await f.flush(); // retry succeeds
    expect(calls).toHaveLength(2);
    expect(calls[1].events).toHaveLength(2); // same events re-sent
    expect(f.pending).toBe(0);
  });

  it('chains events with a sequence number and rolling hash', async () => {
    const { fetchImpl, calls } = makeFetch();
    const f = new OperationEventForwarder({
      endpoint: 'http://ingest',
      apiKey: 'k',
      batchSize: 3,
      fetchImpl,
    });

    f.enqueue(ev());
    f.enqueue(ev({ tool: 'vault.search', fields: { query: 'auth' } }));
    f.enqueue(ev());

    await vi.waitFor(() => expect(calls).toHaveLength(1));
    const [a, b, c] = calls[0].events;
    expect([a.seq, b.seq, c.seq]).toEqual([1, 2, 3]);
    expect(a.prevHash).toBe('0'.repeat(64)); // genesis
    expect(b.prevHash).toBe(a.hash);
    expect(c.prevHash).toBe(b.hash);
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('enqueue is a no-op (and never throws) after close', async () => {
    const { fetchImpl } = makeFetch();
    const f = new OperationEventForwarder({ endpoint: 'http://ingest', apiKey: 'k', fetchImpl });
    await f.close();
    expect(() => f.enqueue(ev())).not.toThrow();
    expect(f.pending).toBe(0);
  });
});
