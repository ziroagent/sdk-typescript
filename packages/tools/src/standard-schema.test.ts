import type { StandardSchemaV1 } from '@standard-schema/spec';
import { describe, expect, it } from 'vitest';
import { parseAsync, z } from 'zod';
import { defineTool } from './define-tool.js';
import { executeToolCalls } from './execute.js';
import { toolToModelDefinition } from './schema.js';
import { zodFromStandardSchema } from './standard-schema.js';

describe('zodFromStandardSchema', () => {
  it('validates via Standard Schema validate()', async () => {
    const std: StandardSchemaV1<unknown, { n: number }> = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate(value) {
          if (typeof value === 'object' && value !== null && 'n' in value) {
            const n = (value as { n: unknown }).n;
            if (typeof n === 'number') return { value: { n } };
          }
          return { issues: [{ message: 'need { n: number }' }] };
        },
      },
    };
    const zod = zodFromStandardSchema(std);
    await expect(parseAsync(zod, { n: 1 })).resolves.toEqual({ n: 1 });
    await expect(parseAsync(zod, { n: 'x' })).rejects.toThrow();
  });

  it('works end-to-end in defineTool + executeToolCalls', async () => {
    const std: StandardSchemaV1<unknown, { city: string }> = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate(value) {
          if (
            typeof value === 'object' &&
            value !== null &&
            'city' in value &&
            typeof (value as { city: unknown }).city === 'string'
          ) {
            return { value: value as { city: string } };
          }
          return { issues: [{ message: 'city must be a string' }] };
        },
      },
    };
    const tool = defineTool({
      name: 'weather',
      input: std,
      execute: async (input) => `ok:${input.city}`,
    });
    const [r] = await executeToolCalls({
      toolCalls: [
        {
          type: 'tool-call',
          toolCallId: '1',
          toolName: 'weather',
          args: { city: 'Paris' },
        },
      ],
      tools: { weather: tool },
    });
    expect(r.isError).toBe(false);
    expect(r.result).toBe('ok:Paris');
  });

  it('still emits JSON Schema for Zod-native tools', () => {
    const t = defineTool({
      name: 'z',
      input: z.object({ a: z.string() }),
      execute: async () => 'x',
    });
    const def = toolToModelDefinition(t);
    expect(def.parameters.type).toBe('object');
  });
});
