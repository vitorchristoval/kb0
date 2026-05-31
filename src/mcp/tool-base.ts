import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { type ZodObject, type ZodRawShape, z } from 'zod';
import { KbError } from '../errors.js';
import type { KbIndex } from '../index/KbIndex.js';
import type { KbStore } from '../store/KbStore.js';
import { formatKbError } from './errors.js';

export interface ToolContext {
  readonly store: KbStore;
  readonly index: KbIndex;
  readonly agentIdentity: string;
  /** No-op in Sprint 3 — wired to telemetry in Sprint 4. */
  log(level: 'info' | 'warn' | 'error', event: string, fields?: Record<string, unknown>): void;
}

export interface Tool {
  readonly name: string;
  register(server: McpServer, ctx: ToolContext): void;
}

// Cast helpers — structuredContent's index signature makes TypeScript unable to
// unify with CallToolResult via inference; a single typed escape hatch here is
// cleaner than scattering 'as any' across 9 tool files.
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
}): Tool & {
  handler: typeof config.handler;
  format: typeof config.format;
} {
  return {
    name: config.name,
    handler: config.handler,
    format: config.format,

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
          try {
            const output = await config.handler(args, ctx);
            return ok(config.format(output), output);
          } catch (e) {
            if (e instanceof KbError) return err(formatKbError(e));
            throw e; // unexpected — let MCP SDK handle
          }
        },
      );
    },
  };
}
