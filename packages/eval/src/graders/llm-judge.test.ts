import type {
  CostEstimate,
  LanguageModel,
  ModelCallOptions,
  ModelGenerateResult,
} from '@ziro-agent/core';
import { describe, expect, it } from 'vitest';
import type { GraderContext } from '../types.js';
import { llmJudge } from './llm-judge.js';

function fakeModel(reply: string): LanguageModel {
  return {
    modelId: 'fake',
    provider: 'fake',
    async generate(_o: ModelCallOptions): Promise<ModelGenerateResult> {
      return {
        text: reply,
        content: [{ type: 'text', text: reply }],
        toolCalls: [],
        finishReason: 'stop',
        usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
      };
    },
    async stream() {
      throw new Error('not implemented');
    },
    estimateCost: (): CostEstimate => ({
      minUsd: 0,
      maxUsd: 0,
      minTokens: 10,
      maxTokens: 20,
      pricingAvailable: false,
    }),
  };
}

const ctx = (expected?: unknown): GraderContext => {
  const c: GraderContext = { case: { input: 'q', expected }, durationMs: 0 };
  return c;
};

describe('llmJudge grader', () => {
  it('parses {score, reason} JSON from the judge', async () => {
    const grader = llmJudge({
      model: fakeModel('{"score": 0.85, "reason": "mostly correct"}'),
      rubric: 'Is the answer correct?',
    });
    const r = await grader.grade('q', 'a', ctx('a'));
    expect(r.score).toBeCloseTo(0.85);
    expect(r.passed).toBe(true);
    expect(r.reason).toBe('mostly correct');
    expect(r.details?.judgeScore).toBeCloseTo(0.85);
  });

  it('strips ```json fences before parsing', async () => {
    const grader = llmJudge({
      model: fakeModel('```json\n{"score": 1, "reason": "ok"}\n```'),
      rubric: '',
    });
    const r = await grader.grade(null, null, ctx());
    expect(r.passed).toBe(true);
  });

  it('extracts JSON even when wrapped by chat prose', async () => {
    const grader = llmJudge({
      model: fakeModel(
        'Sure, here is my judgement: {"score": 0.4, "reason": "weak"} hope this helps',
      ),
      rubric: '',
    });
    const r = await grader.grade(null, null, ctx());
    expect(r.score).toBeCloseTo(0.4);
    expect(r.passed).toBe(false);
  });

  it('returns score=0 when the judge response is unparseable', async () => {
    const grader = llmJudge({
      model: fakeModel('I refuse to grade this output.'),
      rubric: '',
    });
    const r = await grader.grade(null, null, ctx());
    expect(r.score).toBe(0);
    expect(r.passed).toBe(false);
    expect(r.reason).toMatch(/parsed/);
  });

  it('clamps out-of-range scores to [0,1]', async () => {
    const high = await llmJudge({ model: fakeModel('{"score": 7.5}'), rubric: '' }).grade(
      null,
      null,
      ctx(),
    );
    expect(high.score).toBe(1);
    const low = await llmJudge({ model: fakeModel('{"score": -3}'), rubric: '' }).grade(
      null,
      null,
      ctx(),
    );
    expect(low.score).toBe(0);
  });

  it('rubric can be a function over the case', async () => {
    let seen: string | undefined;
    const grader = llmJudge<string, string, string>({
      model: {
        modelId: 'spy',
        provider: 'spy',
        async generate(o) {
          // Capture the user prompt so we can verify the dynamic rubric was used.
          const last = o.messages.at(-1);
          if (last && Array.isArray(last.content)) {
            seen = last.content.map((p) => (p.type === 'text' ? p.text : '')).join('');
          } else if (last && typeof last.content === 'string') {
            seen = last.content;
          }
          return {
            text: '{"score": 1, "reason": "ok"}',
            content: [{ type: 'text', text: '{"score":1}' }],
            toolCalls: [],
            finishReason: 'stop',
            usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
          };
        },
        async stream() {
          throw new Error('na');
        },
      },
      rubric: (input, output, expected) =>
        `Compare ${input} vs ${expected ?? '?'} given output ${output}`,
    });
    await grader.grade('hello', 'world', ctx('foo'));
    expect(seen).toContain('Compare hello vs foo given output world');
  });
});
