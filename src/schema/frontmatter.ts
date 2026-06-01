import matter from 'gray-matter';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

export const FrontmatterSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  author: z.string().min(1),
  status: z.enum(['draft', 'reviewed', 'canonical']).default('draft'),
  tags: z.array(z.string()).default([]),
  created: z.string().datetime(),
  updated: z.string().datetime(),
});

export type Frontmatter = z.infer<typeof FrontmatterSchema>;

export interface Note {
  frontmatter: Frontmatter;
  content: string;
  raw: string;
}

export function parseNote(raw: string): Note {
  const parsed = matter(raw);
  const frontmatter = FrontmatterSchema.parse(parsed.data);
  return {
    frontmatter,
    content: parsed.content.trim(),
    raw,
  };
}

export function serializeNote(content: string, frontmatter: Frontmatter): string {
  return matter.stringify(content, frontmatter as Record<string, unknown>);
}

export interface NormalizeOptions {
  /** ISO timestamp used for created/updated when absent (typically the file mtime). */
  mtimeIso: string;
  /** Title used when the file has none and no heading is found (typically the filename). */
  fallbackTitle: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidDatetime(v: unknown): boolean {
  return typeof v === 'string' && z.string().datetime().safeParse(v).success;
}

function deriveTitle(content: string, fallback: string): string {
  const heading = content.match(/^#\s+(.+)$/m);
  return heading ? heading[1].trim() : fallback;
}

/**
 * Ensures a markdown file has complete, valid frontmatter — filling in any
 * missing required fields while preserving everything the user already wrote
 * (including unknown/custom fields).
 *
 * Manually-added files (plain markdown, no frontmatter) get stamped with
 * `author: human`, a generated id, and timestamps from the file mtime. This is
 * what lets humans drop `.md` files into the vault and have them indexed —
 * markdown stays the source of truth.
 *
 * Returns the (possibly rewritten) raw content and whether anything changed.
 * The generated id is persisted to disk by the caller so it stays stable across
 * reindexes.
 */
export function normalizeFrontmatter(
  raw: string,
  opts: NormalizeOptions,
): { raw: string; wasModified: boolean } {
  const parsed = matter(raw);
  const data: Record<string, unknown> = { ...parsed.data };
  let modified = false;

  // YAML may parse unquoted ISO timestamps into Date objects — coerce back.
  if (data['created'] instanceof Date) data['created'] = data['created'].toISOString();
  if (data['updated'] instanceof Date) data['updated'] = data['updated'].toISOString();

  if (typeof data['id'] !== 'string' || !UUID_RE.test(data['id'])) {
    data['id'] = randomUUID();
    modified = true;
  }
  if (typeof data['title'] !== 'string' || data['title'].length === 0) {
    data['title'] = deriveTitle(parsed.content, opts.fallbackTitle);
    modified = true;
  }
  if (typeof data['author'] !== 'string' || data['author'].length === 0) {
    data['author'] = 'human';
    modified = true;
  }
  if (!['draft', 'reviewed', 'canonical'].includes(data['status'] as string)) {
    data['status'] = 'draft';
    modified = true;
  }
  if (!isValidDatetime(data['created'])) {
    data['created'] = opts.mtimeIso;
    modified = true;
  }
  if (!isValidDatetime(data['updated'])) {
    data['updated'] = opts.mtimeIso;
    modified = true;
  }

  if (!modified) return { raw, wasModified: false };

  // Guard: the merged frontmatter must now satisfy the schema.
  FrontmatterSchema.parse(data);
  return { raw: matter.stringify(parsed.content, data), wasModified: true };
}

type BuildInput = {
  title: string;
  author: string;
  id?: string;
  status?: 'draft' | 'reviewed' | 'canonical';
  tags?: string[];
  created?: string;
  updated?: string;
};

export function buildFrontmatter(input: BuildInput): Frontmatter {
  const now = new Date().toISOString();
  return FrontmatterSchema.parse({
    id: input.id ?? randomUUID(),
    title: input.title,
    author: input.author,
    status: input.status ?? 'draft',
    tags: input.tags ?? [],
    created: input.created ?? now,
    updated: input.updated ?? now,
  });
}
