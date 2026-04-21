import { defineTool, type Tool } from '@ziro-agent/tools';
import { z } from 'zod';

/** Minimal OpenAPI 3.x path item we read today (extend for POST, bodies, etc.). */
export interface OasOperation {
  operationId?: string;
  summary?: string;
  description?: string;
  parameters?: ReadonlyArray<{
    name: string;
    in: string;
    required?: boolean;
    schema?: { type?: string; default?: unknown };
  }>;
}

export interface OpenAPISpec {
  paths?: Record<string, Partial<Record<string, OasOperation>>>;
}

export interface ToolsFromOpenAPIOptions {
  /** Origin only, e.g. `https://api.example.com` — joined with each path. */
  baseUrl: string;
  fetchImpl?: typeof fetch;
  /** Filter emitted operations; default keeps every `get` with `operationId`. */
  include?: (ref: { path: string; operationId: string }) => boolean;
}

function sanitizeToolId(operationId: string): string {
  return operationId.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function buildUrl(baseUrl: string, path: string, query: Record<string, string>): string {
  const u = new URL(path.replace(/\/{2,}/g, '/'), `${baseUrl.replace(/\/$/, '')}/`);
  for (const [k, v] of Object.entries(query)) {
    if (v.length) u.searchParams.set(k, v);
  }
  return u.toString();
}

/**
 * Emit one {@link Tool} per **GET** operation that declares `operationId`.
 * Query parameters become Zod string fields (required vs optional from the spec).
 *
 * This is an intentionally small v0.3 slice (RFC 0010) — extend for verbs,
 * request bodies, and auth once design partners pick parsers.
 */
export function toolsFromOpenAPISpec(
  spec: OpenAPISpec,
  opts: ToolsFromOpenAPIOptions,
): Record<string, Tool> {
  const fetchFn = opts.fetchImpl ?? fetch;
  const out: Record<string, Tool> = {};
  const paths = spec.paths ?? {};

  for (const [path, methods] of Object.entries(paths)) {
    const get = methods?.get;
    if (!get?.operationId) continue;
    if (opts.include && !opts.include({ path, operationId: get.operationId })) continue;

    const id = sanitizeToolId(get.operationId);
    const queryParams = (get.parameters ?? []).filter((p) => p.in === 'query');
    const shape: Record<string, z.ZodType<string | undefined>> = {};
    for (const p of queryParams) {
      const base = z.string();
      shape[p.name] = p.required ? base : base.optional();
    }
    const inputSchema =
      Object.keys(shape).length > 0 ? z.object(shape).strict() : z.object({}).strict();

    out[id] = defineTool({
      name: id,
      description: get.summary ?? get.description,
      input: inputSchema,
      execute: async (args: Record<string, string | undefined>) => {
        const q: Record<string, string> = {};
        for (const [k, v] of Object.entries(args)) {
          if (v !== undefined && v !== '') q[k] = v;
        }
        const url = buildUrl(opts.baseUrl, path.startsWith('/') ? path : `/${path}`, q);
        const res = await fetchFn(url, { method: 'GET' });
        if (!res.ok) {
          throw new Error(`OpenAPI tool ${id}: HTTP ${res.status} ${res.statusText}`);
        }
        const ct = res.headers.get('content-type') ?? '';
        if (ct.includes('application/json')) {
          return (await res.json()) as unknown;
        }
        return await res.text();
      },
    });
  }

  return out;
}

/**
 * Fetch a JSON OpenAPI document then {@link toolsFromOpenAPISpec}.
 */
export async function toolsFromOpenAPIUrl(
  url: string,
  opts: ToolsFromOpenAPIOptions,
): Promise<Record<string, Tool>> {
  const fetchFn = opts.fetchImpl ?? fetch;
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`Failed to fetch OpenAPI spec: HTTP ${res.status}`);
  const spec = (await res.json()) as OpenAPISpec;
  return toolsFromOpenAPISpec(spec, opts);
}
