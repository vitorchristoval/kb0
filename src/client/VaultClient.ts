import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type {
  BacklinksOutput,
  DeleteOutput,
  LinksOutput,
  ListOutput,
  ReadOutput,
  RecentOutput,
  SearchOutput,
  UpdateOutput,
  WriteOutput,
} from '../mcp/schemas.js';
import { KB0_VERSION } from '../version.js';
import { errorFromText } from './errors.js';

type NoteStatus = 'draft' | 'reviewed' | 'canonical';

export interface VaultClientOptions {
  /** Path to the vault directory. */
  vault: string;
  /** Agent identity — stamped on writes and checked against ACL. */
  agent: string;
  /** Command that launches the kb0 server. Default: 'kb0' (from `npm i kb0-mcp`). */
  command?: string;
  /** Extra environment for the server process, merged over the current env. */
  env?: Record<string, string>;
  /** Convenience for OPENAI_API_KEY on the server (enables semantic search). */
  openaiApiKey?: string;
  /** Require a .vault-policy.yaml to be present (passes `--strict`). */
  strict?: boolean;
}

export interface WriteParams {
  title: string;
  content: string;
  status?: NoteStatus;
  tags?: string[];
}

export interface UpdateParams {
  content: string;
  expectedHash: string;
  title?: string;
  status?: NoteStatus;
  tags?: string[];
}

export interface SearchParams {
  mode?: 'hybrid' | 'semantic' | 'keyword';
  ranking?: 'rrf' | 'weighted';
  limit?: number;
  filters?: { status?: NoteStatus; tags?: string[] };
}

export interface ListParams {
  prefix?: string;
  tag?: string;
  status?: NoteStatus;
  limit?: number;
}

export interface StatusResult {
  vault: string;
  agent: string;
  version: string;
  notes: number;
  stale_embeddings: number;
  embedding_model: string;
  policy_mode: 'enforced' | 'permissive';
  policy_file: boolean;
  log_file: string;
}

interface ToolResultLike {
  isError?: boolean;
  content?: Array<{ type?: string; text?: string }>;
  structuredContent?: unknown;
}

function textOf(result: ToolResultLike): string {
  return (result.content ?? [])
    .map((block) => block.text)
    .filter((text): text is string => typeof text === 'string')
    .join('\n');
}

/** Turn an MCP CallToolResult into a plain object, or throw a typed KbError. */
function unwrap<T>(result: unknown): T {
  const r = result as ToolResultLike;
  if (r.isError) throw errorFromText(textOf(r));
  if (r.structuredContent !== undefined && r.structuredContent !== null) {
    return r.structuredContent as T;
  }
  const text = textOf(r);
  try {
    return JSON.parse(text) as T;
  } catch {
    return { text } as unknown as T;
  }
}

/**
 * A thin client over the kb0 MCP server.
 *
 * Spawns `kb0 serve` as a subprocess and exposes the 10 vault tools as typed
 * async methods. The TypeScript counterpart of the Python `VaultClient`:
 *
 * ```ts
 * import { VaultClient } from 'kb0-mcp/client';
 *
 * const kb = await VaultClient.connect({ vault: './my-vault', agent: 'my-bot' });
 * try {
 *   await kb.write('notes/idea.md', { title: 'Idea', content: '…' });
 *   const hits = await kb.search('auth design', { limit: 5 });
 * } finally {
 *   await kb.close();
 * }
 * ```
 */
export class VaultClient {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;

  private constructor(private readonly options: VaultClientOptions) {}

  /** Spawn `kb0 serve` and connect to it over stdio. */
  static async connect(options: VaultClientOptions): Promise<VaultClient> {
    const vc = new VaultClient(options);
    await vc.open();
    return vc;
  }

  private async open(): Promise<void> {
    const { vault, agent, command = 'kb0', strict = false } = this.options;

    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) env[key] = value;
    }
    if (this.options.env) Object.assign(env, this.options.env);
    if (this.options.openaiApiKey) env['OPENAI_API_KEY'] = this.options.openaiApiKey;

    const args = ['serve', '--agent', agent, '--vault', vault];
    if (strict) args.push('--strict');

    this.transport = new StdioClientTransport({ command, args, env });
    this.client = new Client({ name: 'kb0-client', version: KB0_VERSION });
    await this.client.connect(this.transport);
  }

  /** Disconnect and stop the server subprocess. */
  async close(): Promise<void> {
    await this.client?.close();
    this.client = null;
    this.transport = null;
  }

  private async call<T>(name: string, args: Record<string, unknown>): Promise<T> {
    if (!this.client) {
      throw new Error('VaultClient is not connected — call VaultClient.connect(...) first.');
    }
    const result = await this.client.callTool({ name, arguments: args });
    return unwrap<T>(result);
  }

  // ── tools ──────────────────────────────────────────────────────────────────

  write(path: string, params: WriteParams): Promise<WriteOutput> {
    return this.call('vault.write', {
      path,
      title: params.title,
      content: params.content,
      status: params.status ?? 'draft',
      tags: params.tags ?? [],
    });
  }

  read(path: string): Promise<ReadOutput> {
    return this.call('vault.read', { path });
  }

  update(path: string, params: UpdateParams): Promise<UpdateOutput> {
    const args: Record<string, unknown> = {
      path,
      content: params.content,
      expectedHash: params.expectedHash,
    };
    if (params.title !== undefined) args['title'] = params.title;
    if (params.status !== undefined) args['status'] = params.status;
    if (params.tags !== undefined) args['tags'] = params.tags;
    return this.call('vault.update', args);
  }

  delete(path: string): Promise<DeleteOutput> {
    return this.call('vault.delete', { path });
  }

  search(query: string, params: SearchParams = {}): Promise<SearchOutput> {
    const args: Record<string, unknown> = {
      query,
      mode: params.mode ?? 'hybrid',
      ranking: params.ranking ?? 'rrf',
      limit: params.limit ?? 10,
    };
    if (params.filters !== undefined) args['filters'] = params.filters;
    return this.call('vault.search', args);
  }

  list(params: ListParams = {}): Promise<ListOutput> {
    const args: Record<string, unknown> = { limit: params.limit ?? 50 };
    if (params.prefix !== undefined) args['prefix'] = params.prefix;
    if (params.tag !== undefined) args['tag'] = params.tag;
    if (params.status !== undefined) args['status'] = params.status;
    return this.call('vault.list', args);
  }

  recent(limit = 10): Promise<RecentOutput> {
    return this.call('vault.recent', { limit });
  }

  backlinks(path: string): Promise<BacklinksOutput> {
    return this.call('vault.backlinks', { path });
  }

  links(path: string): Promise<LinksOutput> {
    return this.call('vault.links', { path });
  }

  status(): Promise<StatusResult> {
    return this.call('vault.status', {});
  }
}
