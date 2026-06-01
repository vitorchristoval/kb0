import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveEmbedding } from '../../embedding/resolveEmbedding.js';
import { GitAdapter } from '../../git/GitAdapter.js';
import { KbIndex } from '../../index/KbIndex.js';
import { KbStore } from '../../store/KbStore.js';

async function collectMarkdownFiles(vaultDir: string): Promise<string[]> {
  const entries = (await fs.readdir(vaultDir, { recursive: true })) as string[];
  return entries
    .filter((e) => e.endsWith('.md'))
    .filter((e) => !e.startsWith('.vault-index') && !e.startsWith('.git'));
}

export async function reindexVault(options: { rebuild?: boolean }): Promise<void> {
  const vaultDir = process.cwd();
  const dbPath = path.join(vaultDir, '.vault-index', 'index.db');

  const { provider: embedding, mode, summary } = resolveEmbedding();
  console.log(`Embeddings: ${summary}`);
  if (mode === 'fake') {
    console.log('Building keyword index only. Set OPENAI_API_KEY for semantic search.');
  }

  const index = new KbIndex({ dbPath, vaultDir, embedding });
  // git is unused here (ingest does not commit) but KbStore requires it.
  const git = new GitAdapter({ dir: vaultDir, authorName: 'kb0', authorEmail: 'kb0@localhost' });
  const store = new KbStore(vaultDir, git, { index });

  const allFiles = await collectMarkdownFiles(vaultDir);

  let toIndex: string[];
  if (options.rebuild) {
    index.rebuild();
    toIndex = allFiles;
  } else {
    toIndex = await index.filterNeedsIndexing(allFiles);
  }

  const total = toIndex.length;
  if (total === 0) {
    console.log('Index is up to date. Nothing to index.');
    index.close();
    return;
  }

  for (let i = 0; i < total; i++) {
    process.stdout.write(`\rIndexed ${i}/${total} notes...`);
    try {
      await store.ingest(toIndex[i]);
    } catch (err) {
      process.stderr.write(`\n[kb0] failed to index ${toIndex[i]}: ${err}\n`);
    }
  }
  process.stdout.write(`\rIndexed ${total}/${total} notes. Done.\n`);

  index.close();
}
