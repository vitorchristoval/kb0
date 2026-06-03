/**
 * kb0 client — the TypeScript counterpart of the Python `VaultClient`.
 *
 * Ships inside the same `kb0-mcp` package as the server, so anyone who already
 * installed kb0 can drive a vault without a second dependency:
 *
 * ```ts
 * import { VaultClient } from 'kb0-mcp/client';
 * ```
 */

export { VaultClient } from './VaultClient.js';
export type {
  VaultClientOptions,
  WriteParams,
  UpdateParams,
  SearchParams,
  ListParams,
  StatusResult,
} from './VaultClient.js';

export {
  KbError,
  KbNotFoundError,
  KbConflictError,
  KbValidationError,
  KbAclDeniedError,
} from './errors.js';
export type { KbErrorCode } from './errors.js';

// Re-export the tool result shapes so consumers can type their handlers.
export type {
  ReadOutput,
  WriteOutput,
  UpdateOutput,
  DeleteOutput,
  SearchOutput,
  ListOutput,
  BacklinksOutput,
  LinksOutput,
  RecentOutput,
  LinkEntry,
} from '../mcp/schemas.js';
