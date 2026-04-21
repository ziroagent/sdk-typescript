import type {
  LanguageModel,
  ModelCallOptions,
  ModelGenerateResult,
  ModelStreamPart,
} from '../types/model.js';

/**
 * Thrown when {@link createReplayLanguageModel} has no pre-recorded
 * `generate()` response left for the next call.
 */
export class ReplayExhaustedError extends Error {
  override readonly name = 'ReplayExhaustedError';
  readonly recordedCount: number;
  constructor(recordedCount: number) {
    super(`Replay model exhausted after ${recordedCount} recorded generate() response(s).`);
    this.recordedCount = recordedCount;
  }
}

/**
 * Deterministic `LanguageModel` for CI: each `generate()` consumes the next
 * entry from `responses` in order (no LLM). `stream()` is not supported.
 *
 * v0.6 record/replay slice — pair with {@link recordLanguageModel} fixtures
 * (RFC 0015 L1).
 */
export function createReplayLanguageModel(
  responses: readonly ModelGenerateResult[],
  options?: { modelId?: string },
): LanguageModel {
  let index = 0;
  const modelId = options?.modelId ?? 'replay-model';
  return {
    modelId,
    provider: 'replay',
    async generate(_opts: ModelCallOptions): Promise<ModelGenerateResult> {
      if (index >= responses.length) {
        throw new ReplayExhaustedError(responses.length);
      }
      const r = responses[index];
      if (r === undefined) {
        throw new ReplayExhaustedError(responses.length);
      }
      index += 1;
      return {
        text: r.text,
        content: [...r.content],
        toolCalls: [...r.toolCalls],
        finishReason: r.finishReason,
        usage: { ...r.usage },
        ...(r.rawResponse !== undefined ? { rawResponse: r.rawResponse } : {}),
      };
    },
    async stream(): Promise<ReadableStream<ModelStreamPart>> {
      throw new Error(
        'createReplayLanguageModel does not implement stream(); use generate() or wrap with a stream adapter.',
      );
    },
  };
}
