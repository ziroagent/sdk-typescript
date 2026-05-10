import { type AgentRecordingStepLine, parseAgentRecordingJsonl } from '@ziro-agent/agent';
import { defineEval } from './run-eval.js';
import type { EvalCase, EvalSpec, RunContext } from './types.js';

/**
 * Assistant text from the **last** finished step in an agent recording (RFC 0015).
 * Use as `expected` for {@link exactMatch} or custom graders when replaying the same prompt.
 */
export function expectedAssistantTextFromRecording(
  lines: readonly AgentRecordingStepLine[],
): string {
  if (lines.length === 0) return '';
  const last = lines[lines.length - 1];
  return last ? last.step.text : '';
}

/**
 * Build a single {@link EvalCase} from JSONL produced by {@link runWithAgentRecording}.
 * You must pass the **same** `prompt` you used when recording (the trace does not store it).
 *
 * @param recordingJsonl — full JSONL text from `runWithAgentRecording` / `recordAgentRun`.
 * @param prompt — user prompt for that run (must match what was used during recording).
 */
export function createRecordingRegressionCase(
  recordingJsonl: string,
  prompt: string,
  options?: { id?: string; name?: string },
): EvalCase<{ prompt: string }, string> {
  const lines = parseAgentRecordingJsonl(recordingJsonl);
  const expected = expectedAssistantTextFromRecording(lines);
  return {
    id: options?.id ?? 'recording-regression',
    name: options?.name ?? 'Recording regression',
    input: { prompt },
    expected,
    metadata: {
      ziroRecordingSteps: lines.length,
      ziroRecording: true,
    },
  };
}

/**
 * Convenience {@link defineEval} wrapper: one case derived from a recording + prompt.
 * Expected output from the recording is always typed as **string** (last assistant text).
 */
export function defineRecordingRegressionEval<TOutput>(options: {
  name: string;
  recordingJsonl: string;
  prompt: string;
  run: (input: { prompt: string }, ctx: RunContext) => Promise<TOutput>;
  graders: EvalSpec<{ prompt: string }, TOutput, string>['graders'];
  gate?: EvalSpec<{ prompt: string }, TOutput, string>['gate'];
  description?: string;
}): EvalSpec<{ prompt: string }, TOutput, string> {
  const c = createRecordingRegressionCase(options.recordingJsonl, options.prompt, {
    id: `${options.name}-case`,
    name: `${options.name} (recording)`,
  });
  return defineEval({
    name: options.name,
    description: options.description,
    dataset: [c],
    run: options.run,
    graders: options.graders,
    gate: options.gate,
  });
}
