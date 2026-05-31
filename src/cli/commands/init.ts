import fs from 'node:fs/promises';
import path from 'node:path';
import { GitAdapter } from '../../git/GitAdapter.js';

const POLICY_STUB = `version: 1
agents:
  # example-agent:
  #   read: ["**/*"]
  #   write: ["_inbox/**"]
  #   update: ["_inbox/**"]
  #   delete: []
default:
  read: []
  write: []
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
}
