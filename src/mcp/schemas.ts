import { z } from 'zod';

const NotePath = z
  .string()
  .min(1)
  .describe('Relative path within the vault, e.g. "notes/arch.md"');

const Hash = z
  .string()
  .length(64)
  .describe(
    'SHA-256 hex digest of the file as stored on disk (frontmatter YAML + body). Obtain via vault.read.',
  );

// ── inputs ────────────────────────────────────────────────────────────────────

export const SearchInput = z.object({
  query: z.string().min(1),
  mode: z.enum(['hybrid', 'semantic', 'keyword']).default('hybrid'),
  ranking: z.enum(['rrf', 'weighted']).default('rrf'),
  limit: z.number().int().min(1).max(100).default(10),
  filters: z
    .object({
      status: z.enum(['draft', 'reviewed', 'canonical']).optional(),
      tags: z.array(z.string()).optional(),
    })
    .optional(),
});

export const ReadInput = z.object({ path: NotePath });

export const ListInput = z.object({
  prefix: z.string().optional(),
  tag: z.string().optional(),
  status: z.enum(['draft', 'reviewed', 'canonical']).optional(),
  limit: z.number().int().min(1).max(500).default(50),
});

// author / id / created / updated are intentionally absent.
// The server always derives them from ctx.agentIdentity — callers cannot forge provenance.
export const WriteInput = z.object({
  path: NotePath,
  title: z.string().min(1),
  content: z.string(),
  status: z.enum(['draft', 'reviewed', 'canonical']).default('draft'),
  tags: z.array(z.string()).default([]),
});

export const UpdateInput = z.object({
  path: NotePath,
  expectedHash: Hash,
  content: z.string(),
  title: z.string().min(1).optional(),
  status: z.enum(['draft', 'reviewed', 'canonical']).optional(),
  tags: z.array(z.string()).optional(),
});

export const DeleteInput = z.object({ path: NotePath });
export const BacklinksInput = z.object({ path: NotePath });
export const LinksInput = z.object({ path: NotePath });
export const RecentInput = z.object({
  limit: z.number().int().min(1).max(100).default(10),
});

// ── output types ──────────────────────────────────────────────────────────────

export interface ReadOutput {
  path: string;
  hash: string;
  content: string;
  frontmatter: {
    id: string;
    title: string;
    author: string;
    status: string;
    tags: string[];
    created: string;
    updated: string;
    [key: string]: unknown;
  };
}

export interface WriteOutput {
  path: string;
  hash: string;
  id: string;
}

export interface UpdateOutput {
  path: string;
  hash: string;
}

export interface DeleteOutput {
  path: string;
}

export interface SearchOutput {
  results: Array<{
    path: string;
    title: string;
    author: string;
    status: string;
    score: number;
    excerpt: string;
  }>;
  warnings: string[];
}

export interface ListOutput {
  notes: Array<{
    id: string;
    path: string;
    title: string;
    status: string;
    tags: string[];
  }>;
  total: number;
}

export interface LinkEntry {
  path: string;
  title: string;
}

export interface BacklinksOutput {
  path: string;
  backlinks: LinkEntry[];
}

export interface LinksOutput {
  path: string;
  links: LinkEntry[];
}

export interface RecentOutput {
  notes: Array<{
    path: string;
    title: string;
    updated: string;
    status: string;
  }>;
}
