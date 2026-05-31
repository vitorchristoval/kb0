import OpenAI from 'openai';
import type { EmbeddingProvider } from './EmbeddingProvider.js';

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly model = 'text-embedding-3-small';
  readonly dimensions = 1536;

  private readonly client: OpenAI;

  constructor(apiKey?: string) {
    this.client = new OpenAI({ apiKey });
  }

  async embed(texts: string[]): Promise<number[][]> {
    const response = await this.client.embeddings.create({
      model: this.model,
      input: texts,
      dimensions: this.dimensions,
    });
    return response.data
      .sort((a, b) => a.index - b.index)
      .map((item) => item.embedding);
  }
}
