import { createHash } from 'node:crypto';
import type { EmbeddingProvider } from './EmbeddingProvider.js';

export class FakeEmbeddingProvider implements EmbeddingProvider {
  readonly model = 'fake-v1';
  readonly dimensions: number;

  constructor(dimensions = 8) {
    this.dimensions = dimensions;
  }

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((text) => this.textToVector(text));
  }

  private textToVector(text: string): number[] {
    const hash = createHash('sha256').update(text).digest();
    const vec = Array.from({ length: this.dimensions }, (_, i) => {
      return (hash[i % hash.length] / 127.5) - 1;
    });
    const magnitude = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
    return magnitude === 0 ? vec : vec.map((v) => v / magnitude);
  }
}
