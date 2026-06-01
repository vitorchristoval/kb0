import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { vi } from 'vitest';
import { FakeEmbeddingProvider } from '../../embedding/FakeEmbeddingProvider.js';
import { GitAdapter } from '../../git/GitAdapter.js';
import { KbIndex } from '../../index/KbIndex.js';
import { NullLogger } from '../../logger/NullLogger.js';
import { KbPolicy } from '../../policy/KbPolicy.js';
import { buildFrontmatter, serializeNote } from '../../schema/frontmatter.js';
import { KbStore } from '../../store/KbStore.js';
import { FakeWatcher } from '../../watcher/FakeWatcher.js';
import type { ToolContext } from '../tool-base.js';

function mockGit(): GitAdapter {
  return {
    init: vi.fn(),
    add: vi.fn(),
    remove: vi.fn(),
    commit: vi.fn().mockResolvedValue('a'.repeat(40)),
    addAndCommit: vi.fn().mockResolvedValue('a'.repeat(40)),
    removeAndCommit: vi.fn().mockResolvedValue('a'.repeat(40)),
    log: vi.fn().mockResolvedValue([]),
  } as unknown as GitAdapter;
}

export interface TestCtx {
  ctx: ToolContext;
  tmpDir: string;
  cleanup(): Promise<void>;
}

export async function createTestContext(): Promise<TestCtx> {
  const tmpDir = await mkdtemp(join(tmpdir(), 'kb0-mcp-'));
  const dbPath = join(tmpDir, '.vault-index', 'index.db');
  const logFile = join(tmpDir, '.vault-index', 'kb0.log');
  const embedding = new FakeEmbeddingProvider(8);
  const git = mockGit();
  const watcher = new FakeWatcher();
  const index = new KbIndex({ dbPath, vaultDir: tmpDir, embedding });
  const store = new KbStore(tmpDir, git, { index, watcher });
  const policy = KbPolicy.allowAll();
  const logger = new NullLogger();

  const ctx: ToolContext = {
    store,
    index,
    policy,
    agentIdentity: 'test-agent',
    vaultDir: tmpDir,
    logFile,
    logger,
    log: () => {},
  };

  return {
    ctx,
    tmpDir,
    async cleanup() {
      index.close();
      await rm(tmpDir, { recursive: true, force: true });
    },
  };
}

/** Write a raw markdown file directly (bypassing KbStore — for pre-seeding tests). */
export async function seedNote(
  tmpDir: string,
  relPath: string,
  opts: { title: string; content: string; author?: string },
): Promise<void> {
  const fm = buildFrontmatter({ title: opts.title, author: opts.author ?? 'human' });
  const raw = serializeNote(opts.content, fm);
  const abs = join(tmpDir, relPath);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, raw, 'utf-8');
}
