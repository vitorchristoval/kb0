import { DeleteInput, type DeleteOutput } from '../schemas.js';
import { defineTool } from '../tool-base.js';

export const deleteTool = defineTool({
  name: 'vault.delete',

  description: `Permanently removes a note from the vault and commits the deletion to git history.
Use this only when a note is truly obsolete — the deletion is tracked in git so it can be recovered, but it is not easily reversible via MCP tools alone.
Do not use this to update or replace a note; use vault.update instead.
Prefer vault.update with status "canonical" to promote a note, rather than deleting and re-creating it.`,

  inputSchema: DeleteInput,

  handler: async (input, ctx) => {
    ctx.log('info', 'vault.delete', { path: input.path });
    await ctx.store.delete(input.path);
    ctx.log('info', 'vault.delete.done', { path: input.path });
    const output: DeleteOutput = { path: input.path };
    return output;
  },

  format: (out) => `Note deleted: \`${out.path}\`\n\nThe deletion has been committed to git history.`,
});
