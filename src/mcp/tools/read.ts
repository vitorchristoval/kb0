import { ReadInput, type ReadOutput } from '../schemas.js';
import { defineTool } from '../tool-base.js';

export const readTool = defineTool({
  name: 'vault.read',

  description: `Reads a note from the vault and returns its full content, frontmatter metadata, and content hash.
Use this before calling vault.update — the returned hash is required as expectedHash to prevent overwriting concurrent changes.
The hash is a SHA-256 of the entire file on disk (frontmatter YAML + body). Custom frontmatter fields are preserved and returned.
Do not use this for searching; use vault.search or vault.list to discover notes first.`,

  inputSchema: ReadInput,

  handler: async (input, ctx) => {
    ctx.log('info', 'vault.read', { path: input.path });
    const note = await ctx.store.read(input.path);
    const output: ReadOutput = {
      path: input.path,
      hash: note.hash,
      content: note.content,
      frontmatter: {
        id: note.frontmatter.id,
        title: note.frontmatter.title,
        author: note.frontmatter.author,
        status: note.frontmatter.status,
        tags: note.frontmatter.tags,
        created: note.frontmatter.created,
        updated: note.frontmatter.updated,
      },
    };
    return output;
  },

  format: (out) => {
    const meta = [
      `author: ${out.frontmatter.author}`,
      `status: ${out.frontmatter.status}`,
      `tags: ${out.frontmatter.tags.length > 0 ? out.frontmatter.tags.join(', ') : '(none)'}`,
      `created: ${out.frontmatter.created}`,
      `updated: ${out.frontmatter.updated}`,
      `hash: ${out.hash}`,
    ].join('\n');
    return `${meta}\n\n---\n\n${out.content}`;
  },
});
