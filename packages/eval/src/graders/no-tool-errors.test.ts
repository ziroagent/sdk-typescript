import { describe, expect, it } from 'vitest';
import type { GraderContext } from '../types.js';
import { noToolErrors } from './no-tool-errors.js';

const ctx = (): GraderContext => ({ case: { input: null }, durationMs: 0 }) as GraderContext;

describe('noToolErrors grader', () => {
  it('passes (and is a no-op) when output is not an AgentRunResult', async () => {
    const r = await noToolErrors().grade(null, 'just a string', ctx());
    expect(r.passed).toBe(true);
    expect(r.reason).toMatch(/not an AgentRunResult/);
  });

  it('passes when no tool errors are present', async () => {
    const out = {
      steps: [
        { toolResults: [{ toolName: 't1', isError: false, result: 'ok' }] },
        { toolResults: [{ toolName: 't2', isError: false, result: 'ok' }] },
      ],
    };
    const r = await noToolErrors().grade(null, out, ctx());
    expect(r.passed).toBe(true);
  });

  it('fails when any tool result is an error', async () => {
    const out = {
      steps: [
        {
          toolResults: [{ toolName: 'send_email', isError: true, result: new Error('SMTP down') }],
        },
      ],
    };
    const r = await noToolErrors().grade(null, out, ctx());
    expect(r.passed).toBe(false);
    expect(r.reason).toMatch(/send_email/);
  });
});
