import { describe, expect, it, vi } from 'vitest';
import { type OpenAPISpec, toolsFromOpenAPISpec } from './index.js';

describe('toolsFromOpenAPISpec', () => {
  it('creates GET tools with query params', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ ok: true }),
    });

    const spec = {
      paths: {
        '/items': {
          get: {
            operationId: 'listItems',
            summary: 'List',
            parameters: [
              { name: 'q', in: 'query', required: false },
              { name: 'limit', in: 'query', required: true },
            ],
          },
        },
      },
    };

    const tools = toolsFromOpenAPISpec(spec, {
      baseUrl: 'https://api.example.com',
      fetchImpl,
    });

    expect(tools.listItems).toBeDefined();
    await tools.listItems?.execute(
      { limit: '10', q: 'hi' },
      {
        toolCallId: '1',
      },
    );
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.example.com/items?limit=10&q=hi',
      expect.objectContaining({
        method: 'GET',
      }),
    );
  });

  it('creates POST tools with JSON body and sets mutates', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ id: '1' }),
    });

    const spec = {
      paths: {
        '/items': {
          post: {
            operationId: 'createItem',
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['name'],
                    properties: {
                      name: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };

    const tools = toolsFromOpenAPISpec(spec, {
      baseUrl: 'https://api.example.com',
      fetchImpl,
    });

    expect(tools.createItem?.mutates).toBe(true);
    await tools.createItem?.execute({ body: { name: 'x' } }, { toolCallId: '1' });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.example.com/items',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'x' }),
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });

  it('substitutes path parameters', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({}),
    });

    const spec = {
      paths: {
        '/items/{itemId}': {
          get: {
            operationId: 'getItem',
          },
        },
      },
    };

    const tools = toolsFromOpenAPISpec(spec, {
      baseUrl: 'https://api.example.com',
      fetchImpl,
    });

    await tools.getItem?.execute({ itemId: 'abc' }, { toolCallId: '1' });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.example.com/items/abc',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('merges path-level parameters with operation params', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({}),
    });

    const spec: OpenAPISpec = {
      paths: {
        '/orgs/{orgId}/projects': {
          parameters: [{ name: 'orgId', in: 'path', required: true, schema: { type: 'string' } }],
          get: {
            operationId: 'listProjects',
            parameters: [
              { name: 'filter', in: 'query', required: false, schema: { type: 'string' } },
            ],
          },
        },
      },
    };

    const tools = toolsFromOpenAPISpec(spec, {
      baseUrl: 'https://api.example.com',
      fetchImpl,
    });

    await tools.listProjects.execute({ orgId: 'acme', filter: 'x' }, { toolCallId: '1' });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.example.com/orgs/acme/projects?filter=x',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('resolves components/schemas $ref for JSON body', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({}),
    });

    const spec: OpenAPISpec = {
      paths: {
        '/items': {
          post: {
            operationId: 'createItemRef',
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/CreateItem' },
                },
              },
            },
          },
        },
      },
      components: {
        schemas: {
          CreateItem: {
            type: 'object',
            required: ['name'],
            properties: {
              name: { type: 'string' },
            },
          },
        },
      },
    };

    const tools = toolsFromOpenAPISpec(spec, {
      baseUrl: 'https://api.example.com',
      fetchImpl,
    });

    await tools.createItemRef.execute({ body: { name: 'a' } }, { toolCallId: '1' });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.example.com/items',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'a' }),
      }),
    );
  });

  it('resolves requestBody $ref', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({}),
    });

    const spec: OpenAPISpec = {
      paths: {
        '/x': {
          post: {
            operationId: 'postBodyRef',
            requestBody: { $ref: '#/components/requestBodies/BodyA' },
          },
        },
      },
      components: {
        requestBodies: {
          BodyA: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { n: { type: 'number' } },
                },
              },
            },
          },
        },
      },
    };

    const tools = toolsFromOpenAPISpec(spec, {
      baseUrl: 'https://api.example.com',
      fetchImpl,
    });

    await tools.postBodyRef.execute({ body: { n: 1 } }, { toolCallId: '1' });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.example.com/x',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ n: 1 }),
      }),
    );
  });
});
