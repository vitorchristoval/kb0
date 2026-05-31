import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KbConflictError, KbNotFoundError } from '../errors.js';
import type { GitAdapter } from '../git/GitAdapter.js';
import { KbStore } from './KbStore.js';

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

describe('KbStore', () => {
  let tmpDir: string;
  let store: KbStore;
  let git: GitAdapter;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'kb0-store-'));
    git = mockGit();
    store = new KbStore(tmpDir, git);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe('write', () => {
    it('writes a note and returns hash + id', async () => {
      const result = await store.write('notes/test.md', {
        title: 'Test',
        author: 'human',
        content: 'Hello world',
      });
      expect(result.hash).toHaveLength(64);
      expect(result.id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('calls git.addAndCommit on write', async () => {
      await store.write('notes/git-test.md', {
        title: 'Git Test',
        author: 'human',
        content: 'test',
      });
      expect(git.addAndCommit).toHaveBeenCalledWith('notes/git-test.md', 'feat: add notes/git-test.md');
    });

    it('creates nested directories automatically', async () => {
      await expect(
        store.write('deep/nested/note.md', { title: 'Deep', author: 'human', content: 'x' }),
      ).resolves.toBeTruthy();
    });
  });

  describe('read', () => {
    it('reads a written note with correct frontmatter and content', async () => {
      await store.write('notes/read-me.md', {
        title: 'Read Me',
        author: 'agent:test',
        content: 'body text',
      });
      const note = await store.read('notes/read-me.md');
      expect(note.frontmatter.title).toBe('Read Me');
      expect(note.frontmatter.author).toBe('agent:test');
      expect(note.content).toBe('body text');
      expect(note.hash).toHaveLength(64);
    });

    it('throws KbNotFoundError for a missing note', async () => {
      await expect(store.read('ghost.md')).rejects.toThrow(KbNotFoundError);
    });
  });

  describe('update', () => {
    it('updates content when hash matches', async () => {
      const { hash } = await store.write('notes/update.md', {
        title: 'Update',
        author: 'human',
        content: 'original',
      });
      await store.update('notes/update.md', {
        content: 'updated',
        expectedHash: hash,
        author: 'human',
      });
      const note = await store.read('notes/update.md');
      expect(note.content).toBe('updated');
    });

    it('preserves the original id and created timestamp', async () => {
      const { hash } = await store.write('notes/preserve.md', {
        title: 'Preserve',
        author: 'human',
        content: 'v1',
      });
      const before = await store.read('notes/preserve.md');
      await store.update('notes/preserve.md', {
        content: 'v2',
        expectedHash: hash,
        author: 'human',
      });
      const after = await store.read('notes/preserve.md');
      expect(after.frontmatter.id).toBe(before.frontmatter.id);
      expect(after.frontmatter.created).toBe(before.frontmatter.created);
    });

    it('throws KbConflictError when hash does not match', async () => {
      await store.write('notes/conflict.md', {
        title: 'Conflict',
        author: 'human',
        content: 'original',
      });
      await expect(
        store.update('notes/conflict.md', {
          content: 'boom',
          expectedHash: 'wrong'.padEnd(64, '0'),
          author: 'human',
        }),
      ).rejects.toThrow(KbConflictError);
    });

    it('throws KbNotFoundError for a missing note', async () => {
      await expect(
        store.update('ghost.md', { content: 'x', expectedHash: 'y'.padEnd(64, '0'), author: 'human' }),
      ).rejects.toThrow(KbNotFoundError);
    });
  });

  describe('delete', () => {
    it('deletes a note so it can no longer be read', async () => {
      await store.write('notes/delete-me.md', { title: 'Bye', author: 'human', content: 'x' });
      await store.delete('notes/delete-me.md');
      await expect(store.read('notes/delete-me.md')).rejects.toThrow(KbNotFoundError);
    });

    it('calls git.removeAndCommit with the correct path', async () => {
      await store.write('notes/delete-me.md', { title: 'Bye', author: 'human', content: 'x' });
      await store.delete('notes/delete-me.md');
      expect(git.removeAndCommit).toHaveBeenCalledWith(
        'notes/delete-me.md',
        'feat: delete notes/delete-me.md',
      );
    });

    it('throws KbNotFoundError for a missing note', async () => {
      await expect(store.delete('ghost.md')).rejects.toThrow(KbNotFoundError);
    });
  });

  describe('path traversal guard', () => {
    it('blocks paths that escape the vault', async () => {
      await expect(store.read('../../etc/passwd')).rejects.toThrow();
    });
  });
});
