import type Database from 'better-sqlite3';

export const migration002 = {
  name: '002_fts5',
  up(db: Database.Database): void {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
        note_id UNINDEXED,
        title,
        body
      );
    `);
  },
};
