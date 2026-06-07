import { describe, expect, it } from 'vitest';
import { exactMatch } from './graders/exact-match.js';
import {
  createRecordingRegressionCase,
  defineRecordingRegressionEval,
  expectedAssistantTextFromRecording,
} from './recording-regression.js';
import { runEval } from './run-eval.js';

describe('recording regression helpers', () => {
  it('extracts expected text from last step', () => {
    const jsonl = [
      '{"v":1,"kind":"step","step":{"index":0,"text":"first","content":[],"toolCalls":[],"toolResults":[],"finishReason":"stop","usage":{"totalTokens":1}}}',
      '{"v":1,"kind":"step","step":{"index":1,"text":"final answer","content":[],"toolCalls":[],"toolResults":[],"finishReason":"stop","usage":{"totalTokens":2}}}',
    ].join('\n');

    const c = createRecordingRegressionCase(jsonl, 'user question', {
      id: 't1',
    });
    expect(c.input).toEqual({ prompt: 'user question' });
    expect(c.expected).toBe('final answer');
    expect(c.metadata?.ziroRecordingSteps).toBe(2);
  });

  it('defineRecordingRegressionEval + runEval passes exactMatch when output matches', async () => {
    const jsonl =
      '{"v":1,"kind":"step","step":{"index":0,"text":"done","content":[],"toolCalls":[],"toolResults":[],"finishReason":"stop","usage":{"totalTokens":1}}}';
    const spec = defineRecordingRegressionEval({
      name: 'recording-regression-smoke',
      recordingJsonl: jsonl,
      prompt: 'ignored-by-run',
      run: async () => 'done',
      graders: [exactMatch()],
    });
    const r = await runEval(spec);
    expect(r.gate.passed).toBe(true);
    expect(r.cases[0]?.passed).toBe(true);
  });

  it('handles empty recording JSONL', () => {
    const c = createRecordingRegressionCase('', 'q', { id: 'empty' });
    expect(c.expected).toBe('');
    expect(c.metadata?.ziroRecordingSteps).toBe(0);
  });

  it('single-step recording yields that step text', () => {
    const jsonl =
      '{"v":1,"kind":"step","step":{"index":0,"text":"only","content":[],"toolCalls":[],"toolResults":[],"finishReason":"stop","usage":{"totalTokens":1}}}';
    expect(createRecordingRegressionCase(jsonl, 'q').expected).toBe('only');
  });

  it('uses last step text even when earlier step had longer text', () => {
    const jsonl = [
      '{"v":1,"kind":"step","step":{"index":0,"text":"longer first answer","content":[],"toolCalls":[],"toolResults":[],"finishReason":"stop","usage":{"totalTokens":1}}}',
      '{"v":1,"kind":"step","step":{"index":1,"text":"ok","content":[],"toolCalls":[],"toolResults":[],"finishReason":"stop","usage":{"totalTokens":2}}}',
    ].join('\n');
    expect(createRecordingRegressionCase(jsonl, 'q').expected).toBe('ok');
  });

  it('last step with empty assistant text yields empty expected', () => {
    const jsonl = [
      '{"v":1,"kind":"step","step":{"index":0,"text":"visible","content":[],"toolCalls":[],"toolResults":[],"finishReason":"stop","usage":{"totalTokens":1}}}',
      '{"v":1,"kind":"step","step":{"index":1,"text":"","content":[],"toolCalls":[],"toolResults":[],"finishReason":"stop","usage":{"totalTokens":2}}}',
    ].join('\n');
    expect(createRecordingRegressionCase(jsonl, 'q').expected).toBe('');
    expect(createRecordingRegressionCase(jsonl, 'q').metadata?.ziroRecordingSteps).toBe(2);
  });

  it('fails gate when replay output diverges from recording', async () => {
    const jsonl =
      '{"v":1,"kind":"step","step":{"index":0,"text":"canonical","content":[],"toolCalls":[],"toolResults":[],"finishReason":"stop","usage":{"totalTokens":1}}}';
    const spec = defineRecordingRegressionEval({
      name: 'recording-regression-fail',
      recordingJsonl: jsonl,
      prompt: 'p',
      run: async () => 'different',
      graders: [exactMatch()],
      gate: { kind: 'meanScore', min: 1 },
    });
    const r = await runEval(spec);
    expect(r.gate.passed).toBe(false);
  });

  it('expectedAssistantTextFromRecording is consistent', () => {
    const lines = [
      {
        v: 1 as const,
        kind: 'step' as const,
        step: {
          index: 0,
          text: 'a',
          content: [],
          toolCalls: [],
          toolResults: [],
          finishReason: 'stop' as const,
          usage: { totalTokens: 1 },
        },
      },
    ];
    expect(expectedAssistantTextFromRecording(lines)).toBe('a');
  });
});
