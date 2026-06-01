import { describe, expect, it } from 'vitest';
import { resolveEmbedding } from './resolveEmbedding.js';

describe('resolveEmbedding', () => {
  it('falls back to fake mode when OPENAI_API_KEY is absent', () => {
    const r = resolveEmbedding({});
    expect(r.mode).toBe('fake');
    expect(r.summary).toContain('keyword-only');
  });

  it('uses OpenAI when OPENAI_API_KEY is present', () => {
    const r = resolveEmbedding({ OPENAI_API_KEY: 'sk-test' });
    expect(r.mode).toBe('openai');
    expect(r.provider.model).toBe('text-embedding-3-small');
  });

  it('reads KB0_EMBEDDING_MODEL from env', () => {
    const r = resolveEmbedding({
      OPENAI_API_KEY: 'sk-test',
      KB0_EMBEDDING_MODEL: 'text-embedding-3-large',
    });
    expect(r.provider.model).toBe('text-embedding-3-large');
    expect(r.provider.dimensions).toBe(3072);
  });

  it('reads KB0_EMBEDDING_DIMENSIONS from env', () => {
    const r = resolveEmbedding({
      OPENAI_API_KEY: 'sk-test',
      KB0_EMBEDDING_MODEL: 'text-embedding-3-large',
      KB0_EMBEDDING_DIMENSIONS: '512',
    });
    expect(r.provider.dimensions).toBe(512);
  });

  it('includes the endpoint in summary when KB0_OPENAI_BASE_URL is set', () => {
    const r = resolveEmbedding({
      OPENAI_API_KEY: 'sk-test',
      KB0_OPENAI_BASE_URL: 'http://localhost:11434/v1',
    });
    expect(r.summary).toContain('localhost:11434');
  });

  it('throws on a non-integer KB0_EMBEDDING_DIMENSIONS', () => {
    expect(() =>
      resolveEmbedding({ OPENAI_API_KEY: 'sk-test', KB0_EMBEDDING_DIMENSIONS: 'abc' }),
    ).toThrow(/positive integer/);
  });

  it('throws on a negative KB0_EMBEDDING_DIMENSIONS', () => {
    expect(() =>
      resolveEmbedding({ OPENAI_API_KEY: 'sk-test', KB0_EMBEDDING_DIMENSIONS: '-5' }),
    ).toThrow(/positive integer/);
  });
});
