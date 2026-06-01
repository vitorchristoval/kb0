import path from 'node:path';
import { FakeEmbeddingProvider } from '../../embedding/FakeEmbeddingProvider.js';
import { OpenAIEmbeddingProvider } from '../../embedding/OpenAIEmbeddingProvider.js';
import { GitAdapter } from '../../git/GitAdapter.js';
import { KbIndex } from '../../index/KbIndex.js';
import { FileLogger } from '../../logger/FileLogger.js';
import { KbMcpServer } from '../../mcp/server.js';
import { KbPolicy } from '../../policy/KbPolicy.js';
import { KbStore } from '../../store/KbStore.js';
import { LocalFileWatcher } from '../../watcher/LocalFileWatcher.js';

interface ServeOptions {
  vault?: string;
  agent?: string;
  strict?: boolean;
}

export async function serveVault(options: ServeOptions): Promise<void> {
  const vaultDir = options.vault ?? process.env['KB0_VAULT_DIR'] ?? process.cwd();
  const agentName = options.agent ?? process.env['KB0_AGENT'];
  const strict = options.strict ?? process.env['KB0_STRICT'] === '1';

  if (!agentName) {
    console.error('Error: --agent <name> is required (or set KB0_AGENT env var).');
    process.exit(1);
  }

  const policy = KbPolicy.load(vaultDir, strict);

  const dbPath = path.join(vaultDir, '.vault-index', 'index.db');
  const logFile = path.join(vaultDir, '.vault-index', 'kb0.log');

  const embedding = process.env['OPENAI_API_KEY']
    ? new OpenAIEmbeddingProvider()
    : new FakeEmbeddingProvider();

  const git = new GitAdapter({
    dir: vaultDir,
    authorName: `agent:${agentName}`,
    authorEmail: `${agentName}@kb0.local`,
  });

  const logger = new FileLogger(logFile);
  const watcher = new LocalFileWatcher();
  const index = new KbIndex({ dbPath, vaultDir, embedding });
  const store = new KbStore(vaultDir, git, { index, watcher });

  const mcpServer = new KbMcpServer({
    store,
    index,
    policy,
    watcher,
    agentIdentity: agentName,
    vaultDir,
    logger,
  });

  const shutdown = async (): Promise<void> => {
    logger.log('info', 'server.shutdown', { agent: agentName });
    await mcpServer.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  logger.log('info', 'server.start', {
    agent: agentName,
    vault: vaultDir,
    policy_mode: policy.mode,
  });

  await watcher.start(vaultDir);
  await mcpServer.connect();
}
