import Database from 'better-sqlite3';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { EmbeddingProvider } from '../embedding/EmbeddingProvider.js';
import { parseLinks } from '../parser/noteLinks.js';
import { parseNote } from '../schema/frontmatter.js';
import { openDatabase } from './db/db.js';

export type SearchMode = 'hybrid' | 'semantic' | 'keyword';
export type RankingMode = 'rrf' | 'weighted';
export type SearchWarning = 'SEMANTIC_DEGRADED';

export interface SearchOptions {
  mode?: SearchMode;
  ranking?: RankingMode;
  /** Weight for semantic score in 'weighted' mode. Default: 0.6 */
  alpha?: number;
  limit?: number;
}

export interface SearchResultItem {
  id: string;
  path: string;
  title: string;
  author: string;
  status: string;
  score: number;
}

export interface SearchResult {
  results: SearchResultItem[];
  warnings: SearchWarning[];
}

interface NoteRow {
  id: string;
  path: string;
  title: string;
  author: string;
  status: string;
  created_at: string;
  updated_at: string;
  last_indexed_at: string | null;
}

export class KbIndex {
  private readonly db: Database.Database;
  private readonly vaultDir: string;
  private readonly embedding: EmbeddingProvider;
  private isReindexingStale = false;
  private closed = false;

  constructor(config: { dbPath: string; vaultDir: string; embedding: EmbeddingProvider }) {
    this.db = openDatabase(config.dbPath);
    this.vaultDir = config.vaultDir;
    this.embedding = config.embedding;
    this.onBoot();
  }

  private onBoot(): void {
    this.markStaleOnModelChange();
    const staleCount = this.countStaleEmbeddings();
    if (staleCount > 0) {
      process.stderr.write(
        `[kb0] warning: ${staleCount} stale embedding(s) detected, reindexing in background\n`,
      );
      setImmediate(() => void this.reindexStaleInBackground());
    }
  }

  private markStaleOnModelChange(): void {
    this.db
      .prepare('UPDATE embeddings SET stale = 1 WHERE model != ? OR dimensions != ?')
      .run(this.embedding.model, this.embedding.dimensions);
  }

  private countStaleEmbeddings(): number {
    const row = this.db
      .prepare('SELECT COUNT(*) as n FROM embeddings WHERE stale = 1')
      .get() as { n: number };
    return row.n;
  }

  private async reindexStaleInBackground(): Promise<void> {
    if (this.isReindexingStale || this.closed) return;
    this.isReindexingStale = true;
    try {
      const rows = this.db
        .prepare(
          `SELECT n.path FROM embeddings e
           JOIN notes n ON e.note_id = n.id
           WHERE e.stale = 1`,
        )
        .all() as { path: string }[];

      for (const { path: notePath } of rows) {
        if (this.closed) break;
        try {
          await this.indexNote(notePath);
        } catch {
          // best-effort; failures are non-fatal
        }
      }
    } finally {
      this.isReindexingStale = false;
    }
  }

  async indexNote(notePath: string): Promise<void> {
    const absPath = path.join(this.vaultDir, notePath);
    const [raw, stat] = await Promise.all([fs.readFile(absPath, 'utf-8'), fs.stat(absPath)]);
    const note = parseNote(raw);
    const { wikilinks, tags } = parseLinks(note.content);

    const text = `${note.frontmatter.title}\n\n${note.content}`;
    const [vector] = await this.embedding.embed([text]);
    // Store the file's mtime as last_indexed_at so filterNeedsIndexing can do
    // an exact mtime comparison — avoids clock-precision races.
    const now = stat.mtime.toISOString();

    this.db.transaction(() => {
      // If a different note previously lived at this path, remove it so the
      // upsert-by-id below doesn't hit the UNIQUE(path) constraint.
      const clash = this.db
        .prepare('SELECT id FROM notes WHERE path = ? AND id != ?')
        .get(notePath, note.frontmatter.id) as { id: string } | undefined;
      if (clash) {
        this.db.prepare('DELETE FROM notes_fts WHERE note_id = ?').run(clash.id);
        this.db.prepare('DELETE FROM notes WHERE id = ?').run(clash.id); // cascades tags/links/embeddings
      }

      this.db
        .prepare(
          `INSERT INTO notes (id, path, title, author, status, created_at, updated_at, last_indexed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             path           = excluded.path,
             title          = excluded.title,
             author         = excluded.author,
             status         = excluded.status,
             updated_at     = excluded.updated_at,
             last_indexed_at = excluded.last_indexed_at`,
        )
        .run(
          note.frontmatter.id,
          notePath,
          note.frontmatter.title,
          note.frontmatter.author,
          note.frontmatter.status,
          note.frontmatter.created,
          note.frontmatter.updated,
          now,
        );

      this.db.prepare('DELETE FROM notes_fts WHERE note_id = ?').run(note.frontmatter.id);
      this.db
        .prepare('INSERT INTO notes_fts (note_id, title, body) VALUES (?, ?, ?)')
        .run(note.frontmatter.id, note.frontmatter.title, note.content);

      this.db.prepare('DELETE FROM tags WHERE note_id = ?').run(note.frontmatter.id);
      for (const tag of tags) {
        this.db
          .prepare('INSERT INTO tags (note_id, tag) VALUES (?, ?)')
          .run(note.frontmatter.id, tag);
      }

      this.db.prepare('DELETE FROM links WHERE source_id = ?').run(note.frontmatter.id);
      for (const target of wikilinks) {
        this.db
          .prepare('INSERT INTO links (source_id, target_path) VALUES (?, ?)')
          .run(note.frontmatter.id, target);
      }

      this.db
        .prepare(
          `INSERT INTO embeddings (note_id, model, dimensions, vector, stale, indexed_at)
           VALUES (?, ?, ?, ?, 0, ?)
           ON CONFLICT(note_id) DO UPDATE SET
             model      = excluded.model,
             dimensions = excluded.dimensions,
             vector     = excluded.vector,
             stale      = 0,
             indexed_at = excluded.indexed_at`,
        )
        .run(
          note.frontmatter.id,
          this.embedding.model,
          this.embedding.dimensions,
          serializeVector(vector),
          now,
        );
    })();
  }

  deleteNote(notePath: string): void {
    const row = this.db
      .prepare('SELECT id FROM notes WHERE path = ?')
      .get(notePath) as { id: string } | undefined;
    if (!row) return;

    this.db.transaction(() => {
      this.db.prepare('DELETE FROM notes_fts WHERE note_id = ?').run(row.id);
      this.db.prepare('DELETE FROM notes WHERE id = ?').run(row.id);
    })();
  }

  async search(query: string, opts: SearchOptions = {}): Promise<SearchResult> {
    const { mode = 'hybrid', ranking = 'rrf', alpha = 0.6, limit = 10 } = opts;
    const warnings: SearchWarning[] = [];

    let kwIds: string[] = [];
    if (mode === 'keyword' || mode === 'hybrid') {
      kwIds = this.runKeywordSearch(query, limit * 2);
    }

    let semItems: Array<{ noteId: string; distance: number }> = [];
    if (mode === 'semantic' || mode === 'hybrid') {
      if (this.countStaleEmbeddings() > 0) warnings.push('SEMANTIC_DEGRADED');
      semItems = await this.runSemanticSearch(query, limit * 2);
    }

    const semIds = semItems.map((i) => i.noteId);

    let rankedIds: string[];
    if (mode === 'keyword') {
      rankedIds = kwIds;
    } else if (mode === 'semantic') {
      rankedIds = semIds;
    } else if (ranking === 'rrf') {
      rankedIds = rrfFusion(kwIds, semIds);
    } else {
      rankedIds = weightedFusion(kwIds, semItems, alpha, limit * 2);
    }

    const results = this.fetchNotes(rankedIds.slice(0, limit), rankedIds);
    return { results, warnings };
  }

  /** Returns paths that need reindexing: new files, mtime-changed files, stale embeddings. */
  async filterNeedsIndexing(relativePaths: string[]): Promise<string[]> {
    const needsIndex = new Set<string>();

    for (const relPath of relativePaths) {
      const absPath = path.join(this.vaultDir, relPath);
      const stat = await fs.stat(absPath);
      const mtime = stat.mtime.toISOString();
      const row = this.db
        .prepare('SELECT last_indexed_at FROM notes WHERE path = ?')
        .get(relPath) as { last_indexed_at: string | null } | undefined;

      if (!row || !row.last_indexed_at || row.last_indexed_at < mtime) {
        needsIndex.add(relPath);
      }
    }

    const staleRows = this.db
      .prepare(
        `SELECT n.path FROM embeddings e
         JOIN notes n ON e.note_id = n.id
         WHERE e.stale = 1`,
      )
      .all() as { path: string }[];

    staleRows.forEach((r) => needsIndex.add(r.path));

    return [...needsIndex];
  }

  /** Clears all index data. Used by `kb0 reindex --rebuild`. */
  rebuild(): void {
    this.db.transaction(() => {
      this.db.exec(`
        DELETE FROM embeddings;
        DELETE FROM notes_fts;
        DELETE FROM links;
        DELETE FROM tags;
        DELETE FROM notes;
      `);
    })();
  }

  close(): void {
    this.closed = true;
    this.db.close();
  }

  private runKeywordSearch(query: string, limit: number): string[] {
    const ftsQuery = buildFtsQuery(query);
    if (!ftsQuery) return [];
    try {
      const rows = this.db
        .prepare('SELECT note_id FROM notes_fts WHERE notes_fts MATCH ? ORDER BY rank LIMIT ?')
        .all(ftsQuery, limit) as { note_id: string }[];
      return rows.map((r) => r.note_id);
    } catch {
      return [];
    }
  }

  private async runSemanticSearch(
    query: string,
    limit: number,
  ): Promise<Array<{ noteId: string; distance: number }>> {
    const [queryVec] = await this.embedding.embed([query]);
    const queryBlob = serializeVector(queryVec);

    try {
      const rows = this.db
        .prepare(
          `SELECT note_id, vec_distance_cosine(vector, ?) as distance
           FROM embeddings WHERE stale = 0
           ORDER BY distance ASC LIMIT ?`,
        )
        .all(queryBlob, limit) as { note_id: string; distance: number }[];
      return rows.map((r) => ({ noteId: r.note_id, distance: r.distance }));
    } catch {
      return [];
    }
  }

  private fetchNotes(noteIds: string[], rankedIds: string[]): SearchResultItem[] {
    return noteIds
      .map((id) => {
        const row = this.db
          .prepare('SELECT * FROM notes WHERE id = ?')
          .get(id) as NoteRow | undefined;
        if (!row) return null;
        return {
          id: row.id,
          path: row.path,
          title: row.title,
          author: row.author,
          status: row.status,
          score: 1 / (1 + rankedIds.indexOf(id)),
        };
      })
      .filter((r): r is SearchResultItem => r !== null);
  }
}

// --- helpers ---

function buildFtsQuery(query: string): string {
  const tokens = query.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return '';
  return tokens.map((t) => `"${t.replace(/"/g, '""')}"*`).join(' ');
}

function serializeVector(vec: number[]): Buffer {
  const buf = Buffer.allocUnsafe(vec.length * 4);
  vec.forEach((v, i) => buf.writeFloatLE(v, i * 4));
  return buf;
}

function rrfFusion(list1: string[], list2: string[], k = 60): string[] {
  const scores = new Map<string, number>();
  const add = (ids: string[]) =>
    ids.forEach((id, i) => scores.set(id, (scores.get(id) ?? 0) + 1 / (k + i + 1)));
  add(list1);
  add(list2);
  return [...scores.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}

function weightedFusion(
  kwIds: string[],
  semItems: Array<{ noteId: string; distance: number }>,
  alpha: number,
  totalCandidates: number,
): string[] {
  const scores = new Map<string, number>();

  kwIds.forEach((id, rank) => {
    const norm = totalCandidates > 0 ? 1 - rank / totalCandidates : 0;
    scores.set(id, (scores.get(id) ?? 0) + (1 - alpha) * norm);
  });

  semItems.forEach(({ noteId, distance }) => {
    const sim = Math.max(0, 1 - distance / 2);
    scores.set(noteId, (scores.get(noteId) ?? 0) + alpha * sim);
  });

  return [...scores.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}
