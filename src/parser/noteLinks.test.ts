import { describe, expect, it } from 'vitest';
import { parseLinks } from './noteLinks.js';

describe('parseLinks', () => {
  it('extracts wikilinks', () => {
    const { wikilinks } = parseLinks('See [[Architecture]] and [[API Reference]].');
    expect(wikilinks).toEqual(['Architecture', 'API Reference']);
  });

  it('deduplicates wikilinks', () => {
    const { wikilinks } = parseLinks('[[note]] appears [[note]] twice');
    expect(wikilinks).toHaveLength(1);
    expect(wikilinks[0]).toBe('note');
  });

  it('trims whitespace in wikilinks', () => {
    const { wikilinks } = parseLinks('[[ padded note ]]');
    expect(wikilinks[0]).toBe('padded note');
  });

  it('extracts tags', () => {
    const { tags } = parseLinks('This is #important and tagged as #work/project');
    expect(tags).toContain('important');
    expect(tags).toContain('work/project');
  });

  it('deduplicates tags', () => {
    const { tags } = parseLinks('#todo first item, #todo second item');
    expect(tags).toHaveLength(1);
    expect(tags[0]).toBe('todo');
  });

  it('requires tags to start with a letter or underscore', () => {
    const { tags } = parseLinks('#123invalid #_valid #valid');
    expect(tags).not.toContain('123invalid');
    expect(tags).toContain('_valid');
    expect(tags).toContain('valid');
  });

  it('returns empty arrays when there are no links or tags', () => {
    const { wikilinks, tags } = parseLinks('Plain content with no special syntax.');
    expect(wikilinks).toEqual([]);
    expect(tags).toEqual([]);
  });
});
