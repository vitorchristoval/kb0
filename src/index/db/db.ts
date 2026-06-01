import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { migration001 } from './migrations/001_initial.js';
import { migration002 } from './migrations/002_fts5.js';
import { migration003 } from './migrations/003_embeddings.js';
import { runMigrations } from './runner.js';

// sqlite-vec is CommonJS. This package is ESM ("type": "module"), where the
// global `require` does not exist — createRequire bridges the gap. Without this,
// the require throws "require is not defined" and silently disables semantic search.
const nodeRequire = createRequire(import.meta.url);

export function openDatabase(dbPath: string): Database.Database {
  mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  try {
    const sqliteVec = nodeRequire('sqlite-vec') as { load: (db: Database.Database) => void };
    sqliteVec.load(db);
  } catch (e) {
    process.stderr.write(
      `[kb0] warning: sqlite-vec failed to load — semantic search unavailable (${String(e)})\n`,
    );
  }

  runMigrations(db, [migration001, migration002, migration003]);

  return db;
}
