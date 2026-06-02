import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KbPolicy } from '../../policy/KbPolicy.js';
import { initVault } from './init.js';

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

describe('initVault', () => {
  let tmpDir: string;
  let cwd: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'kb0-init-'));
    cwd = process.cwd();
    process.chdir(tmpDir);
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(async () => {
    process.chdir(cwd);
    vi.restoreAllMocks();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('creates a vault with _inbox and .gitignore', async () => {
    await initVault('myvault');
    expect(await exists(join(tmpDir, 'myvault', '_inbox'))).toBe(true);
    expect(await exists(join(tmpDir, 'myvault', '.gitignore'))).toBe(true);
    expect(await exists(join(tmpDir, 'myvault', '.git'))).toBe(true);
  });

  it('does NOT create a .vault-policy.yaml (permissive by default)', async () => {
    await initVault('myvault');
    expect(await exists(join(tmpDir, 'myvault', '.vault-policy.yaml'))).toBe(false);
  });

  it('the fresh vault loads as permissive (the default init→serve flow works)', async () => {
    await initVault('myvault');
    // Regression: an empty/auto-generated policy used to crash KbPolicy.load.
    const policy = KbPolicy.load(join(tmpDir, 'myvault'));
    expect(policy.mode).toBe('permissive');
    expect(() => policy.check('any-agent', 'write', '_inbox/x.md')).not.toThrow();
  });
});
