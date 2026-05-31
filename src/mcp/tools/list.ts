import { ListInput, type ListOutput } from '../schemas.js';
import { defineTool } from '../tool-base.js';

export const listTool = defineTool({
  name: 'vault.list',

  description: `Lists notes in the vault with optional filtering by path prefix, tag, or status.
Use this to browse the vault structure or find all notes with a specific tag or status before doing further operations.
Results are ordered by last-updated descending. For full-text or semantic search, use vault.search instead.
Do not use this to retrieve note content — use vault.read for that.`,

  inputSchema: ListInput,

  handler: async (input, ctx) => {
    ctx.log('info', 'vault.list', { prefix: input.prefix, tag: input.tag, status: input.status });

    const rows = ctx.index.list({
      prefix: input.prefix,
      tag: input.tag,
      status: input.status,
      limit: input.limit,
    });

    const output: ListOutput = {
      notes: rows.map((r) => ({
        id: r.id,
        path: r.path,
        title: r.title,
        status: r.status,
        tags: r.tags,
      })),
      total: rows.length,
    };
    return output;
  },

  format: (out) => {
    if (out.notes.length === 0) return 'No notes found.';
    const items = out.notes
      .map((n) => {
        const tagStr = n.tags.length > 0 ? ` [${n.tags.map((t) => `#${t}`).join(' ')}]` : '';
        return `- **${n.title}** (\`${n.path}\`) — ${n.status}${tagStr}`;
      })
      .join('\n');
    return `## Notes (${out.total})\n\n${items}`;
  },
});
