import path from 'node:path';
import { FakeEmbeddingProvider } from '../../embedding/FakeEmbeddingProvider.js';
import { KbIndex } from '../../index/KbIndex.js';
import { KbPolicy } from '../../policy/KbPolicy.js';
import { KB0_VERSION } from '../../version.js';

interface StatusCmdOptions {
  vault?: string;
}

export async function statusCmd(options: StatusCmdOptions): Promise<void> {
  const vaultDir = options.vault ?? process.env['KB0_VAULT_DIR'] ?? process.cwd();
  const dbPath = path.join(vaultDir, '.vault-index', 'index.db');
  const logFile = path.join(vaultDir, '.vault-index', 'kb0.log');

  const policy = KbPolicy.load(vaultDir);
  const index = new KbIndex({ dbPath, vaultDir, embedding: new FakeEmbeddingProvider() });

  try {
    console.log(`kb0 ${KB0_VERSION}`);
    console.log(`Vault:            ${vaultDir}`);
    console.log(`Policy mode:      ${policy.mode}${policy.policyFileExists ? '' : '  ⚠ no .vault-policy.yaml'}`);
    console.log(`Notes indexed:    ${index.getNoteCount()}`);
    console.log(`Stale embeddings: ${index.countStaleEmbeddings()}`);
    console.log(`Embedding model:  ${index.embeddingModel}`);
    console.log(`Log file:         ${logFile}`);
  } finally {
    index.close();
  }
}
