import type { LanguageModel, ModelGenerateResult } from '@ziro-agent/core';
import { createMockLanguageModel } from '@ziro-agent/core/testing';

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const DEFAULT_MOCK_JUDGE_RESPONSE = '{"score":1,"reason":"ok"}';

function mockGenerateResult(text: string): ModelGenerateResult {
  return {
    text,
    content: [{ type: 'text', text }],
    toolCalls: [],
    finishReason: 'stop',
    usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
  };
}

/**
 * Resolve a judge {@link LanguageModel} from declarative JSON (`judgeModel` on the dataset doc).
 *
 * v1 supports **`kind: "mock"`** only (deterministic CI). Live providers belong in TypeScript `defineEval`.
 */
export function resolveJsonJudgeModel(raw: unknown): LanguageModel {
  if (!isPlainObject(raw)) {
    throw new Error('Invalid JSON eval: judgeModel must be an object when using llmJudge');
  }
  const kind = raw.kind;
  if (kind === 'mock') {
    const response =
      typeof raw.response === 'string' && raw.response.length > 0
        ? raw.response
        : DEFAULT_MOCK_JUDGE_RESPONSE;
    return createMockLanguageModel({
      modelId: 'json-eval-judge-mock',
      provider: 'mock',
      generate: async () => mockGenerateResult(response),
    });
  }
  throw new Error(
    `Invalid JSON eval: unsupported judgeModel.kind "${String(kind)}" (v1 supports "mock" only)`,
  );
}
