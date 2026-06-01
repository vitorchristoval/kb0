import { z } from 'zod';
import { KB0_VERSION } from '../../version.js';
import { defineTool } from '../tool-base.js';

const StatusInput = z.object({});

interface StatusOutput {
  vault: string;
  agent: string;
  version: string;
  notes: number;
  stale_embeddings: number;
  embedding_model: string;
  policy_mode: 'enforced' | 'permissive';
  policy_file: boolean;
  log_file: string;
}

export const statusTool = defineTool({
  name: 'vault.status',

  description: `Returns the current health and configuration of the vault.
Use this to inspect the index state, verify which policy mode is active, and locate the log file.
Useful for diagnosing why searches return unexpected results (stale embeddings) or why writes are being denied (policy mode).
No ACL check is applied — any agent can call this tool.`,

  inputSchema: StatusInput,

  handler: async (_input, ctx) => {
    const output: StatusOutput = {
      vault: ctx.vaultDir,
      agent: ctx.agentIdentity,
      version: KB0_VERSION,
      notes: ctx.index.getNoteCount(),
      stale_embeddings: ctx.index.countStaleEmbeddings(),
      embedding_model: ctx.index.embeddingModel,
      policy_mode: ctx.policy.mode,
      policy_file: ctx.policy.policyFileExists,
      log_file: ctx.logFile,
    };
    return output;
  },

  format: (out) =>
    `## Vault Status\n\n` +
    `- **Vault:** \`${out.vault}\`\n` +
    `- **Agent:** \`${out.agent}\`\n` +
    `- **kb0 version:** ${out.version}\n` +
    `- **Notes indexed:** ${out.notes}\n` +
    `- **Stale embeddings:** ${out.stale_embeddings}\n` +
    `- **Embedding model:** ${out.embedding_model}\n` +
    `- **Policy mode:** ${out.policy_mode}${out.policy_file ? '' : ' ⚠ no policy file'}\n` +
    `- **Log file:** \`${out.log_file}\``,
});
