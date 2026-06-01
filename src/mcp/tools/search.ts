import { SearchInput, type SearchOutput } from '../schemas.js';
import { defineTool } from '../tool-base.js';

export const searchTool = defineTool({
  name: 'vault.search',

  description: `Searches the vault for notes matching a natural language or keyword query.
Use hybrid mode (default) to combine semantic relevance with keyword matching via Reciprocal Rank Fusion — best for most queries.
Use keyword mode when you need exact term matching (e.g. code symbols, error messages). Use semantic mode for conceptual queries with no specific keywords.
Do not use this when you already know the exact path; use vault.read directly.`,

  inputSchema: SearchInput,

  handler: async (input, ctx) => {
    const allowedGlobs = ctx.policy.getAllowedReadGlobs(ctx.agentIdentity);

    const result = await ctx.index.search(input.query, {
      mode: input.mode,
      ranking: input.ranking,
      limit: input.limit,
      alpha: 0.6,
      allowedGlobs,
    });

    const output: SearchOutput = {
      results: result.results.map((r) => ({
        path: r.path,
        title: r.title,
        author: r.author,
        status: r.status,
        score: r.score,
        excerpt: r.excerpt,
      })),
      warnings: result.warnings,
    };
    return output;
  },

  format: (out) => {
    if (out.results.length === 0) return 'No notes found.';

    const warning = out.warnings.includes('SEMANTIC_DEGRADED')
      ? '\n> ⚠ Semantic index is being rebuilt — results may be keyword-only.\n'
      : '';

    const items = out.results
      .map(
        (r, i) =>
          `${i + 1}. **${r.title}** (\`${r.path}\`) — score ${r.score.toFixed(3)}\n   ${r.excerpt}`,
      )
      .join('\n\n');

    return `Found ${out.results.length} note(s):${warning}\n\n${items}`;
  },
});
