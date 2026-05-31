import type Database from 'better-sqlite3';

// MIGRATION POLICY — forward-only, additive only.
//
// Never DROP COLUMN, never RENAME COLUMN, never ALTER COLUMN TYPE.
// Destructive changes follow a three-step process:
//   1. Add new column (this migration or the next)
//   2. Dual-write to old and new columns for one release
//   3. Deprecate old column in a later migration (stop reading it; never drop)
//
// This ensures any vault opened by an older binary is never left corrupted.
// git revert is the rollback strategy for migration bugs.

export interface Migration {
  name: string;
  up(db: Database.Database): void;
}

export function runMigrations(db: Database.Database, migrations: Migration[]): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name       TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const applied = new Set(
    (db.prepare('SELECT name FROM _migrations').all() as { name: string }[]).map((r) => r.name),
  );

  const sorted = [...migrations].sort((a, b) => a.name.localeCompare(b.name));

  for (const migration of sorted) {
    if (applied.has(migration.name)) continue;
    db.transaction(() => {
      migration.up(db);
      db.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)').run(
        migration.name,
        new Date().toISOString(),
      );
    })();
  }
}
