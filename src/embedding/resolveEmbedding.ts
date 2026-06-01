import type { EmbeddingProvider } from './EmbeddingProvider.js';
import { FakeEmbeddingProvider } from './FakeEmbeddingProvider.js';
import { OpenAIEmbeddingProvider } from './OpenAIEmbeddingProvider.js';

export interface ResolvedEmbedding {
  provider: EmbeddingProvider;
  mode: 'openai' | 'fake';
  /** Human-readable one-liner for boot logs. */
  summary: string;
}

/**
 * Builds an EmbeddingProvider from environment variables.
 *
 *   OPENAI_API_KEY            — if set, use OpenAI; otherwise FakeEmbeddingProvider
 *   KB0_EMBEDDING_MODEL       — model name (default: text-embedding-3-small)
 *   KB0_EMBEDDING_DIMENSIONS  — vector size (default: per-model, falls back to 1536)
 *   KB0_OPENAI_BASE_URL       — override endpoint (Azure, LiteLLM, Ollama, ...)
 *
 * Centralizes the logic shared by `kb0 serve` and `kb0 reindex`.
 */
export function resolveEmbedding(env: NodeJS.ProcessEnv = process.env): ResolvedEmbedding {
  const apiKey = env['OPENAI_API_KEY'];

  if (!apiKey) {
    const provider = new FakeEmbeddingProvider();
    return {
      provider,
      mode: 'fake',
      summary: 'keyword-only (no OPENAI_API_KEY — semantic search disabled)',
    };
  }

  const model = env['KB0_EMBEDDING_MODEL'];
  const baseURL = env['KB0_OPENAI_BASE_URL'];

  let dimensions: number | undefined;
  const dimsRaw = env['KB0_EMBEDDING_DIMENSIONS'];
  if (dimsRaw !== undefined) {
    const parsed = Number(dimsRaw);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new Error(
        `KB0_EMBEDDING_DIMENSIONS must be a positive integer, got "${dimsRaw}".`,
      );
    }
    dimensions = parsed;
  }

  const provider = new OpenAIEmbeddingProvider({ apiKey, model, dimensions, baseURL });

  const parts = [`model=${provider.model}`, `dims=${provider.dimensions}`];
  if (baseURL) parts.push(`endpoint=${baseURL}`);

  return {
    provider,
    mode: 'openai',
    summary: parts.join(' '),
  };
}
