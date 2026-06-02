import fs from 'node:fs/promises';
import path from 'node:path';
import { GitAdapter } from '../../git/GitAdapter.js';

const GITIGNORE = `.vault-index/\n`;

export async function initVault(name: string): Promise<void> {
  const vaultDir = path.resolve(process.cwd(), name);

  try {
    await fs.mkdir(vaultDir);
  } catch {
    console.error(`Error: directory "${name}" already exists.`);
    process.exit(1);
  }

  // Convention: agents write here first; promotion to canonical is explicit.
  await fs.mkdir(path.join(vaultDir, '_inbox'));
  await fs.writeFile(path.join(vaultDir, '_inbox', '.gitkeep'), '', 'utf-8');
  await fs.writeFile(path.join(vaultDir, '.gitignore'), GITIGNORE, 'utf-8');

  const git = new GitAdapter({
    dir: vaultDir,
    authorName: 'kb0',
    authorEmail: 'kb0@localhost',
  });

  await git.init();
  await git.add('.gitignore');
  await git.add('_inbox/.gitkeep');
  await git.commit(`feat: init vault "${name}"`);

  // No .vault-policy.yaml is created on purpose: the vault starts permissive
  // (every agent, full access) and prints a warning on `kb0 serve`. Governance
  // is opt-in — add a .vault-policy.yaml to enforce per-agent permissions.
  console.log(`Vault "${name}" initialized at ${vaultDir}`);
  console.log('Runs permissively until you add ACL. To enforce per-agent permissions,');
  console.log('add a .vault-policy.yaml — see:');
  console.log('  https://github.com/vitorchristoval/kb0/tree/main/examples/multi-agent-acl');
}
