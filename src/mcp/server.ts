import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import path from 'node:path';
import type { KbIndex } from '../index/KbIndex.js';
import type { Logger } from '../logger/Logger.js';
import { NullLogger } from '../logger/NullLogger.js';
import type { KbPolicy } from '../policy/KbPolicy.js';
import type { KbStore } from '../store/KbStore.js';
import type { KbWatcher } from '../watcher/KbWatcher.js';
import { KB0_VERSION } from '../version.js';
import type { ToolContext } from './tool-base.js';
import { ALL_TOOLS } from './tools/index.js';

export interface KbMcpServerConfig {
  store: KbStore;
  index: KbIndex;
  policy: KbPolicy;
  watcher?: KbWatcher;
  agentIdentity: string;
  vaultDir: string;
  logger?: Logger;
}

export class KbMcpServer {
  private readonly server: McpServer;
  private readonly config: KbMcpServerConfig;
  private transport: StdioServerTransport | null = null;

  constructor(config: KbMcpServerConfig) {
    this.config = config;
    this.server = new McpServer({ name: 'kb0', version: KB0_VERSION });

    const logger = config.logger ?? new NullLogger();
    const logFile = path.join(config.vaultDir, '.vault-index', 'kb0.log');

    const ctx: ToolContext = {
      store: config.store,
      index: config.index,
      policy: config.policy,
      agentIdentity: config.agentIdentity,
      vaultDir: config.vaultDir,
      logFile,
      logger,
      log: (level, event, fields) => logger.log(level, event, fields),
    };

    for (const tool of ALL_TOOLS) {
      tool.register(this.server, ctx);
    }
  }

  async connect(): Promise<void> {
    this.transport = new StdioServerTransport();
    await this.server.connect(this.transport);
  }

  async close(): Promise<void> {
    await this.config.watcher?.stop();
    this.config.index.close();
    await this.server.close();
  }
}
