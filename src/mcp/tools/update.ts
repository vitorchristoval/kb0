import { UpdateInput, type UpdateOutput } from '../schemas.js';
import { defineTool } from '../tool-base.js';

export const updateTool = defineTool({
  name: 'vault.update',

  description: `Updates the content of an existing note using optimistic locking via a content hash.
Use this to modify a note you have previously read with vault.read. The expectedHash must match the current file on disk — if another process has changed the note since you read it, the update is rejected with a CONFLICT error containing the actual current hash.
Author and updated timestamp are always set by the server. ID and created are preserved from the original note.
Do not use this to create new notes; use vault.write instead.`,

  inputSchema: UpdateInput,

  handler: async (input, ctx) => {
    ctx.policy.check(ctx.agentIdentity, 'update', input.path);

    const hash = await ctx.store.update(input.path, {
      content: input.content,
      expectedHash: input.expectedHash,
      author: `agent:${ctx.agentIdentity}`,
      title: input.title,
      status: input.status,
      tags: input.tags,
    });

    const output: UpdateOutput = { path: input.path, hash };
    return output;
  },

  format: (out) =>
    `Note updated at \`${out.path}\`\n\n` +
    `- **New hash:** \`${out.hash}\`\n\n` +
    `Use this hash as expectedHash in future vault.update calls.`,
});
