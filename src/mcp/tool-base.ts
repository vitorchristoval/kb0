import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { type ZodObject, type ZodRawShape, z } from 'zod';
import { KbError } from '../errors.js';
import type { KbIndex } from '../index/KbIndex.js';
import type { Logger } from '../logger/Logger.js';
import type { PolicyEngine } from '../policy/PolicyEngine.js';
import type { KbStore } from '../store/KbStore.js';
import { formatKbError } from './errors.js';

/**
 * A content-free record of one tool call, for audit / observability sinks.
 * Carries metadata only (target path, query, returned paths) — never note bodies —
 * so a downstream sink can stream it without seeing the vault's contents.
 */
export interface OperationEvent {
  /** Tool name, e.g. 'vault.read'. */
  tool: string;
  /** Agent identity from the session. */
  agent: string;
  /** ISO-8601 timestamp captured when the call finished. */
  ts: string;
  /** true on success, false when the tool returned or threw an error. */
  ok: boolean;
  /** Wall-clock duration in milliseconds. */
  durationMs: number;
  /** Whether the operation mutated the vault (write / update / delete). */
  mutates: boolean;
  /** Error code when ok === false (e.g. 'NOT_FOUND', 'ACL_DENIED', 'UNEXPECTED'). */
  errorCode?: string;
  /** Content-free target metadata (path, query, result_paths, …) — never note bodies. */
  fields: Record<string, unknown>;
}

export interface ToolContext {
  readonly store: KbStore;
  readonly index: KbIndex;
  readonly policy: PolicyEngine;
  readonly agentIdentity: string;
  readonly vaultDir: string;
  readonly logFile: string;
  readonly logger: Logger;
  /** Convenience alias — delegates to logger.log. */
  log(level: 'info' | 'warn' | 'error', event: string, fields?: Record<string, unknown>): void;
  /**
   * Optional sink for content-free operation events. Defaulted off — when set
   * (e.g. by an enterprise audit forwarder), every tool call emits one event.
   */
  onEvent?(event: OperationEvent): void;
}

export interface Tool {
  readonly name: string;
  register(server: McpServer, ctx: ToolContext): void;
}

// Cast helpers — see tool-base.ts comment in Sprint 3 for why these exist.
function ok(text: string, structured: unknown): CallToolResult {
  return {
    content: [{ type: 'text', text }],
    structuredContent: structured as Record<string, unknown>,
  } as unknown as CallToolResult;
}

function err(text: string): CallToolResult {
  return {
    isError: true,
    content: [{ type: 'text', text }],
  } as unknown as CallToolResult;
}

export function defineTool<Shape extends ZodRawShape, O>(config: {
  name: string;
  description: string;
  inputSchema: ZodObject<Shape>;
  handler: (input: z.infer<ZodObject<Shape>>, ctx: ToolContext) => Promise<O>;
  format: (output: O) => string;
  /**
   * Maps the call input to content-free fields recorded on the tool.success /
   * tool.error audit log (e.g. the path read or the query searched). Keep this
   * to metadata only — never note bodies — so the log stays content-free.
   */
  audit?: (input: z.infer<ZodObject<Shape>>) => Record<string, unknown>;
  /**
   * Maps the handler output to content-free fields recorded only on the
   * tool.success log (e.g. the paths a search returned). Runs after a
   * successful handler — there is no output to inspect on failure, so these
   * fields are absent from error logs. Keep it to metadata, never note bodies.
   */
  auditResult?: (output: O) => Record<string, unknown>;
  /**
   * Marks the tool as mutating the vault (write / update / delete) — surfaced
   * as `OperationEvent.mutates` so a sink can tell reads from writes.
   */
  mutates?: boolean;
}): Tool & {
  handler: typeof config.handler;
  format: typeof config.format;
  audit: typeof config.audit;
  auditResult: typeof config.auditResult;
  mutates: typeof config.mutates;
} {
  return {
    name: config.name,
    handler: config.handler,
    format: config.format,
    audit: config.audit,
    auditResult: config.auditResult,
    mutates: config.mutates,

    register(server: McpServer, ctx: ToolContext): void {
      // TypeScript cannot propagate the Shape generic through server.tool()'s
      // overloads — it widens to ZodRawShape and then rejects the callback.
      // Casting server.tool here keeps type safety inside the handler while
      // sidestepping the SDK's multi-level generic inference limitation.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (server.tool as any)(
        config.name,
        config.description,
        config.inputSchema.shape,
        async (args: z.infer<ZodObject<Shape>>) => {
          const start = Date.now();
          // Content-free audit fields (path read, query searched, …) so every
          // success and failure is attributable to a specific target.
          const audit = config.audit?.(args) ?? {};
          // Emit a content-free operation event to the optional sink. Reuses the
          // same fields that go to the log, so the two never drift.
          const emit = (
            success: boolean,
            durationMs: number,
            fields: Record<string, unknown>,
            errorCode?: string,
          ): void => {
            ctx.onEvent?.({
              tool: config.name,
              agent: ctx.agentIdentity,
              ts: new Date().toISOString(),
              ok: success,
              durationMs,
              mutates: config.mutates ?? false,
              ...(errorCode ? { errorCode } : {}),
              fields,
            });
          };
          try {
            const output = await config.handler(args, ctx);
            const duration_ms = Date.now() - start;
            const fields = { ...audit, ...(config.auditResult?.(output) ?? {}) };
            ctx.log('info', 'tool.success', {
              tool: config.name,
              agent: ctx.agentIdentity,
              duration_ms,
              ...fields,
            });
            emit(true, duration_ms, fields);
            return ok(config.format(output), output);
          } catch (e) {
            const duration_ms = Date.now() - start;
            if (e instanceof KbError) {
              ctx.log('error', 'tool.error', {
                tool: config.name,
                agent: ctx.agentIdentity,
                duration_ms,
                error_code: e.code,
                ...audit,
              });
              emit(false, duration_ms, audit, e.code);
              return err(formatKbError(e));
            }
            ctx.log('error', 'tool.unexpected', {
              tool: config.name,
              agent: ctx.agentIdentity,
              duration_ms,
              error: String(e),
              ...audit,
            });
            emit(false, duration_ms, audit, 'UNEXPECTED');
            throw e;
          }
        },
      );
    },
  };
}
