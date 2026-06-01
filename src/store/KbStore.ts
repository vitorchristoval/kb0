import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { KbConflictError, KbNotFoundError } from '../errors.js';
import type { KbIndex } from '../index/KbIndex.js';
import {
  type Frontmatter,
  buildFrontmatter,
  normalizeFrontmatter,
  parseNote,
  serializeNote,
} from '../schema/frontmatter.js';
import type { KbWatcher } from '../watcher/KbWatcher.js';
import { GitAdapter } from '../git/GitAdapter.js';

// Re-export so existing imports from './KbStore' keep working.
export { KbError, KbConflictError, KbNotFoundError } from '../errors.js';

export interface WriteOptions {
  title: string;
  author: string;
  content: string;
  status?: Frontmatter['status'];
  tags?: string[];
}

export interface UpdateOptions {
  content: string;
  expectedHash: string;
  author: string;
  title?: string;
  status?: Frontmatter['status'];
  tags?: string[];
}

export interface NoteWithHash {
  frontmatter: Frontmatter;
  content: string;
  raw: string;
  hash: string;
}

interface Deps {
  index?: KbIndex;
  watcher?: KbWatcher;
}

export class KbStore {
  private readonly index?: KbIndex;
  private readonly watcher?: KbWatcher;

  constructor(
    private readonly vaultDir: string,
    private readonly git: GitAdapter,
    deps?: Deps,
  ) {
    this.index = deps?.index;
    this.watcher = deps?.watcher;
  }

  async read(notePath: string): Promise<NoteWithHash> {
    const abs = this.resolve(notePath);
    let raw: string;
    try {
      raw = await fs.readFile(abs, 'utf-8');
    } catch {
      throw new KbNotFoundError(notePath);
    }
    const note = parseNote(raw);
    return { ...note, hash: contentHash(raw) };
  }

  async write(notePath: string, opts: WriteOptions): Promise<{ hash: string; id: string }> {
    const abs = this.resolve(notePath);
    await fs.mkdir(path.dirname(abs), { recursive: true });

    const now = new Date().toISOString();
    const frontmatter = buildFrontmatter({
      title: opts.title,
      author: opts.author,
      status: opts.status,
      tags: opts.tags,
      created: now,
      updated: now,
    });

    const raw = serializeNote(opts.content, frontmatter);

    this.watcher?.ignoreFor(notePath, 1000);
    await fs.writeFile(abs, raw, 'utf-8');
    await this.git.addAndCommit(notePath, `feat: add ${notePath}`);
    await this.index?.indexNote(notePath);

    return { hash: contentHash(raw), id: frontmatter.id };
  }

  async update(notePath: string, opts: UpdateOptions): Promise<string> {
    const abs = this.resolve(notePath);
    let existing: string;
    try {
      existing = await fs.readFile(abs, 'utf-8');
    } catch {
      throw new KbNotFoundError(notePath);
    }

    const actual = contentHash(existing);
    if (actual !== opts.expectedHash) {
      throw new KbConflictError(notePath, opts.expectedHash, actual);
    }

    const parsed = parseNote(existing);
    const frontmatter = buildFrontmatter({
      ...parsed.frontmatter,
      title: opts.title ?? parsed.frontmatter.title,
      author: opts.author,
      status: opts.status ?? parsed.frontmatter.status,
      tags: opts.tags ?? parsed.frontmatter.tags,
      updated: new Date().toISOString(),
    });

    const raw = serializeNote(opts.content, frontmatter);

    this.watcher?.ignoreFor(notePath, 1000);
    await fs.writeFile(abs, raw, 'utf-8');
    await this.git.addAndCommit(notePath, `feat: update ${notePath}`);
    await this.index?.indexNote(notePath);

    return contentHash(raw);
  }

  async delete(notePath: string): Promise<void> {
    const abs = this.resolve(notePath);
    try {
      this.watcher?.ignoreFor(notePath, 1000);
      await fs.unlink(abs);
    } catch {
      throw new KbNotFoundError(notePath);
    }
    await this.git.removeAndCommit(notePath, `feat: delete ${notePath}`);
    this.index?.deleteNote(notePath);
  }

  /**
   * Brings an externally-created or edited markdown file into kb0.
   *
   * If the file lacks complete frontmatter (e.g. a plain .md a human dropped in
   * or edited in Obsidian/VS Code), it is stamped with `author: human`, a stable
   * generated id, and timestamps — then indexed. Files that already have valid
   * frontmatter are indexed unchanged.
   *
   * The stamp is written to disk (so the id is stable across reindexes) but is
   * NOT auto-committed: external files belong to the user's own git workflow.
   * The `author: human` field is the provenance record.
   */
  async ingest(notePath: string): Promise<void> {
    const abs = this.resolve(notePath);
    let raw: string;
    let mtimeIso: string;
    try {
      raw = await fs.readFile(abs, 'utf-8');
      const stat = await fs.stat(abs);
      mtimeIso = stat.mtime.toISOString();
    } catch {
      throw new KbNotFoundError(notePath);
    }

    const fallbackTitle = path.basename(notePath, path.extname(notePath));
    const { raw: stamped, wasModified } = normalizeFrontmatter(raw, { mtimeIso, fallbackTitle });

    if (wasModified) {
      this.watcher?.ignoreFor(notePath, 1000);
      await fs.writeFile(abs, stamped, 'utf-8');
    }

    await this.index?.indexNote(notePath);
  }

  private resolve(notePath: string): string {
    const resolved = path.resolve(this.vaultDir);
    const abs = path.resolve(resolved, notePath);
    if (!abs.startsWith(resolved + path.sep) && abs !== resolved) {
      throw new Error(`Path traversal detected: ${notePath}`);
    }
    return abs;
  }
}

function contentHash(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}
