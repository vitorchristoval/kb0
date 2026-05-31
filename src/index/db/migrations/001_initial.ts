import type Database from 'better-sqlite3';

export const migration001 = {
  name: '001_initial',
  up(db: Database.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS notes (
        id              TEXT PRIMARY KEY,
        path            TEXT NOT NULL UNIQUE,
        title           TEXT NOT NULL,
        author          TEXT NOT NULL,
        status          TEXT NOT NULL,
        created_at      TEXT NOT NULL,
        updated_at      TEXT NOT NULL,
        last_indexed_at TEXT
      );

      CREATE TABLE IF NOT EXISTS tags (
        note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
        tag     TEXT NOT NULL,
        PRIMARY KEY (note_id, tag)
      );

      CREATE TABLE IF NOT EXISTS links (
        source_id   TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
        target_path TEXT NOT NULL,
        PRIMARY KEY (source_id, target_path)
      );
    `);
  },
};
