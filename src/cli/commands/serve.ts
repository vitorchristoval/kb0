import path from 'node:path';
import { FakeEmbeddingProvider } from '../../embedding/FakeEmbeddingProvider.js';
import { OpenAIEmbeddingProvider } from '../../embedding/OpenAIEmbeddingProvider.js';
import { GitAdapter } from '../../git/GitAdapter.js';
import { KbIndex } from '../../index/KbIndex.js';
import { KbMcpServer } from '../../mcp/server.js';
import { KbStore } from '../../store/KbStore.js';
import { LocalFileWatcher } from '../../watcher/LocalFileWatcher.js';

interface ServeOptions {
  vault?: string;
  agent?: string;
}

export async function serveVault(options: ServeOptions): Promise<void> {
  const vaultDir = options.vault ?? process.env['KB0_VAULT_DIR'] ?? process.cwd();
  const agentName = options.agent ?? process.env['KB0_AGENT'];

  if (!agentName) {
    console.error('Error: --agent <name> is required (or set KB0_AGENT env var).');
    process.exit(1);
  }

  const dbPath = path.join(vaultDir, '.vault-index', 'index.db');
  const embedding = process.env['OPENAI_API_KEY']
    ? new OpenAIEmbeddingProvider()
    : new FakeEmbeddingProvider();

  const git = new GitAdapter({
    dir: vaultDir,
    authorName: `agent:${agentName}`,
    authorEmail: `${agentName}@kb0.local`,
  });

  const watcher = new LocalFileWatcher();
  const index = new KbIndex({ dbPath, vaultDir, embedding });
  const store = new KbStore(vaultDir, git, { index, watcher });

  const mcpServer = new KbMcpServer({ store, index, watcher, agentIdentity: agentName });

  const shutdown = async (): Promise<void> => {
    await mcpServer.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await watcher.start(vaultDir);
  await mcpServer.connect();
}
