import OpenAI from 'openai';
import type { EmbeddingProvider } from './EmbeddingProvider.js';

export interface OpenAIEmbeddingConfig {
  apiKey?: string;
  /** Model name. Default: text-embedding-3-small */
  model?: string;
  /** Vector dimensions. Default: looked up per model, falls back to 1536. */
  dimensions?: number;
  /** Override base URL for OpenAI-compatible endpoints (Azure, LiteLLM, Ollama). */
  baseURL?: string;
}

/** Natural embedding dimensions for known OpenAI models. */
const KNOWN_MODEL_DIMENSIONS: Record<string, number> = {
  'text-embedding-3-small': 1536,
  'text-embedding-3-large': 3072,
  'text-embedding-ada-002': 1536,
};

const DEFAULT_MODEL = 'text-embedding-3-small';
const FALLBACK_DIMENSIONS = 1536;

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly model: string;
  readonly dimensions: number;

  private readonly client: OpenAI;
  /** Only text-embedding-3-* models accept the `dimensions` API parameter. */
  private readonly supportsDimensionsParam: boolean;

  constructor(config: OpenAIEmbeddingConfig = {}) {
    this.model = config.model ?? DEFAULT_MODEL;
    this.dimensions =
      config.dimensions ?? KNOWN_MODEL_DIMENSIONS[this.model] ?? FALLBACK_DIMENSIONS;
    this.supportsDimensionsParam = this.model.startsWith('text-embedding-3');

    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    });
  }

  async embed(texts: string[]): Promise<number[][]> {
    const response = await this.client.embeddings.create({
      model: this.model,
      input: texts,
      // Passing `dimensions` to ada-002 or non-OpenAI endpoints errors — omit it.
      ...(this.supportsDimensionsParam ? { dimensions: this.dimensions } : {}),
    });
    return response.data.sort((a, b) => a.index - b.index).map((item) => item.embedding);
  }
}
