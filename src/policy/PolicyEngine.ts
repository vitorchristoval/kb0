import type { PolicyMode, PolicyOperation } from './KbPolicy.js';

/**
 * The complete policy surface the MCP tools depend on. `KbPolicy` implements it;
 * an enterprise RBAC engine can implement it instead and be injected without
 * forking the core.
 *
 * The tools touch exactly these members:
 *   check                → read / write / update / delete / backlinks / links
 *   getAllowedReadGlobs  → search / list / recent
 *   mode, policyFileExists → status
 */
export interface PolicyEngine {
  /** 'enforced' when a policy file is loaded, 'permissive' otherwise. */
  readonly mode: PolicyMode;
  /** Whether a `.vault-policy.yaml` was found at boot. */
  readonly policyFileExists: boolean;
  /** Throws a KbError (ACL_DENIED) if the agent may not perform `operation` on `notePath`. */
  check(agentId: string, operation: PolicyOperation, notePath: string): void;
  /** Globs the agent may read, or `undefined` for unrestricted (permissive). */
  getAllowedReadGlobs(agentId: string): string[] | undefined;
}
