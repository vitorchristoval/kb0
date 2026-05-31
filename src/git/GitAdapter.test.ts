import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GitAdapter } from './GitAdapter.js';

describe('GitAdapter', () => {
  let tmpDir: string;
  let adapter: GitAdapter;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'kb0-git-'));
    adapter = new GitAdapter({ dir: tmpDir, authorName: 'test', authorEmail: 'test@test.com' });
    await adapter.init();
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('creates a .git directory on init', () => {
    expect(existsSync(join(tmpDir, '.git'))).toBe(true);
  });

  it('returns a 40-char sha on commit', async () => {
    await writeFile(join(tmpDir, 'note.md'), 'hello', 'utf-8');
    const sha = await adapter.addAndCommit('note.md', 'test: add note');
    expect(sha).toHaveLength(40);
  });

  it('logs committed messages', async () => {
    await writeFile(join(tmpDir, 'a.md'), 'a', 'utf-8');
    await adapter.addAndCommit('a.md', 'test: first');
    await writeFile(join(tmpDir, 'b.md'), 'b', 'utf-8');
    await adapter.addAndCommit('b.md', 'test: second');

    const log = await adapter.log();
    expect(log).toHaveLength(2);
    expect(log[0].message).toBe('test: second');
    expect(log[1].message).toBe('test: first');
  });

  it('respects the depth limit in log', async () => {
    await writeFile(join(tmpDir, 'a.md'), 'a', 'utf-8');
    await adapter.addAndCommit('a.md', 'test: first');
    await writeFile(join(tmpDir, 'b.md'), 'b', 'utf-8');
    await adapter.addAndCommit('b.md', 'test: second');

    const log = await adapter.log(1);
    expect(log).toHaveLength(1);
    expect(log[0].message).toBe('test: second');
  });

  it('stages a deletion with remove', async () => {
    await writeFile(join(tmpDir, 'del.md'), 'bye', 'utf-8');
    await adapter.addAndCommit('del.md', 'test: add');

    const { unlink } = await import('node:fs/promises');
    await unlink(join(tmpDir, 'del.md'));
    const sha = await adapter.removeAndCommit('del.md', 'test: delete');
    expect(sha).toHaveLength(40);
  });
});
