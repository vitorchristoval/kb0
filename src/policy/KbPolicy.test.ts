import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { KbError } from '../errors.js';
import { KbPolicy } from './KbPolicy.js';
import type { PolicyEngine } from './PolicyEngine.js';

const POLICY_YAML = `
version: 1
agents:
  writer-agent:
    read: ["**/*"]
    write: ["_inbox/**"]
    update: ["_inbox/**"]
    delete: []
  read-only:
    read: ["notes/**"]
    write: []
    update: []
    delete: []
default:
  read: ["public/**"]
  write: []
  update: []
  delete: []
`;

describe('KbPolicy', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'kb0-policy-'));
  });
  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('satisfies the PolicyEngine interface (Seam 1)', () => {
    const engine: PolicyEngine = KbPolicy.allowAll();
    expect(typeof engine.check).toBe('function');
    expect(typeof engine.getAllowedReadGlobs).toBe('function');
    expect(engine.mode).toBe('permissive');
    expect(engine.policyFileExists).toBe(false);
  });

  describe('load', () => {
    it('returns permissive mode when no policy file exists', () => {
      const policy = KbPolicy.load(tmpDir);
      expect(policy.mode).toBe('permissive');
      expect(policy.policyFileExists).toBe(false);
    });

    it('returns enforced mode when policy file exists', async () => {
      await writeFile(join(tmpDir, '.vault-policy.yaml'), POLICY_YAML, 'utf-8');
      const policy = KbPolicy.load(tmpDir);
      expect(policy.mode).toBe('enforced');
      expect(policy.policyFileExists).toBe(true);
    });

    it('tolerates an empty agents section (YAML null) without crashing', async () => {
      // `agents:` with nothing under it parses as null, not {} — must not throw.
      await writeFile(join(tmpDir, '.vault-policy.yaml'), 'version: 1\nagents:\n', 'utf-8');
      const policy = KbPolicy.load(tmpDir);
      expect(policy.mode).toBe('enforced');
      // no agents, no default → unlisted agent is denied
      expect(() => policy.check('anyone', 'read', 'x.md')).toThrow();
    });

    it('loads a file with only a version and a default', async () => {
      await writeFile(
        join(tmpDir, '.vault-policy.yaml'),
        'version: 1\ndefault:\n  read: ["**/*"]\n',
        'utf-8',
      );
      const policy = KbPolicy.load(tmpDir);
      expect(() => policy.check('anyone', 'read', 'notes/x.md')).not.toThrow();
    });
  });

  describe('check — enforced mode', () => {
    let policy: KbPolicy;
    beforeEach(async () => {
      await writeFile(join(tmpDir, '.vault-policy.yaml'), POLICY_YAML, 'utf-8');
      policy = KbPolicy.load(tmpDir);
    });

    it('allows listed agent within permitted globs', () => {
      expect(() => policy.check('writer-agent', 'write', '_inbox/note.md')).not.toThrow();
    });

    it('denies listed agent outside permitted globs', () => {
      expect(() => policy.check('writer-agent', 'write', 'notes/secret.md')).toThrow(KbError);
    });

    it('denies listed agent for forbidden operation', () => {
      expect(() => policy.check('writer-agent', 'delete', '_inbox/note.md')).toThrow(KbError);
    });

    it('applies default policy to unlisted agents', () => {
      expect(() => policy.check('unknown-agent', 'read', 'public/doc.md')).not.toThrow();
      expect(() => policy.check('unknown-agent', 'write', 'public/doc.md')).toThrow(KbError);
    });

    it('read-only agent can read notes but not write', () => {
      expect(() => policy.check('read-only', 'read', 'notes/arch.md')).not.toThrow();
      expect(() => policy.check('read-only', 'write', 'notes/arch.md')).toThrow(KbError);
    });

    it('thrown error has code ACL_DENIED', () => {
      const err = (() => {
        try { policy.check('writer-agent', 'delete', '_inbox/note.md'); }
        catch (e) { return e; }
      })() as KbError;
      expect(err.code).toBe('ACL_DENIED');
      expect(err.detail).toMatchObject({ agent: 'writer-agent', operation: 'delete' });
    });
  });

  describe('check — no default policy', () => {
    it('denies unlisted agent when no default exists', async () => {
      const noDefault = `version: 1\nagents:\n  admin:\n    read: ["**/*"]\n    write: ["**/*"]\n    update: ["**/*"]\n    delete: ["**/*"]\n`;
      await writeFile(join(tmpDir, '.vault-policy.yaml'), noDefault, 'utf-8');
      const policy = KbPolicy.load(tmpDir);
      expect(() => policy.check('stranger', 'read', 'notes/x.md')).toThrow(KbError);
    });
  });

  describe('check — permissive mode', () => {
    it('always allows without checking globs', () => {
      const policy = KbPolicy.load(tmpDir); // no file → permissive
      expect(() => policy.check('any-agent', 'delete', 'anything.md')).not.toThrow();
    });
  });

  describe('getAllowedReadGlobs', () => {
    it('returns undefined in permissive mode', () => {
      const policy = KbPolicy.load(tmpDir);
      expect(policy.getAllowedReadGlobs('any')).toBeUndefined();
    });

    it('returns agent read globs in enforced mode', async () => {
      await writeFile(join(tmpDir, '.vault-policy.yaml'), POLICY_YAML, 'utf-8');
      const policy = KbPolicy.load(tmpDir);
      expect(policy.getAllowedReadGlobs('read-only')).toEqual(['notes/**']);
    });

    it('returns [] for unknown agent with no default (DENY ALL)', async () => {
      const noDefault = `version: 1\nagents:\n  admin:\n    read: ["**/*"]\n    write: []\n    update: []\n    delete: []\n`;
      await writeFile(join(tmpDir, '.vault-policy.yaml'), noDefault, 'utf-8');
      const policy = KbPolicy.load(tmpDir);
      expect(policy.getAllowedReadGlobs('stranger')).toEqual([]);
    });
  });

  describe('allowAll', () => {
    it('is always permissive', () => {
      const policy = KbPolicy.allowAll();
      expect(policy.mode).toBe('permissive');
      expect(() => policy.check('any', 'delete', 'anything.md')).not.toThrow();
      expect(policy.getAllowedReadGlobs('any')).toBeUndefined();
    });
  });
});
