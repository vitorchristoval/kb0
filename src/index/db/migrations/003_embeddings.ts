import type Database from 'better-sqlite3';

export const migration003 = {
  name: '003_embeddings',
  up(db: Database.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS embeddings (
        note_id    TEXT    PRIMARY KEY REFERENCES notes(id) ON DELETE CASCADE,
        model      TEXT    NOT NULL,
        dimensions INTEGER NOT NULL,
        vector     BLOB    NOT NULL,
        stale      INTEGER NOT NULL DEFAULT 0,
        indexed_at TEXT    NOT NULL
      );
    `);
  },
};
