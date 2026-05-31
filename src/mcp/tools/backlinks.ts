import { BacklinksInput, type BacklinksOutput } from '../schemas.js';
import { defineTool } from '../tool-base.js';

export const backlinksTool = defineTool({
  name: 'vault.backlinks',

  description: `Returns all notes that link to the specified note via [[wikilink]] syntax.
Use this to understand what context or other notes reference a given note — useful for impact analysis before editing or deleting.
Only notes that have been indexed (via vault.write, vault.update, or kb0 reindex) are reflected here.
For outgoing links from a note, use vault.links instead.`,

  inputSchema: BacklinksInput,

  handler: async (input, ctx) => {
    ctx.log('info', 'vault.backlinks', { path: input.path });
    const backlinks = ctx.index.backlinks(input.path);
    const output: BacklinksOutput = { path: input.path, backlinks };
    return output;
  },

  format: (out) => {
    if (out.backlinks.length === 0) return `No notes link to \`${out.path}\`.`;
    const items = out.backlinks
      .map((b) => `- **${b.title}** (\`${b.path}\`)`)
      .join('\n');
    return `## Backlinks for \`${out.path}\` (${out.backlinks.length})\n\n${items}`;
  },
});
