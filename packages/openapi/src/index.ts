import { defineTool, type Tool } from '@ziro-agent/tools';
import { z } from 'zod';

/** HTTP verbs we emit tools for (lowercase keys in OpenAPI `paths`). */
export const OPENAPI_TOOL_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head'] as const;
export type OpenAPIToolMethod = (typeof OPENAPI_TOOL_METHODS)[number];

export interface OasParameter {
  name: string;
  in: string;
  required?: boolean;
  schema?: JsonSchemaNode;
}

/** JSON Schema fragment (inline or after `$ref` resolution). */
export interface JsonSchemaNode {
  type?: string;
  $ref?: string;
  properties?: Record<string, JsonSchemaNode>;
  required?: string[];
  items?: JsonSchemaNode;
}

export interface OasRequestBody {
  $ref?: string;
  required?: boolean;
  content?: {
    'application/json'?: {
      schema?: JsonSchemaNode;
    };
  };
}

/** Minimal OpenAPI path operation — extended for JSON bodies (RFC 0010). */
export interface OasOperation {
  operationId?: string;
  summary?: string;
  description?: string;
  parameters?: ReadonlyArray<OasParameter>;
  requestBody?: OasRequestBody;
}

/**
 * Path item: optional `parameters` (inherited by all operations) plus HTTP methods.
 * @see https://spec.openapis.org/oas/v3.1.0#path-item-object
 */
export type OasPathItem = { parameters?: ReadonlyArray<OasParameter> } & Partial<
  Record<OpenAPIToolMethod, OasOperation>
> &
  Record<string, unknown>;

export interface OpenAPISpec {
  paths?: Record<string, OasPathItem>;
  components?: {
    schemas?: Record<string, JsonSchemaNode>;
    requestBodies?: Record<string, OasRequestBody>;
    [key: string]: unknown;
  };
}

export interface ToolsFromOpenAPIOptions {
  /** Origin only, e.g. `https://api.example.com` — joined with each path. */
  baseUrl: string;
  fetchImpl?: typeof fetch;
  /** Bearer token sent as `Authorization: Bearer …` on every tool request. */
  bearerToken?: string;
  /**
   * Filter emitted operations.
   * @param ref.method lowercase verb (`get`, `post`, …).
   */
  include?: (ref: { path: string; method: OpenAPIToolMethod; operationId: string }) => boolean;
}

function sanitizeToolId(operationId: string): string {
  return operationId.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function unescapeJsonPointerToken(segment: string): string {
  return segment.replace(/~1/g, '/').replace(/~0/g, '~');
}

function getByJsonPointer(doc: unknown, pointer: string): unknown {
  if (pointer === '' || pointer === '/') return doc;
  if (!pointer.startsWith('/')) return undefined;
  const parts = pointer.slice(1).split('/');
  let cur: unknown = doc;
  for (const raw of parts) {
    const p = unescapeJsonPointerToken(raw);
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

/** Resolve `#/components/...` references against the root document. */
export function resolveSpecRef(root: OpenAPISpec, ref: string): unknown {
  if (!ref.startsWith('#')) return undefined;
  return getByJsonPointer(root as unknown, ref.slice(1));
}

function resolveRequestBody(
  rb: OasRequestBody | undefined,
  root: OpenAPISpec,
): OasRequestBody | undefined {
  if (!rb) return undefined;
  const ref = rb.$ref;
  if (typeof ref === 'string') {
    const resolved = resolveSpecRef(root, ref);
    if (!resolved || typeof resolved !== 'object') {
      throw new Error(`Unresolved requestBody $ref: ${ref}`);
    }
    return resolveRequestBody(resolved as OasRequestBody, root);
  }
  return rb;
}

function resolveJsonSchema(
  node: JsonSchemaNode | undefined,
  root: OpenAPISpec,
  depth: number,
  stack: Set<string>,
): JsonSchemaNode {
  if (node === undefined) return {};
  const ref = node.$ref;
  if (typeof ref === 'string') {
    if (depth > 48) throw new Error('OpenAPI schema $ref depth exceeded');
    if (stack.has(ref)) throw new Error(`Circular schema $ref: ${ref}`);
    stack.add(ref);
    const resolved = resolveSpecRef(root, ref);
    stack.delete(ref);
    if (!resolved || typeof resolved !== 'object') {
      throw new Error(`Unresolved schema $ref: ${ref}`);
    }
    return resolveJsonSchema(resolved as JsonSchemaNode, root, depth + 1, stack);
  }
  return node;
}

function mergeParameters(
  pathLevel: ReadonlyArray<OasParameter>,
  operationLevel: ReadonlyArray<OasParameter>,
): OasParameter[] {
  const map = new Map<string, OasParameter>();
  const keyOf = (p: OasParameter) => `${p.in}:${p.name}`;
  for (const p of pathLevel) map.set(keyOf(p), p);
  for (const p of operationLevel) map.set(keyOf(p), p);
  return [...map.values()];
}

function extractPathParamNames(path: string): string[] {
  const names: string[] = [];
  for (const m of path.matchAll(/\{([^}]+)\}/g)) {
    if (m[1]) names.push(m[1]);
  }
  return names;
}

function fillPathTemplate(path: string, pathValues: Record<string, string>): string {
  return path.replace(/\{([^}]+)\}/g, (_, name: string) => {
    const v = pathValues[name];
    if (v === undefined) throw new Error(`Missing required path parameter: ${name}`);
    return encodeURIComponent(v);
  });
}

function buildUrl(baseUrl: string, path: string, query: Record<string, string>): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const u = new URL(normalizedPath.replace(/\/{2,}/g, '/'), `${baseUrl.replace(/\/$/, '')}/`);
  const keys = Object.keys(query).sort((a, b) => a.localeCompare(b));
  for (const k of keys) {
    const v = query[k];
    if (v?.length) u.searchParams.set(k, v);
  }
  return u.toString();
}

function jsonSchemaPropertyToZod(
  prop: JsonSchemaNode | undefined,
  required: boolean,
  root: OpenAPISpec,
): z.ZodTypeAny {
  const node = resolveJsonSchema(prop, root, 0, new Set());
  if (!node || Object.keys(node).length === 0) {
    return required ? z.unknown() : z.unknown().optional();
  }
  const t = node.type;
  let base: z.ZodTypeAny;
  switch (t) {
    case 'string':
      base = z.string();
      break;
    case 'integer':
    case 'number':
      base = z.number();
      break;
    case 'boolean':
      base = z.boolean();
      break;
    case 'array':
      base = z.array(node.items ? jsonSchemaPropertyToZod(node.items, true, root) : z.unknown());
      break;
    case 'object':
      base = jsonSchemaObjectToZod(node, root);
      break;
    default:
      if (node.properties && typeof node.properties === 'object') {
        base = jsonSchemaObjectToZod(node, root);
      } else {
        base = z.record(z.string(), z.unknown());
      }
      break;
  }
  return required ? base : base.optional();
}

function jsonSchemaObjectToZod(
  schema: JsonSchemaNode | undefined,
  root: OpenAPISpec,
): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const node = resolveJsonSchema(schema, root, 0, new Set());
  if (!node.properties || typeof node.properties !== 'object') {
    return z.object({}).strict();
  }
  const req = new Set(node.required ?? []);
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [key, propSchema] of Object.entries(node.properties)) {
    shape[key] = jsonSchemaPropertyToZod(propSchema, req.has(key), root);
  }
  return z.object(shape).strict();
}

function methodMutates(method: OpenAPIToolMethod): boolean {
  return method !== 'get' && method !== 'head';
}

function isObjectLikeSchema(s: JsonSchemaNode | undefined): boolean {
  if (!s) return false;
  return s.type === 'object' || Boolean(s.properties && Object.keys(s.properties).length > 0);
}

/**
 * Emit one {@link Tool} per operation that declares `operationId`.
 * Supports **GET** (query + path), **POST** /** PUT** /** PATCH** / **DELETE** with optional
 * `application/json` body (inline or **`#/components/schemas/...`** `$ref`).
 * Path-level **`parameters`** are merged with operation parameters (operation wins on conflicts).
 * Path `{param}` substitution is applied.
 *
 * Request body fields are passed under the **`body`** key when the operation defines a JSON object schema.
 */
export function toolsFromOpenAPISpec(
  spec: OpenAPISpec,
  opts: ToolsFromOpenAPIOptions,
): Record<string, Tool> {
  const fetchFn = opts.fetchImpl ?? fetch;
  const out: Record<string, Tool> = {};
  const paths = spec.paths ?? {};
  const headersBase: Record<string, string> = {};
  if (opts.bearerToken) {
    headersBase.Authorization = `Bearer ${opts.bearerToken}`;
  }

  for (const [pathKey, pathItemUnknown] of Object.entries(paths)) {
    if (!pathItemUnknown || typeof pathItemUnknown !== 'object') continue;
    const pathItem = pathItemUnknown as OasPathItem;
    const pathLevelParams = Array.isArray(pathItem.parameters) ? pathItem.parameters : [];

    for (const method of OPENAPI_TOOL_METHODS) {
      const op = pathItem[method];
      if (!op?.operationId) continue;
      if (opts.include && !opts.include({ path: pathKey, method, operationId: op.operationId })) {
        continue;
      }

      const id = sanitizeToolId(op.operationId);
      const mergedParams = mergeParameters(pathLevelParams, op.parameters ?? []);
      const pathParamsFromSpec = mergedParams.filter((p) => p.in === 'path');
      const queryParams = mergedParams.filter((p) => p.in === 'query');
      const templateNames = extractPathParamNames(pathKey);
      const declaredPathNames = new Set(pathParamsFromSpec.map((p) => p.name));
      const pathParams = [...pathParamsFromSpec];
      for (const n of templateNames) {
        if (!declaredPathNames.has(n)) {
          pathParams.push({
            name: n,
            in: 'path',
            required: true,
            schema: { type: 'string' },
          });
        }
      }

      const rbResolved = resolveRequestBody(op.requestBody, spec);
      const rawBodySchema = rbResolved?.content?.['application/json']?.schema;
      const resolvedBodySchema = rawBodySchema
        ? resolveJsonSchema(rawBodySchema, spec, 0, new Set())
        : undefined;
      const hasBody = isObjectLikeSchema(resolvedBodySchema);
      const bodyRequired = rbResolved?.required === true && hasBody;

      const shape: Record<string, z.ZodTypeAny> = {};

      for (const p of pathParams) {
        const sch = p.schema ?? { type: 'string' };
        shape[p.name] = jsonSchemaPropertyToZod(sch, p.required !== false, spec);
      }
      for (const p of queryParams) {
        const sch = p.schema ?? { type: 'string' };
        shape[p.name] = jsonSchemaPropertyToZod(sch, p.required === true, spec);
      }

      if (hasBody && resolvedBodySchema) {
        const bodyZod = jsonSchemaObjectToZod(resolvedBodySchema, spec);
        shape.body = bodyRequired ? bodyZod : bodyZod.optional();
      }

      const inputSchema =
        Object.keys(shape).length > 0 ? z.object(shape).strict() : z.object({}).strict();

      const mutates = methodMutates(method);

      out[id] = defineTool({
        name: id,
        description: op.summary ?? op.description,
        mutates,
        input: inputSchema,
        execute: async (args: Record<string, unknown>) => {
          const pathVals: Record<string, string> = {};
          const q: Record<string, string> = {};
          let bodyPayload: unknown;

          for (const p of pathParams) {
            const v = args[p.name];
            if (v !== undefined && v !== '') pathVals[p.name] = String(v);
          }
          for (const p of queryParams) {
            const v = args[p.name];
            if (v !== undefined && v !== '') q[p.name] = String(v);
          }
          if (hasBody && args.body !== undefined) {
            bodyPayload = args.body;
          }

          const filledPath = fillPathTemplate(pathKey, pathVals);
          const url = buildUrl(opts.baseUrl, filledPath, q);

          const headers: Record<string, string> = { ...headersBase };
          const init: RequestInit = { method: method.toUpperCase() };
          if (hasBody && bodyPayload !== undefined) {
            headers['Content-Type'] = 'application/json';
            init.body = JSON.stringify(bodyPayload);
          }
          if (Object.keys(headers).length) init.headers = headers;

          const res = await fetchFn(url, init);
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
