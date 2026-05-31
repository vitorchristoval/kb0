import fs from 'node:fs/promises';
import path from 'node:path';
import { OpenAIEmbeddingProvider } from '../../embedding/OpenAIEmbeddingProvider.js';
import { KbIndex } from '../../index/KbIndex.js';

async function collectMarkdownFiles(vaultDir: string): Promise<string[]> {
  const entries = (await fs.readdir(vaultDir, { recursive: true })) as string[];
  return entries
    .filter((e) => e.endsWith('.md'))
    .filter((e) => !e.startsWith('.vault-index') && !e.startsWith('.git'));
}

export async function reindexVault(options: { rebuild?: boolean }): Promise<void> {
  const vaultDir = process.cwd();
  const dbPath = path.join(vaultDir, '.vault-index', 'index.db');

  if (!process.env['OPENAI_API_KEY']) {
    console.error('Error: OPENAI_API_KEY environment variable is required.');
    process.exit(1);
  }

  const embedding = new OpenAIEmbeddingProvider();
  const index = new KbIndex({ dbPath, vaultDir, embedding });

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
      await index.indexNote(toIndex[i]);
    } catch (err) {
      process.stderr.write(`\n[kb0] failed to index ${toIndex[i]}: ${err}\n`);
    }
  }
  process.stdout.write(`\rIndexed ${total}/${total} notes. Done.\n`);

  index.close();
}
