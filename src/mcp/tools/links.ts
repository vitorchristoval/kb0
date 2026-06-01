import { LinksInput, type LinksOutput } from '../schemas.js';
import { defineTool } from '../tool-base.js';

export const linksTool = defineTool({
  name: 'vault.links',

  description: `Returns all outgoing [[wikilink]] references from the specified note.
Use this to understand what other notes a given note depends on or references — useful for navigating the knowledge graph.
Links to notes that have not been indexed yet will still be returned but with path as title.
For incoming links (what links to this note), use vault.backlinks instead.`,

  inputSchema: LinksInput,

  handler: async (input, ctx) => {
    ctx.policy.check(ctx.agentIdentity, 'read', input.path);
    const links = ctx.index.links(input.path);
    const output: LinksOutput = { path: input.path, links };
    return output;
  },

  format: (out) => {
    if (out.links.length === 0) return `\`${out.path}\` has no outgoing links.`;
    const items = out.links.map((l) => `- **${l.title}** (\`${l.path}\`)`).join('\n');
    return `## Links from \`${out.path}\` (${out.links.length})\n\n${items}`;
  },
});
