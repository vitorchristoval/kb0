import { describe, expect, it } from 'vitest';
import { OpenAIEmbeddingProvider } from './OpenAIEmbeddingProvider.js';

describe('OpenAIEmbeddingProvider', () => {
  it('defaults to text-embedding-3-small with 1536 dimensions', () => {
    const p = new OpenAIEmbeddingProvider({ apiKey: 'sk-test' });
    expect(p.model).toBe('text-embedding-3-small');
    expect(p.dimensions).toBe(1536);
  });

  it('looks up natural dimensions for a known model', () => {
    const p = new OpenAIEmbeddingProvider({ apiKey: 'sk-test', model: 'text-embedding-3-large' });
    expect(p.dimensions).toBe(3072);
  });

  it('honors an explicit dimensions override', () => {
    const p = new OpenAIEmbeddingProvider({
      apiKey: 'sk-test',
      model: 'text-embedding-3-large',
      dimensions: 256,
    });
    expect(p.dimensions).toBe(256);
  });

  it('falls back to 1536 for an unknown model with no dimensions', () => {
    const p = new OpenAIEmbeddingProvider({ apiKey: 'sk-test', model: 'some-custom-model' });
    expect(p.dimensions).toBe(1536);
  });

  it('accepts a custom baseURL without throwing', () => {
    expect(
      () =>
        new OpenAIEmbeddingProvider({
          apiKey: 'sk-test',
          model: 'nomic-embed-text',
          dimensions: 768,
          baseURL: 'http://localhost:11434/v1',
        }),
    ).not.toThrow();
  });
});
