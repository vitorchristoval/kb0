import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { type ZodObject, type ZodRawShape, z } from 'zod';
import { KbError } from '../errors.js';
import type { KbIndex } from '../index/KbIndex.js';
import type { Logger } from '../logger/Logger.js';
import type { KbPolicy } from '../policy/KbPolicy.js';
import type { KbStore } from '../store/KbStore.js';
import { formatKbError } from './errors.js';

export interface ToolContext {
  readonly store: KbStore;
  readonly index: KbIndex;
  readonly policy: KbPolicy;
  readonly agentIdentity: string;
  readonly vaultDir: string;
  readonly logFile: string;
  readonly logger: Logger;
  /** Convenience alias — delegates to logger.log. */
  log(level: 'info' | 'warn' | 'error', event: string, fields?: Record<string, unknown>): void;
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
}): Tool & {
  handler: typeof config.handler;
  format: typeof config.format;
  audit: typeof config.audit;
} {
  return {
    name: config.name,
    handler: config.handler,
    format: config.format,
    audit: config.audit,

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
          try {
            const output = await config.handler(args, ctx);
            ctx.log('info', 'tool.success', {
              tool: config.name,
              agent: ctx.agentIdentity,
              duration_ms: Date.now() - start,
              ...audit,
            });
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
              return err(formatKbError(e));
            }
            ctx.log('error', 'tool.unexpected', {
              tool: config.name,
              agent: ctx.agentIdentity,
              duration_ms,
              error: String(e),
              ...audit,
            });
            throw e;
          }
        },
      );
    },
  };
}
