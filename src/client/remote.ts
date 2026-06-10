import { randomUUID } from 'node:crypto';
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
import {
  KbAclDeniedError,
  KbConflictError,
  KbError,
  KbNotFoundError,
  KbValidationError,
} from './errors.js';
import type {
  ListParams,
  SearchParams,
  StatusResult,
  UpdateParams,
  WriteParams,
} from './VaultClient.js';

export const DEFAULT_CLOUD_URL = 'https://kb0-api-production.up.railway.app';

/** What the cloud vault API returns for a single note. */
interface CloudNote {
  path: string;
  title: string;
  content: string;
  hash: string;
  frontmatter: Record<string, unknown>;
  updatedAt: string;
}

interface CloudEntry {
  path: string;
  title: string;
  status: string;
  tags: string[];
  updatedAt: string;
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}
function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

/**
 * The remote backend behind a `kb0://` vault. Talks REST to the kb0 cloud's
 * agent self-routes (`/v1/vault/*`) with the API key, and maps the cloud's note
 * shape onto the same typed outputs the local MCP tools return — so callers use
 * the identical VaultClient methods whether the vault is local or hosted.
 *
 * Hosted search/links/backlinks are not available yet (they need the index that
 * ships in a later release); those methods throw a clear error.
 */
export class RemoteVault {
  private readonly base: string;

  constructor(
    cloudUrl: string,
    private readonly apiKey: string,
    private readonly agent: string,
  ) {
    this.base = cloudUrl.replace(/\/+$/, '');
  }

  private notesUrl(path: string): string {
    const encoded = path
      .split('/')
      .map((seg) => encodeURIComponent(seg))
      .join('/');
    return `${this.base}/v1/vault/notes/${encoded}`;
  }

  private async request(
    method: string,
    url: string,
    init: { body?: unknown; ifMatch?: string } = {},
  ): Promise<Response> {
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.apiKey}`,
      'x-kb0-agent': this.agent, // stamps the agent identity on hosted-vault audit events
    };
    if (init.body !== undefined) headers['content-type'] = 'application/json';
    if (init.ifMatch) headers['if-match'] = init.ifMatch;
    return fetch(url, {
      method,
      headers,
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    });
  }

  /** Throw a typed KbError for a non-2xx cloud response. */
  private async throwFor(res: Response): Promise<never> {
    const body = (await res.json().catch(() => null)) as { message?: string; error?: string } | null;
    const msg = body?.message ?? body?.error ?? `cloud responded ${res.status}`;
    if (res.status === 404) throw new KbNotFoundError(msg);
    if (res.status === 409) throw new KbConflictError(msg);
    if (res.status === 401 || res.status === 403) throw new KbAclDeniedError(msg);
    if (res.status === 400) throw new KbValidationError(msg);
    throw new KbError(msg);
  }

  private async tree(): Promise<CloudEntry[]> {
    const res = await this.request('GET', `${this.base}/v1/vault/tree`);
    if (!res.ok) await this.throwFor(res);
    const data = (await res.json()) as { entries?: CloudEntry[] };
    return data.entries ?? [];
  }

  private toRead(n: CloudNote): ReadOutput {
    const fm = n.frontmatter ?? {};
    return {
      path: n.path,
      hash: n.hash,
      content: n.content,
      frontmatter: {
        ...fm,
        id: str(fm.id),
        title: str(fm.title, n.title),
        author: str(fm.author),
        status: str(fm.status, 'draft'),
        tags: strArray(fm.tags),
        created: str(fm.created, n.updatedAt),
        updated: str(fm.updated, n.updatedAt),
      },
    };
  }

  // ── CRUD ───────────────────────────────────────────────────────────────────

  async read(path: string): Promise<ReadOutput> {
    const res = await this.request('GET', this.notesUrl(path));
    if (!res.ok) await this.throwFor(res);
    return this.toRead((await res.json()) as CloudNote);
  }

  async write(path: string, params: WriteParams): Promise<WriteOutput> {
    const id = randomUUID();
    const res = await this.request('PUT', this.notesUrl(path), {
      body: {
        title: params.title,
        content: params.content,
        frontmatter: {
          id,
          author: this.agent,
          status: params.status ?? 'draft',
          tags: params.tags ?? [],
        },
      },
    });
    if (!res.ok) await this.throwFor(res);
    const n = (await res.json()) as CloudNote;
    return { path: n.path, hash: n.hash, id: str(n.frontmatter?.id, id) };
  }

  async update(path: string, params: UpdateParams): Promise<UpdateOutput> {
    const frontmatter: Record<string, unknown> = {};
    if (params.status !== undefined) frontmatter.status = params.status;
    if (params.tags !== undefined) frontmatter.tags = params.tags;
    const res = await this.request('PUT', this.notesUrl(path), {
      ifMatch: params.expectedHash,
      body: {
        content: params.content,
        ...(params.title !== undefined ? { title: params.title } : {}),
        ...(Object.keys(frontmatter).length ? { frontmatter } : {}),
      },
    });
    if (!res.ok) await this.throwFor(res);
    const n = (await res.json()) as CloudNote;
    return { path: n.path, hash: n.hash };
  }

  async delete(path: string): Promise<DeleteOutput> {
    const res = await this.request('DELETE', this.notesUrl(path));
    if (!res.ok && res.status !== 204) await this.throwFor(res);
    return { path };
  }

  async list(params: ListParams = {}): Promise<ListOutput> {
    let entries = await this.tree();
    if (params.prefix) entries = entries.filter((e) => e.path.startsWith(params.prefix!));
    if (params.status) entries = entries.filter((e) => e.status === params.status);
    if (params.tag) entries = entries.filter((e) => e.tags.includes(params.tag!));
    const total = entries.length;
    const notes = entries.slice(0, params.limit ?? 50).map((e) => ({
      id: '',
      path: e.path,
      title: e.title,
      status: e.status,
      tags: e.tags,
    }));
    return { notes, total };
  }

  async recent(limit = 10): Promise<RecentOutput> {
    const entries = await this.tree(); // already newest-first
    return {
      notes: entries.slice(0, limit).map((e) => ({
        path: e.path,
        title: e.title,
        updated: e.updatedAt,
        status: e.status,
      })),
    };
  }

  async search(query: string, params: SearchParams = {}): Promise<SearchOutput> {
    const qs = new URLSearchParams({ q: query });
    if (params.limit) qs.set('limit', String(params.limit));
    if (params.filters?.status) qs.set('status', params.filters.status);
    if (params.filters?.tags?.length) qs.set('tag', params.filters.tags[0]);
    const res = await this.request('GET', `${this.base}/v1/vault/search?${qs.toString()}`);
    if (!res.ok) await this.throwFor(res);
    return (await res.json()) as SearchOutput;
  }

  async links(path: string): Promise<LinksOutput> {
    const res = await this.request('GET', `${this.base}/v1/vault/links?path=${encodeURIComponent(path)}`);
    if (!res.ok) await this.throwFor(res);
    return (await res.json()) as LinksOutput;
  }

  async backlinks(path: string): Promise<BacklinksOutput> {
    const res = await this.request('GET', `${this.base}/v1/vault/backlinks?path=${encodeURIComponent(path)}`);
    if (!res.ok) await this.throwFor(res);
    return (await res.json()) as BacklinksOutput;
  }

  async status(vault: string): Promise<StatusResult> {
    const entries = await this.tree();
    return {
      vault,
      agent: this.agent,
      version: KB0_VERSION,
      notes: entries.length,
      stale_embeddings: 0,
      embedding_model: 'hosted (kb0 cloud)',
      policy_mode: 'enforced',
      policy_file: false,
      log_file: '(hosted)',
    };
  }

}
