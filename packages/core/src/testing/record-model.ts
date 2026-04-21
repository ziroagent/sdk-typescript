import type { LanguageModel, ModelCallOptions, ModelGenerateResult } from '../types/model.js';

export interface RecordedGenerateCall {
  options: ModelCallOptions;
  result: ModelGenerateResult;
}

export interface RecordLanguageModelOptions {
  /** When true, push each `generate()` call into {@link RecordedGenerateCall}. */
  recordCalls?: boolean;
}

/**
 * Wraps a real {@link LanguageModel} and optionally records `generate()` I/O
 * for fixtures / replay-style tests (RFC 0008 row B6 — `recordModel` companion
 * to {@link createMockLanguageModel}).
 */
export function recordLanguageModel(
  model: LanguageModel,
  options: RecordLanguageModelOptions = {},
): { model: LanguageModel; calls: RecordedGenerateCall[] } {
  const calls: RecordedGenerateCall[] = [];
  const record = options.recordCalls !== false;

  const wrapped: LanguageModel = {
    modelId: model.modelId,
    provider: model.provider,
    estimateCost: model.estimateCost,
    async generate(opts) {
      const result = await model.generate(opts);
      if (record) calls.push({ options: opts, result });
      return result;
    },
    async stream(opts) {
      return model.stream(opts);
    },
  };

  return { model: wrapped, calls };
}
