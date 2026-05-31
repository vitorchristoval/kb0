export type KbErrorCode = 'NOT_FOUND' | 'CONFLICT' | 'VALIDATION' | 'ACL_DENIED';

export class KbError extends Error {
  constructor(
    public readonly code: KbErrorCode,
    public readonly detail: Record<string, unknown> = {},
  ) {
    super(`[${code}] ${JSON.stringify(detail)}`);
    this.name = 'KbError';
  }
}

export class KbNotFoundError extends KbError {
  constructor(public readonly notePath: string) {
    super('NOT_FOUND', { path: notePath });
    this.name = 'KbNotFoundError';
  }
}

export class KbConflictError extends KbError {
  constructor(
    public readonly notePath: string,
    public readonly expected: string,
    public readonly actual: string,
  ) {
    super('CONFLICT', { path: notePath, expected, actual });
    this.name = 'KbConflictError';
  }
}
