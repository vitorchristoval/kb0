import type { Logger } from '../logger/Logger.js';
import { OperationEventForwarder } from './OperationEventForwarder.js';

export interface ResolvedForwarder {
  /** The forwarder, or null when audit forwarding is disabled. */
  forwarder: OperationEventForwarder | null;
  /** Human-readable one-liner for boot logs. */
  summary: string;
}

/**
 * Builds the audit-event forwarder from environment variables. Off by default —
 * the forwarder only exists when an API key is present, so OSS behavior is unchanged.
 *
 *   KB0_API_KEY     — enables forwarding; sent as `Authorization: Bearer <key>`
 *   KB0_INGEST_URL  — ingest endpoint (default: https://ingest.kb0.dev/v1/events)
 */
export function resolveForwarder(
  logger?: Logger,
  env: NodeJS.ProcessEnv = process.env,
): ResolvedForwarder {
  const apiKey = env['KB0_API_KEY'];
  if (!apiKey) {
    return { forwarder: null, summary: 'disabled (set KB0_API_KEY to enable)' };
  }

  const endpoint = env['KB0_INGEST_URL'] ?? 'https://ingest.kb0.dev/v1/events';
  const forwarder = new OperationEventForwarder({ endpoint, apiKey, logger });
  return { forwarder, summary: `enabled → ${endpoint}` };
}
