import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { KbIndex } from '../index/KbIndex.js';
import type { KbStore } from '../store/KbStore.js';
import type { KbWatcher } from '../watcher/KbWatcher.js';
import type { ToolContext } from './tool-base.js';
import { ALL_TOOLS } from './tools/index.js';

export interface KbMcpServerConfig {
  store: KbStore;
  index: KbIndex;
  watcher?: KbWatcher;
  agentIdentity: string;
}

export class KbMcpServer {
  private readonly server: McpServer;
  private readonly config: KbMcpServerConfig;
  private transport: StdioServerTransport | null = null;

  constructor(config: KbMcpServerConfig) {
    this.config = config;
    this.server = new McpServer({ name: 'kb0', version: '0.1.0' });

    const ctx: ToolContext = {
      store: config.store,
      index: config.index,
      agentIdentity: config.agentIdentity,
      log: () => {}, // Sprint 4: wire to telemetry
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
