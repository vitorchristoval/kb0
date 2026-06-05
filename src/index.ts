export { KbError, KbNotFoundError, KbConflictError } from './errors.js';
export type { KbErrorCode } from './errors.js';

export { KbStore } from './store/KbStore.js';
export type { WriteOptions, UpdateOptions, NoteWithHash } from './store/KbStore.js';

export { GitAdapter } from './git/GitAdapter.js';
export type { GitConfig, CommitSummary } from './git/GitAdapter.js';

export {
  parseNote,
  serializeNote,
  buildFrontmatter,
  normalizeFrontmatter,
  FrontmatterSchema,
} from './schema/frontmatter.js';
export type { Frontmatter, Note, NormalizeOptions } from './schema/frontmatter.js';

export { KbIndex } from './index/KbIndex.js';
export type {
  SearchOptions,
  SearchResult,
  SearchResultItem,
  SearchWarning,
  ListFilters,
  ListRow,
  LinkRow,
  RecentRow,
} from './index/KbIndex.js';

export type { EmbeddingProvider } from './embedding/EmbeddingProvider.js';
export { FakeEmbeddingProvider } from './embedding/FakeEmbeddingProvider.js';
export { OpenAIEmbeddingProvider } from './embedding/OpenAIEmbeddingProvider.js';
export type { OpenAIEmbeddingConfig } from './embedding/OpenAIEmbeddingProvider.js';
export { resolveEmbedding } from './embedding/resolveEmbedding.js';
export type { ResolvedEmbedding } from './embedding/resolveEmbedding.js';

export { parseLinks } from './parser/noteLinks.js';
export type { ParsedLinks } from './parser/noteLinks.js';

export type { KbWatcher } from './watcher/KbWatcher.js';
export { FakeWatcher } from './watcher/FakeWatcher.js';
export { LocalFileWatcher } from './watcher/LocalFileWatcher.js';

export { KbPolicy } from './policy/KbPolicy.js';
export type { PolicyMode, PolicyOperation } from './policy/KbPolicy.js';
export type { PolicyEngine } from './policy/PolicyEngine.js';

export type { Logger, LogLevel } from './logger/Logger.js';
export { FileLogger } from './logger/FileLogger.js';
export { NullLogger } from './logger/NullLogger.js';

export { KbMcpServer } from './mcp/server.js';
export type { KbMcpServerConfig } from './mcp/server.js';
export { defineTool } from './mcp/tool-base.js';
export type { Tool, ToolContext, OperationEvent } from './mcp/tool-base.js';
export { ALL_TOOLS } from './mcp/tools/index.js';

export { KB0_VERSION } from './version.js';
