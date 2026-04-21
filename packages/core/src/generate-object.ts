import type { z } from 'zod';
import { z as zod } from 'zod';
import { BudgetExceededError } from './budget/errors.js';
import { applyResolution } from './budget/resolver.js';
import { withBudget } from './budget/scope.js';
import type { BudgetSpec } from './budget/types.js';
import { JSONParseError, NoTextGeneratedError, ObjectValidationError } from './errors.js';
import { generateText } from './generate-text.js';
import type { ToolCallPart } from './types/content.js';
import type { FinishReason } from './types/finish-reason.js';
import type { ChatMessage } from './types/messages.js';
import type { LanguageModel } from './types/model.js';
import type { TokenUsage } from './types/usage.js';
import { addUsage } from './types/usage.js';
import type { PromptInput } from './util/normalize-prompt.js';

export interface GenerateObjectOptions<T> extends PromptInput {
  model: LanguageModel;
  schema: z.ZodType<T>;
  temperature?: number;
  topP?: number;
  topK?: number;
  maxTokens?: number;
  stopSequences?: string[];
  seed?: number;
  providerOptions?: Record<string, unknown>;
  abortSignal?: AbortSignal;
  headers?: Record<string, string>;
  budget?: BudgetSpec;
  /**
   * When `true` (default), after a JSON parse failure or Zod validation
   * failure the SDK makes one follow-up model call with the error details.
   */
  repair?: boolean;
}

export interface GenerateObjectResult<T> {
  object: T;
  finishReason: FinishReason;
  usage: TokenUsage;
  /** `true` when the first attempt failed and a repair pass produced `object`. */
  repairAttempted: boolean;
  rawResponse?: unknown;
}

const STRUCTURED_PREFIX =
  'You must reply with a single JSON value only (no markdown fences, no prose before or after).\n' +
  'The value must conform to this JSON Schema:\n';

function schemaInstruction(schema: z.ZodType): string {
  const jsonSchema = zod.toJSONSchema(schema, { target: 'draft-7' });
  return STRUCTURED_PREFIX + JSON.stringify(jsonSchema, null, 2);
}

/** Strip common ```json fences and surrounding whitespace. */
function extractJsonFromText(raw: string): string {
  const text = raw.trim();
  const fenced = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i.exec(text);
  if (fenced?.[1]) return fenced[1].trim();
  if (text.startsWith('```')) {
    return text
      .replace(/^```(?:json)?\s*\n?/i, '')
      .replace(/\n?```\s*$/i, '')
      .trim();
  }
  return text;
}

function parseJsonLenient(raw: string): unknown {
  const slice = extractJsonFromText(raw);
  try {
    return JSON.parse(slice);
  } catch (cause) {
    throw new JSONParseError(slice, cause);
  }
}

function summarizeZodIssues(
  err: zod.ZodError,
): readonly { path: (string | number)[]; message: string; code?: string }[] {
  return err.issues.map((i) => ({
    path: i.path as (string | number)[],
    message: i.message,
    code: i.code,
  }));
}

function promptTurns(input: PromptInput): ChatMessage[] {
  if (input.prompt !== undefined) {
    return [{ role: 'user', content: input.prompt }];
  }
  return input.messages ?? [];
}

function mergeSystem(user: string | undefined, structured: string): string | undefined {
  if (user !== undefined && user.length > 0) {
    return `${user}\n\n${structured}`;
  }
  return structured;
}

type GenerateTextKnobs = Pick<
  GenerateObjectOptions<unknown>,
  | 'temperature'
  | 'topP'
  | 'topK'
  | 'maxTokens'
  | 'stopSequences'
  | 'seed'
  | 'providerOptions'
  | 'abortSignal'
  | 'headers'
>;

function buildGenerateTextArgs(
  model: LanguageModel,
  knobs: Partial<GenerateTextKnobs>,
  system: string | undefined,
  promptOverride: PromptInput,
): Parameters<typeof generateText>[0] {
  const {
    temperature,
    topP,
    topK,
    maxTokens,
    stopSequences,
    seed,
    providerOptions,
    abortSignal,
    headers,
  } = knobs;
  return {
    model,
    ...(system !== undefined ? { system } : {}),
    ...promptOverride,
    ...(temperature !== undefined ? { temperature } : {}),
    ...(topP !== undefined ? { topP } : {}),
    ...(topK !== undefined ? { topK } : {}),
    ...(maxTokens !== undefined ? { maxTokens } : {}),
    ...(stopSequences !== undefined ? { stopSequences } : {}),
    ...(seed !== undefined ? { seed } : {}),
    ...(providerOptions !== undefined ? { providerOptions } : {}),
    ...(abortSignal !== undefined ? { abortSignal } : {}),
    ...(headers !== undefined ? { headers } : {}),
  };
}

function throwIfBadAssistantShape(text: string, toolCalls: ToolCallPart[]): void {
  if (toolCalls.length > 0) {
    throw new NoTextGeneratedError();
  }
  if (!text.trim()) {
    throw new NoTextGeneratedError();
  }
}

/**
 * Structured output: asks the model for JSON, parses it, validates with
 * `schema`, and optionally runs one repair pass (see `repair` option).
 * Budget scopes opened via `budget` wrap both attempts as a single guard.
 */
export async function generateObject<T>(
  options: GenerateObjectOptions<T>,
): Promise<GenerateObjectResult<T>> {
  const { model, schema, budget, repair = true, system, ...rest } = options;
  const structured = schemaInstruction(schema);
  const mergedSystem = mergeSystem(system, structured);
  const allowRepair = repair !== false;

  const {
    temperature,
    topP,
    topK,
    maxTokens,
    stopSequences,
    seed,
    providerOptions,
    abortSignal,
    headers,
  } = rest;

  const knobs: Partial<GenerateTextKnobs> = {
    temperature,
    topP,
    topK,
    maxTokens,
    stopSequences,
    seed,
    providerOptions,
    abortSignal,
    headers,
  };

  const exec = async (): Promise<GenerateObjectResult<T>> => {
    const firstArgs = buildGenerateTextArgs(model, knobs, mergedSystem, {
      prompt: rest.prompt,
      messages: rest.messages,
    });
    const first = await generateText(firstArgs);
    throwIfBadAssistantShape(first.text, first.toolCalls);

    let usage = first.usage;
    let finishReason = first.finishReason;
    let rawResponse = first.rawResponse;
    let repairAttempted = false;

    const parseAndValidate = (rawText: string): T => {
      throwIfBadAssistantShape(rawText, []);
      const parsed = parseJsonLenient(rawText);
      const parsedResult = schema.safeParse(parsed);
      if (!parsedResult.success) {
        throw parsedResult.error;
      }
      return parsedResult.data;
    };

    try {
      const object = parseAndValidate(first.text);
      return {
        object,
        finishReason,
        usage,
        repairAttempted,
        ...(rawResponse !== undefined ? { rawResponse } : {}),
      };
    } catch (firstErr) {
      if (firstErr instanceof NoTextGeneratedError) {
        throw firstErr;
      }
      if (!allowRepair) {
        throw toFinalError(firstErr, first.text, false);
      }

      const issueText = formatFirstPassError(firstErr);
      const baseTurns = promptTurns({ prompt: rest.prompt, messages: rest.messages });
      const repairMessages: ChatMessage[] = [
        ...baseTurns,
        { role: 'assistant', content: first.text },
        {
          role: 'user',
          content:
            'Your previous reply was not valid for the requested JSON schema. ' +
            'Reply again with JSON only (no markdown) that fixes the problem.\n\n' +
            issueText,
        },
      ];

      repairAttempted = true;
      const secondArgs = buildGenerateTextArgs(model, knobs, mergedSystem, {
        messages: repairMessages,
      });
      const second = await generateText(secondArgs);
      usage = addUsage(usage, second.usage);
      finishReason = second.finishReason;
      rawResponse = second.rawResponse ?? rawResponse;
      throwIfBadAssistantShape(second.text, second.toolCalls);

      try {
        const object = parseAndValidate(second.text);
        return {
          object,
          finishReason,
          usage,
          repairAttempted,
          ...(rawResponse !== undefined ? { rawResponse } : {}),
        };
      } catch (secondErr) {
        throw toFinalError(secondErr, second.text, true);
      }
    }
  };

  if (budget) {
    try {
      return await withBudget(budget, exec);
    } catch (err) {
      if (err instanceof BudgetExceededError) {
        const syntheticScope = {
          id: err.scopeId,
          spec: budget,
          used: { ...err.partialUsage, steps: 0 },
          startedAt: 0,
          firedWarnings: new Set<string>(),
        };
        return await applyResolution<GenerateObjectResult<T>>(syntheticScope, err);
      }
      throw err;
    }
  }
  return await exec();
}

function formatFirstPassError(err: unknown): string {
  if (err instanceof JSONParseError) {
    return `Invalid JSON: ${err.message}\nRaw (trimmed excerpt): ${err.text.slice(0, 2000)}`;
  }
  if (err instanceof zod.ZodError) {
    return err.issues.map((i) => `- ${i.path.join('.') || '(root)'}: ${i.message}`).join('\n');
  }
  return String(err);
}

function toFinalError(err: unknown, text: string, repairAttempted: boolean): never {
  if (err instanceof JSONParseError) {
    throw err;
  }
  if (err instanceof zod.ZodError) {
    throw new ObjectValidationError({
      message: 'Model output failed schema validation.',
      text,
      repairAttempted,
      zodIssues: summarizeZodIssues(err),
      cause: err,
    });
  }
  throw err;
}
