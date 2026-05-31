export { KbStore, KbNotFoundError, KbConflictError } from './store/KbStore.js';
export type { WriteOptions, UpdateOptions, NoteWithHash } from './store/KbStore.js';

export { GitAdapter } from './git/GitAdapter.js';
export type { GitConfig, CommitSummary } from './git/GitAdapter.js';

export { parseNote, serializeNote, buildFrontmatter, FrontmatterSchema } from './schema/frontmatter.js';
export type { Frontmatter, Note } from './schema/frontmatter.js';

export { KbIndex } from './index/KbIndex.js';
export type { SearchOptions, SearchResult, SearchResultItem, SearchWarning } from './index/KbIndex.js';

export type { EmbeddingProvider } from './embedding/EmbeddingProvider.js';
export { FakeEmbeddingProvider } from './embedding/FakeEmbeddingProvider.js';
export { OpenAIEmbeddingProvider } from './embedding/OpenAIEmbeddingProvider.js';

export { parseLinks } from './parser/noteLinks.js';
export type { ParsedLinks } from './parser/noteLinks.js';

export type { KbWatcher } from './watcher/KbWatcher.js';
export { FakeWatcher } from './watcher/FakeWatcher.js';
export { LocalFileWatcher } from './watcher/LocalFileWatcher.js';
