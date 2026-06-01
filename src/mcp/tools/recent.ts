import { RecentInput, type RecentOutput } from '../schemas.js';
import { defineTool } from '../tool-base.js';

export const recentTool = defineTool({
  name: 'vault.recent',

  description: `Returns the most recently updated notes in the vault, ordered by last-modified time.
Use this to catch up on what has changed in the vault, or to find notes that were recently edited.
Results reflect the index — notes modified externally will only appear here after reindexing.
For full-text or semantic search, use vault.search instead.`,

  inputSchema: RecentInput,

  handler: async (input, ctx) => {
    const allowedGlobs = ctx.policy.getAllowedReadGlobs(ctx.agentIdentity);
    const rows = ctx.index.recent(input.limit, allowedGlobs);
    const output: RecentOutput = {
      notes: rows.map((r) => ({
        path: r.path,
        title: r.title,
        updated: r.updated_at,
        status: r.status,
      })),
    };
    return output;
  },

  format: (out) => {
    if (out.notes.length === 0) return 'No notes in the vault yet.';
    const items = out.notes
      .map((n) => `- **${n.title}** (\`${n.path}\`) — ${n.status} · ${n.updated.slice(0, 10)}`)
      .join('\n');
    return `## Recently Updated (${out.notes.length})\n\n${items}`;
  },
});
