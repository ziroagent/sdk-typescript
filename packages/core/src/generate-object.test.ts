import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { JSONParseError, NoTextGeneratedError } from './errors.js';
import { generateObject } from './generate-object.js';
import { createMockLanguageModel } from './testing/mock-model.js';
import type { ModelGenerateResult } from './types/model.js';

describe('generateObject', () => {
  const schema = z.object({ count: z.number() });

  it('parses and validates on first success', async () => {
    const model = createMockLanguageModel({
      async generate(): Promise<ModelGenerateResult> {
        return {
          text: '{"count":3}',
          content: [{ type: 'text', text: '{"count":3}' }],
          toolCalls: [],
          finishReason: 'stop',
          usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
        };
      },
    });
    const r = await generateObject({ model, schema, prompt: 'give me a count' });
    expect(r.object).toEqual({ count: 3 });
    expect(r.repairAttempted).toBe(false);
    expect(r.usage.totalTokens).toBe(3);
  });

  it('accepts JSON inside markdown fences', async () => {
    const model = createMockLanguageModel({
      async generate(): Promise<ModelGenerateResult> {
        const text = '```json\n{"count":1}\n```';
        return {
          text,
          content: [{ type: 'text', text }],
          toolCalls: [],
          finishReason: 'stop',
          usage: { totalTokens: 1 },
        };
      },
    });
    const r = await generateObject({ model, schema, prompt: 'x' });
    expect(r.object).toEqual({ count: 1 });
  });

  it('runs one repair pass after schema failure', async () => {
    let calls = 0;
    const model = createMockLanguageModel({
      async generate(): Promise<ModelGenerateResult> {
        calls += 1;
        const text = calls === 1 ? '{"count":"nope"}' : '{"count":42}';
        return {
          text,
          content: [{ type: 'text', text }],
          toolCalls: [],
          finishReason: 'stop',
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        };
      },
    });
    const r = await generateObject({ model, schema, prompt: 'x' });
    expect(calls).toBe(2);
    expect(r.repairAttempted).toBe(true);
    expect(r.object).toEqual({ count: 42 });
    expect(r.usage.totalTokens).toBe(4);
  });

  it('throws ObjectValidationError when repair is disabled and schema fails', async () => {
    const model = createMockLanguageModel({
      async generate(): Promise<ModelGenerateResult> {
        return {
          text: '{"count":"bad"}',
          content: [{ type: 'text', text: '{"count":"bad"}' }],
          toolCalls: [],
          finishReason: 'stop',
          usage: { totalTokens: 1 },
        };
      },
    });
    await expect(
      generateObject({ model, schema, prompt: 'x', repair: false }),
    ).rejects.toMatchObject({
      name: 'ObjectValidationError',
      code: 'object_validation_error',
      repairAttempted: false,
    });
  });

  it('throws JSONParseError when repair is disabled and JSON is invalid', async () => {
    const model = createMockLanguageModel({
      async generate(): Promise<ModelGenerateResult> {
        return {
          text: 'not-json',
          content: [{ type: 'text', text: 'not-json' }],
          toolCalls: [],
          finishReason: 'stop',
          usage: { totalTokens: 1 },
        };
      },
    });
    await expect(
      generateObject({ model, schema, prompt: 'x', repair: false }),
    ).rejects.toBeInstanceOf(JSONParseError);
  });

  it('throws after failed repair', async () => {
    let calls = 0;
    const model = createMockLanguageModel({
      async generate(): Promise<ModelGenerateResult> {
        calls += 1;
        const text = '{"count":"still-bad"}';
        return {
          text,
          content: [{ type: 'text', text }],
          toolCalls: [],
          finishReason: 'stop',
          usage: { totalTokens: 1 },
        };
      },
    });
    await expect(generateObject({ model, schema, prompt: 'x' })).rejects.toMatchObject({
      name: 'ObjectValidationError',
      repairAttempted: true,
    });
    expect(calls).toBe(2);
  });

  it('throws NoTextGeneratedError when the model returns only tool calls', async () => {
    const model = createMockLanguageModel({
      toolCalls: [
        {
          type: 'tool-call',
          toolCallId: '1',
          toolName: 'noop',
          args: {},
        },
      ],
    });
    await expect(generateObject({ model, schema, prompt: 'x' })).rejects.toBeInstanceOf(
      NoTextGeneratedError,
    );
  });
});
