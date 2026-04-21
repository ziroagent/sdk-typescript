import { ATTR, type AttrValue } from './attributes.js';
import { getTracer } from './tracer.js';

/**
 * Wrap a tool's `execute` so each invocation opens a span. Designed to be
 * applied at the `defineTool` boundary or anywhere a tool object is mutated
 * before being handed to the agent.
 *
 * The signature is intentionally generic so this works against
 * `@ziro-agent/tools`'s `Tool` type without an import cycle.
 */
export interface ToolLike<TArgs = unknown, TResult = unknown> {
  name: string;
  description?: string;
  execute(args: TArgs, ctx?: unknown): Promise<TResult> | TResult;
}

/** Optional fields from `@ziro-agent/tools` `Tool` (RFC 0013). */
type ToolWithTraceMeta = ToolLike & {
  capabilities?: readonly string[];
  spanName?: string;
  traceAttributes?: Readonly<Record<string, string>>;
};

export function instrumentTool<T extends ToolLike>(tool: T): T {
  const original = tool.execute.bind(tool);
  const meta = tool as T & ToolWithTraceMeta;
  return {
    ...tool,
    async execute(args: unknown, ctx?: unknown) {
      const tracer = getTracer();
      const spanName = meta.spanName ?? `gen_ai.tool.${tool.name}`;
      return tracer.withSpan(
        spanName,
        async (span) => {
          const attrs: Record<string, AttrValue> = { [ATTR.ToolName]: tool.name };
          if (meta.capabilities !== undefined && meta.capabilities.length > 0) {
            attrs[ATTR.ToolCapabilities] = [...meta.capabilities];
          }
          if (meta.traceAttributes !== undefined) {
            for (const [k, v] of Object.entries(meta.traceAttributes)) {
              attrs[k] = v as AttrValue;
            }
          }
          span.setAttributes(attrs);
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
