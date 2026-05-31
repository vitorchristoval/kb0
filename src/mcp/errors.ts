import { KbError } from '../errors.js';

export function formatKbError(err: KbError): string {
  switch (err.code) {
    case 'NOT_FOUND':
      return `Not found: \`${String(err.detail['path'] ?? 'unknown')}\``;

    case 'CONFLICT': {
      const { path, expected, actual } = err.detail as {
        path: string;
        expected: string;
        actual: string;
      };
      return (
        `Conflict at \`${path}\`: the note has changed since you last read it.\n\n` +
        `Expected hash: \`${expected}\`\n` +
        `Actual hash:   \`${actual}\`\n\n` +
        `Call \`vault.read\` to get the current content and hash, then retry.`
      );
    }

    case 'VALIDATION':
      return `Validation error: ${String(err.detail['message'] ?? JSON.stringify(err.detail))}`;

    case 'ACL_DENIED':
      return `Permission denied: ${String(err.detail['message'] ?? 'operation not allowed for this agent')}`;

    default:
      return `Error [${err.code}]: ${err.message}`;
  }
}
