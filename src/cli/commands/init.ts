import fs from 'node:fs/promises';
import path from 'node:path';
import { GitAdapter } from '../../git/GitAdapter.js';

// Semântica de acesso:
//   Agente listado em 'agents'          → política específica
//   Agente NÃO listado + default existe  → default
//   Agente NÃO listado + sem default     → DENY ALL
const POLICY_STUB = `version: 1

# Agents not listed here, and with no 'default', are DENIED ALL access.
# Agents listed here get exactly the permissions defined — nothing more.
agents:
  # example-agent:
  #   read: ["**/*"]
  #   write: ["_inbox/**"]
  #   update: ["_inbox/**"]
  #   delete: []

# Optional: applies to any agent not explicitly listed above.
# Remove this section to deny unlisted agents by default (recommended for production).
# default:
#   read: []
#   write: []
#   update: []
#   delete: []
`;

const GITIGNORE = `.vault-index/\n`;

export async function initVault(name: string): Promise<void> {
  const vaultDir = path.resolve(process.cwd(), name);

  try {
    await fs.mkdir(vaultDir);
  } catch {
    console.error(`Error: directory "${name}" already exists.`);
    process.exit(1);
  }

  await fs.mkdir(path.join(vaultDir, '_inbox'));
  await fs.writeFile(path.join(vaultDir, '.vault-policy.yaml'), POLICY_STUB, 'utf-8');
  await fs.writeFile(path.join(vaultDir, '.gitignore'), GITIGNORE, 'utf-8');

  const git = new GitAdapter({
    dir: vaultDir,
    authorName: 'kb0',
    authorEmail: 'kb0@localhost',
  });

  await git.init();
  await git.add('.vault-policy.yaml');
  await git.add('.gitignore');
  await git.commit(`feat: init vault "${name}"`);

  console.log(`Vault "${name}" initialized at ${vaultDir}`);
  console.log(`Edit .vault-policy.yaml to configure agent permissions before running kb0 serve.`);
}
