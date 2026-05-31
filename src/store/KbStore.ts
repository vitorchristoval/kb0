import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { type GitAdapter } from '../git/GitAdapter.js';
import { type Frontmatter, buildFrontmatter, parseNote, serializeNote } from '../schema/frontmatter.js';

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
  status?: Frontmatter['status'];
  tags?: string[];
}

export interface NoteWithHash {
  frontmatter: Frontmatter;
  content: string;
  raw: string;
  hash: string;
}

export class KbNotFoundError extends Error {
  constructor(public readonly notePath: string) {
    super(`Note not found: ${notePath}`);
    this.name = 'KbNotFoundError';
  }
}

export class KbConflictError extends Error {
  constructor(
    public readonly notePath: string,
    public readonly expected: string,
    public readonly actual: string,
  ) {
    super(`Conflict on ${notePath}: expected hash ${expected}, got ${actual}`);
    this.name = 'KbConflictError';
  }
}

export class KbStore {
  constructor(
    private readonly vaultDir: string,
    private readonly git: GitAdapter,
  ) {}

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

  async write(notePath: string, opts: WriteOptions): Promise<string> {
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
    await fs.writeFile(abs, raw, 'utf-8');
    await this.git.addAndCommit(notePath, `feat: add ${notePath}`);
    return contentHash(raw);
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
      author: opts.author,
      status: opts.status ?? parsed.frontmatter.status,
      tags: opts.tags ?? parsed.frontmatter.tags,
      updated: new Date().toISOString(),
    });

    const raw = serializeNote(opts.content, frontmatter);
    await fs.writeFile(abs, raw, 'utf-8');
    await this.git.addAndCommit(notePath, `feat: update ${notePath}`);
    return contentHash(raw);
  }

  async delete(notePath: string): Promise<void> {
    const abs = this.resolve(notePath);
    try {
      await fs.unlink(abs);
    } catch {
      throw new KbNotFoundError(notePath);
    }
    await this.git.removeAndCommit(notePath, `feat: delete ${notePath}`);
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
