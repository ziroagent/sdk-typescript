import type { AgentRunResult } from '@ziro-agent/agent';
import type { Grader, GraderResult } from '../types.js';

/**
 * Inspects an `AgentRunResult` (the natural output type when the eval's
 * `run` is just `await agent.run(...)`) and fails when any step contains
 * a tool execution that errored. Tolerant of non-AgentRunResult outputs:
 * it returns a `passed: true, contributes: false`-style result with a
 * note when the output isn't an `AgentRunResult`, so it composes safely
 * with mixed graders.
 */
export function noToolErrors(): Grader<unknown, unknown, unknown> {
  return {
    name: 'noToolErrors',
    grade(_input, output): GraderResult {
      if (!isAgentRunResult(output)) {
        return {
          score: 1,
          passed: true,
          reason: 'output is not an AgentRunResult — skipped',
        };
      }
      const erroredCalls: Array<{ step: number; toolName: string; message?: string }> = [];
      for (let i = 0; i < output.steps.length; i++) {
        const step = output.steps[i];
        if (!step) continue;
        for (const call of step.toolResults ?? []) {
          if (call.isError === true) {
            const detail: { step: number; toolName: string; message?: string } = {
              step: i,
              toolName: call.toolName,
            };
            const message = extractMessage(call.result);
            if (message !== undefined) detail.message = message;
            erroredCalls.push(detail);
          }
        }
      }
      const passed = erroredCalls.length === 0;
      return {
        score: passed ? 1 : 0,
        passed,
        reason: passed
          ? 'no tool errors'
          : `${erroredCalls.length} tool error(s): ${erroredCalls
              .map((e) => `${e.toolName}@step${e.step}`)
              .join(', ')}`,
        details: { erroredCalls },
      };
    },
  };
}

interface ToolResultLike {
  toolName: string;
  isError?: boolean;
  result?: unknown;
}

function extractMessage(v: unknown): string | undefined {
  if (typeof v === 'string') return v;
  if (v instanceof Error) return v.message;
  if (typeof v === 'object' && v !== null && 'message' in v) {
    const m = (v as { message: unknown }).message;
    if (typeof m === 'string') return m;
  }
  return undefined;
}

interface AgentStepLike {
  toolResults?: ToolResultLike[];
}

interface AgentRunResultLike {
  steps: AgentStepLike[];
}

function isAgentRunResult(v: unknown): v is AgentRunResult & AgentRunResultLike {
  return typeof v === 'object' && v !== null && Array.isArray((v as { steps?: unknown }).steps);
}
