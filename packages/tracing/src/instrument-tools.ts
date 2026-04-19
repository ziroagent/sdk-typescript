import { ATTR } from './attributes.js';
import { getTracer } from './tracer.js';

/**
 * Wrap a tool's `execute` so each invocation opens a span. Designed to be
 * applied at the `defineTool` boundary or anywhere a tool object is mutated
 * before being handed to the agent.
 *
 * The signature is intentionally generic so this works against
 * `@ziroagent/tools`'s `Tool` type without an import cycle.
 */
export interface ToolLike<TArgs = unknown, TResult = unknown> {
  name: string;
  description?: string;
  execute(args: TArgs, ctx?: unknown): Promise<TResult> | TResult;
}

export function instrumentTool<T extends ToolLike>(tool: T): T {
  const original = tool.execute.bind(tool);
  return {
    ...tool,
    async execute(args: unknown, ctx?: unknown) {
      const tracer = getTracer();
      return tracer.withSpan(
        `gen_ai.tool.${tool.name}`,
        async (span) => {
          span.setAttributes({ [ATTR.ToolName]: tool.name });
          try {
            const out = await original(args as never, ctx);
            return out;
          } catch (err) {
            span.setAttributes({ [ATTR.ToolError]: true });
            throw err;
          }
        },
        { kind: 'internal' },
      );
    },
  } as T;
}

export function instrumentTools<T extends Record<string, ToolLike>>(tools: T): T {
  const out: Record<string, ToolLike> = {};
  for (const [k, v] of Object.entries(tools)) out[k] = instrumentTool(v);
  return out as T;
}
