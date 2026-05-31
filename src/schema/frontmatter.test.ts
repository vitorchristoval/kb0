import { describe, expect, it } from 'vitest';
import { FrontmatterSchema, buildFrontmatter, parseNote, serializeNote } from './frontmatter.js';

const VALID_FM = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  title: 'Test Note',
  author: 'human',
  status: 'draft' as const,
  tags: [],
  created: new Date().toISOString(),
  updated: new Date().toISOString(),
};

describe('FrontmatterSchema', () => {
  it('accepts a valid frontmatter', () => {
    expect(FrontmatterSchema.safeParse(VALID_FM).success).toBe(true);
  });

  it('rejects missing required fields', () => {
    expect(FrontmatterSchema.safeParse({ title: 'No author' }).success).toBe(false);
  });

  it('rejects an invalid status', () => {
    expect(FrontmatterSchema.safeParse({ ...VALID_FM, status: 'published' }).success).toBe(false);
  });

  it('rejects a non-uuid id', () => {
    expect(FrontmatterSchema.safeParse({ ...VALID_FM, id: 'not-a-uuid' }).success).toBe(false);
  });

  it('defaults status to draft when omitted', () => {
    const { id: _, status: __, ...rest } = VALID_FM;
    const result = FrontmatterSchema.safeParse({ ...rest, id: VALID_FM.id });
    expect(result.success && result.data.status).toBe('draft');
  });
});

describe('buildFrontmatter', () => {
  it('auto-generates id, created, updated', () => {
    const fm = buildFrontmatter({ title: 'My Note', author: 'human' });
    expect(fm.id).toBeTruthy();
    expect(fm.created).toBeTruthy();
    expect(fm.updated).toBeTruthy();
    expect(fm.status).toBe('draft');
    expect(fm.tags).toEqual([]);
  });

  it('preserves a supplied id', () => {
    const id = '123e4567-e89b-12d3-a456-426614174000';
    const fm = buildFrontmatter({ title: 'T', author: 'human', id });
    expect(fm.id).toBe(id);
  });

  it('accepts agent author format', () => {
    const fm = buildFrontmatter({ title: 'Agent note', author: 'agent:flowgen-v2' });
    expect(fm.author).toBe('agent:flowgen-v2');
  });
});

describe('parseNote / serializeNote', () => {
  it('roundtrips content and frontmatter', () => {
    const fm = buildFrontmatter({ title: 'Roundtrip', author: 'human' });
    const raw = serializeNote('Hello world', fm);
    const parsed = parseNote(raw);

    expect(parsed.frontmatter.title).toBe('Roundtrip');
    expect(parsed.frontmatter.author).toBe('human');
    expect(parsed.content).toBe('Hello world');
  });

  it('throws on invalid frontmatter', () => {
    const raw = `---\ntitle: Missing fields\n---\nContent`;
    expect(() => parseNote(raw)).toThrow();
  });
});
