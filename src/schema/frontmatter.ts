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
