import { describe, expect, it } from 'vitest';
import {
  FrontmatterSchema,
  buildFrontmatter,
  normalizeFrontmatter,
  parseNote,
  serializeNote,
} from './frontmatter.js';

const MTIME = '2026-01-01T00:00:00.000Z';

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

describe('normalizeFrontmatter', () => {
  it('stamps a plain markdown file with no frontmatter', () => {
    const { raw, wasModified } = normalizeFrontmatter('# My Idea\n\nsome text', {
      mtimeIso: MTIME,
      fallbackTitle: 'my-idea',
    });
    expect(wasModified).toBe(true);
    const note = parseNote(raw);
    expect(note.frontmatter.author).toBe('human');
    expect(note.frontmatter.title).toBe('My Idea'); // from the heading
    expect(note.frontmatter.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(note.frontmatter.created).toBe(MTIME);
  });

  it('falls back to the filename when there is no heading', () => {
    const { raw } = normalizeFrontmatter('just text, no heading', {
      mtimeIso: MTIME,
      fallbackTitle: 'untitled-note',
    });
    expect(parseNote(raw).frontmatter.title).toBe('untitled-note');
  });

  it('fills only the missing fields, preserving provided ones', () => {
    const input = `---\ntitle: Kept Title\nauthor: agent:bot\n---\nbody`;
    const { raw, wasModified } = normalizeFrontmatter(input, {
      mtimeIso: MTIME,
      fallbackTitle: 'fallback',
    });
    expect(wasModified).toBe(true);
    const fm = parseNote(raw).frontmatter;
    expect(fm.title).toBe('Kept Title'); // preserved
    expect(fm.author).toBe('agent:bot'); // preserved
    expect(fm.id).toBeTruthy(); // filled
  });

  it('preserves unknown custom fields', () => {
    const input = `---\ncustom_field: hello\n---\nbody`;
    const { raw } = normalizeFrontmatter(input, { mtimeIso: MTIME, fallbackTitle: 'x' });
    expect(raw).toContain('custom_field: hello');
  });

  it('returns wasModified false for already-valid frontmatter', () => {
    const valid = serializeNote('body', buildFrontmatter({ title: 'T', author: 'human' }));
    const { wasModified } = normalizeFrontmatter(valid, { mtimeIso: MTIME, fallbackTitle: 'x' });
    expect(wasModified).toBe(false);
  });

  it('replaces a date-only created with a valid datetime', () => {
    const input = `---\ntitle: T\nauthor: human\ncreated: "2024-01-01"\n---\nbody`;
    const { raw } = normalizeFrontmatter(input, { mtimeIso: MTIME, fallbackTitle: 'x' });
    expect(parseNote(raw).frontmatter.created).toBe(MTIME);
  });
});
