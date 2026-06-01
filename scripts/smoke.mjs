// Post-build smoke test — runs against the COMPILED dist as real ESM under node.
// Catches ESM/CJS interop bugs (e.g. require() in ESM) that vitest cannot, because
// vitest provides a require shim that the published package does not have.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'kb0-smoke-'));
let failed = false;

function check(name, cond) {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    console.error(`  ✗ ${name}`);
    failed = true;
  }
}

try {
  const { openDatabase } = await import('../dist/index/db/db.js');
  const db = openDatabase(join(dir, 'index.db'));

  const vec = db.prepare('SELECT vec_version() as v').get();
  check('sqlite-vec extension loads', typeof vec?.v === 'string');

  const fts = db.prepare("SELECT name FROM sqlite_master WHERE name='notes_fts'").get();
  check('FTS5 virtual table exists', fts?.name === 'notes_fts');

  db.close();

  const { KB0_VERSION } = await import('../dist/version.js');
  check('version export is present', typeof KB0_VERSION === 'string');
} catch (e) {
  console.error('  ✗ smoke test threw:', e.message);
  failed = true;
} finally {
  rmSync(dir, { recursive: true, force: true });
}

if (failed) {
  console.error('\nSmoke test FAILED — do not publish.');
  process.exit(1);
}
console.log('\nSmoke test passed.');
