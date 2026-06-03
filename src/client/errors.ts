/**
 * Typed errors mirroring kb0's structured error codes, raised by VaultClient.
 *
 * These intentionally live alongside the client (and mirror the Python client's
 * errors.py) so consumers of `kb0-mcp/client` get `instanceof` checks without
 * importing the server's internals.
 */

export type KbErrorCode = 'ERROR' | 'NOT_FOUND' | 'CONFLICT' | 'VALIDATION' | 'ACL_DENIED';

export class KbError extends Error {
  readonly code: KbErrorCode = 'ERROR';

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class KbNotFoundError extends KbError {
  override readonly code = 'NOT_FOUND' as const;
}

export class KbConflictError extends KbError {
  override readonly code = 'CONFLICT' as const;
}

export class KbValidationError extends KbError {
  override readonly code = 'VALIDATION' as const;
}

export class KbAclDeniedError extends KbError {
  override readonly code = 'ACL_DENIED' as const;
}

/**
 * Map a kb0 error message back to a typed error. kb0 formats each error code
 * with a stable prefix (see src/mcp/errors.ts formatKbError), so matching on it
 * is reliable — both sides live in the same project.
 */
export function errorFromText(text: string): KbError {
  const t = text.trim();
  if (t.startsWith('Not found')) return new KbNotFoundError(text);
  if (t.startsWith('Conflict')) return new KbConflictError(text);
  if (t.startsWith('Permission denied')) return new KbAclDeniedError(text);
  if (t.startsWith('Validation')) return new KbValidationError(text);
  return new KbError(text);
}
