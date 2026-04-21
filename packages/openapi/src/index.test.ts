import { describe, expect, it, vi } from 'vitest';
import { toolsFromOpenAPISpec } from './index.js';

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
    expect(fetchImpl).toHaveBeenCalledWith('https://api.example.com/items?limit=10&q=hi', {
      method: 'GET',
    });
  });
});
