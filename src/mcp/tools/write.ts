import { KbError, KbNotFoundError } from '../../errors.js';
import { WriteInput, type WriteOutput } from '../schemas.js';
import { defineTool } from '../tool-base.js';

export const writeTool = defineTool({
  name: 'vault.write',

  description: `Creates a new markdown note at the specified path and commits it to the vault.
Use this when you have new knowledge to preserve that does not yet exist in the vault — research findings, summaries, meeting notes, or reference material.
Do not use this if a note already exists at that path; use vault.update instead, which requires a content hash to prevent overwriting concurrent edits.
Author, ID, created, and updated are always set by the server from your agent identity — these fields cannot be provided or overridden by the caller.`,

  inputSchema: WriteInput,

  audit: (input) => ({ path: input.path }),

  handler: async (input, ctx) => {
    ctx.policy.check(ctx.agentIdentity, 'write', input.path);

    try {
      await ctx.store.read(input.path);
      throw new KbError('VALIDATION', {
        path: input.path,
        message: `A note already exists at "${input.path}". Use vault.update to modify existing notes.`,
      });
    } catch (e) {
      if (e instanceof KbNotFoundError) {
        // expected — note doesn't exist, safe to create
      } else {
        throw e;
      }
    }

    const { hash, id } = await ctx.store.write(input.path, {
      title: input.title,
      author: `agent:${ctx.agentIdentity}`,
      content: input.content,
      status: input.status,
      tags: input.tags,
    });

    const output: WriteOutput = { path: input.path, hash, id };
    return output;
  },

  format: (out) =>
    `Note created at \`${out.path}\`\n\n` +
    `- **ID:** \`${out.id}\`\n` +
    `- **Hash:** \`${out.hash}\`\n\n` +
    `Pass the full hash to \`vault.update\` when modifying this note.`,
});
