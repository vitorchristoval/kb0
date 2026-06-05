import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { load as yamlLoad } from 'js-yaml';
import { minimatch } from 'minimatch';
import { z } from 'zod';
import { KbError } from '../errors.js';
import type { PolicyEngine } from './PolicyEngine.js';

// ── Zod schema — invalid file = boot failure, never fall-through ──────────────

const AgentPolicySchema = z.object({
  read:   z.array(z.string()).default([]),
  write:  z.array(z.string()).default([]),
  update: z.array(z.string()).default([]),
  delete: z.array(z.string()).default([]),
});

const PolicyFileSchema = z.object({
  version: z.literal(1),
  // An empty YAML section (e.g. `agents:` with only comments under it) parses as
  // null, not undefined — so .default() alone isn't enough. Coerce null/undefined.
  agents: z
    .record(z.string(), AgentPolicySchema)
    .nullish()
    .transform((v) => v ?? {}),
  // default is optional — its absence (or an empty section) means unlisted agents
  // are DENIED ALL.
  default: AgentPolicySchema.nullish().transform((v) => v ?? undefined),
});

type AgentPolicy = z.infer<typeof AgentPolicySchema>;
type PolicyFile  = z.infer<typeof PolicyFileSchema>;

export type PolicyMode      = 'enforced' | 'permissive';
export type PolicyOperation = 'read' | 'write' | 'update' | 'delete';

// ── KbPolicy ─────────────────────────────────────────────────────────────────

export class KbPolicy implements PolicyEngine {
  readonly mode: PolicyMode;
  readonly policyFileExists: boolean;

  private constructor(
    private readonly data: PolicyFile | null,
    mode: PolicyMode,
  ) {
    this.mode = mode;
    this.policyFileExists = data !== null;
  }

  // ── factory ────────────────────────────────────────────────────────────────

  static load(vaultDir: string, strict = false): KbPolicy {
    const policyPath = path.join(vaultDir, '.vault-policy.yaml');

    if (!existsSync(policyPath)) {
      if (strict) {
        process.stderr.write(
          '[kb0] FATAL: --strict mode requires .vault-policy.yaml — none found.\n' +
          `[kb0] Create one at ${policyPath} or run without --strict.\n`,
        );
        process.exit(1);
      }
      process.stderr.write(
        '[kb0] WARNING: PERMISSIVE mode — .vault-policy.yaml not found.\n' +
        '[kb0] All agents have unrestricted access to this vault.\n' +
        '[kb0] Create .vault-policy.yaml to enforce ACL, or start with --strict to require it.\n',
      );
      return new KbPolicy(null, 'permissive');
    }

    let raw: unknown;
    try {
      raw = yamlLoad(readFileSync(policyPath, 'utf-8'));
    } catch (e) {
      process.stderr.write(`[kb0] FATAL: failed to read .vault-policy.yaml: ${String(e)}\n`);
      process.exit(1);
    }

    const result = PolicyFileSchema.safeParse(raw);
    if (!result.success) {
      process.stderr.write('[kb0] FATAL: .vault-policy.yaml is invalid:\n');
      process.stderr.write(JSON.stringify(result.error.format(), null, 2) + '\n');
      process.exit(1);
    }

    return new KbPolicy(result.data, 'enforced');
  }

  /** Permissive policy that allows everything — for tests and dev tools. */
  static allowAll(): KbPolicy {
    return new KbPolicy(null, 'permissive');
  }

  // ── ACL enforcement ────────────────────────────────────────────────────────

  /**
   * Throws KbError('ACL_DENIED') if the agent is not allowed to perform the
   * operation on notePath. No-op in permissive mode.
   */
  check(agentId: string, operation: PolicyOperation, notePath: string): void {
    if (this.mode === 'permissive') return;

    const agentPolicy = this.resolveAgent(agentId);
    if (!agentPolicy) {
      throw new KbError('ACL_DENIED', {
        agent: agentId,
        operation,
        path: notePath,
        message: `Agent "${agentId}" has no policy entry and no default — DENY ALL.`,
      });
    }

    const allowed = agentPolicy[operation].some((glob) =>
      minimatch(notePath, glob, { dot: true }),
    );

    if (!allowed) {
      throw new KbError('ACL_DENIED', {
        agent: agentId,
        operation,
        path: notePath,
        message: `Agent "${agentId}" is not allowed to ${operation} "${notePath}".`,
      });
    }
  }

  /**
   * Returns the globs the agent is allowed to read, for filtering bulk results.
   * undefined = no restriction (permissive mode).
   * [] = deny all (agent has no read access at all).
   */
  getAllowedReadGlobs(agentId: string): string[] | undefined {
    if (this.mode === 'permissive') return undefined;
    const agentPolicy = this.resolveAgent(agentId);
    return agentPolicy ? agentPolicy.read : [];
  }

  // ── private ────────────────────────────────────────────────────────────────

  private resolveAgent(agentId: string): AgentPolicy | null {
    if (!this.data) return null;
    // exact match first
    const specific = this.data.agents[agentId];
    if (specific) return specific;
    // fall back to default if present
    if (this.data.default) return this.data.default;
    // no match + no default = DENY ALL
    return null;
  }
}
