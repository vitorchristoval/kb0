export interface ParsedLinks {
  wikilinks: string[];
  tags: string[];
}

export function parseLinks(content: string): ParsedLinks {
  const wikilinkMatches = [...content.matchAll(/\[\[([^\]]+)\]\]/g)];
  const tagMatches = [...content.matchAll(/#([a-zA-Z_][a-zA-Z0-9_/-]*)/g)];
  return {
    wikilinks: [...new Set(wikilinkMatches.map((m) => m[1].trim()))],
    tags: [...new Set(tagMatches.map((m) => m[1]))],
  };
}
