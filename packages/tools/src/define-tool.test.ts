import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineTool, isTool } from './define-tool.js';
import { executeToolCalls } from './execute.js';
import { toolToModelDefinition, toolsToModelDefinitions } from './schema.js';

describe('defineTool', () => {
  it('produces a branded tool object', () => {
    const t = defineTool({
      name: 'add',
      description: 'add two numbers',
      input: z.object({ a: z.number(), b: z.number() }),
      execute: ({ a, b }) => a + b,
    });
    expect(isTool(t)).toBe(true);
    expect(t.name).toBe('add');
    expect(t.description).toBe('add two numbers');
  });
});

describe('toolToModelDefinition', () => {
  it('converts Zod input to JSON Schema', () => {
    const t = defineTool({
      name: 'getWeather',
      input: z.object({ city: z.string(), units: z.enum(['c', 'f']).optional() }),
      execute: () => null,
    });
    const def = toolToModelDefinition(t);
    expect(def.name).toBe('getWeather');
    expect(def.parameters['type']).toBe('object');
    expect((def.parameters['properties'] as Record<string, unknown>)['city']).toBeDefined();
  });

  it('handles record input from object form', () => {
    const tools = {
      a: defineTool({ name: 'a', input: z.object({ x: z.string() }), execute: () => null }),
      b: defineTool({ name: 'b', input: z.object({ y: z.number() }), execute: () => null }),
    };
    const defs = toolsToModelDefinitions(tools);
    expect(defs).toHaveLength(2);
    expect(defs.map((d) => d.name).sort()).toEqual(['a', 'b']);
  });
});

describe('executeToolCalls', () => {
  const add = defineTool({
    name: 'add',
    input: z.object({ a: z.number(), b: z.number() }),
    execute: ({ a, b }) => a + b,
  });
  const fail = defineTool({
    name: 'fail',
    input: z.object({}),
    execute: () => {
      throw new Error('boom');
    },
  });

  it('runs tools in parallel and returns results', async () => {
    const results = await executeToolCalls({
      tools: { add },
      toolCalls: [
        { type: 'tool-call', toolCallId: '1', toolName: 'add', args: { a: 1, b: 2 } },
        { type: 'tool-call', toolCallId: '2', toolName: 'add', args: { a: 5, b: 7 } },
      ],
    });
    expect(results).toHaveLength(2);
    expect(results[0]?.result).toBe(3);
    expect(results[1]?.result).toBe(12);
    expect(results.every((r) => !r.isError)).toBe(true);
  });

  it('captures Zod validation errors as tool errors', async () => {
    const results = await executeToolCalls({
      tools: { add },
      toolCalls: [
        { type: 'tool-call', toolCallId: '1', toolName: 'add', args: { a: 'oops', b: 2 } },
      ],
    });
    expect(results[0]?.isError).toBe(true);
  });

  it('captures execute errors', async () => {
    const results = await executeToolCalls({
      tools: { fail },
      toolCalls: [{ type: 'tool-call', toolCallId: '1', toolName: 'fail', args: {} }],
    });
    expect(results[0]?.isError).toBe(true);
    expect((results[0]?.result as { message: string }).message).toBe('boom');
  });

  it('throws on unknown tool when strict (default)', async () => {
    await expect(
      executeToolCalls({
        tools: { add },
        toolCalls: [{ type: 'tool-call', toolCallId: '1', toolName: 'missing', args: {} }],
      }),
    ).rejects.toThrow(/not registered/);
  });

  it('skips unknown tool when strict=false', async () => {
    const results = await executeToolCalls({
      tools: { add },
      strict: false,
      toolCalls: [{ type: 'tool-call', toolCallId: '1', toolName: 'missing', args: {} }],
    });
    expect(results[0]?.isError).toBe(true);
  });
});
