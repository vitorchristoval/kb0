import { describe, expect, it } from 'vitest';
import { OperationEventForwarder } from './OperationEventForwarder.js';
import { resolveForwarder } from './resolveForwarder.js';

describe('resolveForwarder', () => {
  it('is disabled when KB0_API_KEY is unset', () => {
    const { forwarder, summary } = resolveForwarder(undefined, {});
    expect(forwarder).toBeNull();
    expect(summary).toContain('disabled');
  });

  it('builds a forwarder with the default ingest endpoint when KB0_API_KEY is set', () => {
    const { forwarder, summary } = resolveForwarder(undefined, { KB0_API_KEY: 'k' });
    expect(forwarder).toBeInstanceOf(OperationEventForwarder);
    expect(summary).toContain('ingest.kb0.dev');
  });

  it('honors a custom KB0_INGEST_URL', () => {
    const { forwarder, summary } = resolveForwarder(undefined, {
      KB0_API_KEY: 'k',
      KB0_INGEST_URL: 'http://localhost:9000/ingest',
    });
    expect(forwarder).toBeInstanceOf(OperationEventForwarder);
    expect(summary).toContain('http://localhost:9000/ingest');
  });
});
