import type { LanguageModel, ModelGenerateResult } from '@ziro-agent/core';
import { createReplayLanguageModel } from '@ziro-agent/core/testing';
import { defineTool, type Tool, type ToolExecutionResult } from '@ziro-agent/tools';
import { z } from 'zod';
import {
  type Agent,
  type AgentRunOptions,
  type AgentRunResult,
  type CreateAgentOptions,
  createAgent,
} from './agent.js';
import type { AgentStep } from './types.js';

export const AGENT_RECORDING_VERSION = 1 as const;

type SerializedToolResult = Pick<
  ToolExecutionResult,
  'toolCallId' | 'toolName' | 'result' | 'isError'
> & {
  parsedArgs?: unknown;
  budgetExceeded?: ToolExecutionResult['budgetExceeded'];
};

/**
 * One JSON line emitted by {@link runWithAgentRecording} per finished agent
 * step (after tools ran for that step).
 */
export interface AgentRecordingStepLine {
  v: typeof AGENT_RECORDING_VERSION;
  kind: 'step';
  step: {
    index: number;
    text: string;
    content: ModelGenerateResult['content'];
    toolCalls: ModelGenerateResult['toolCalls'];
    toolResults: SerializedToolResult[];
    finishReason: ModelGenerateResult['finishReason'];
    usage: ModelGenerateResult['usage'];
  };
}

/** Thrown when replayed tool calls diverge from the recorded trace. */
export class ReplayMismatchError extends Error {
  override readonly name = 'ReplayMismatchError';
}

function jsonSafeClone(value: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(value, jsonReplacer)) as unknown;
  } catch {
    return String(value);
  }
}

function jsonReplacer(_key: string, val: unknown): unknown {
  if (val instanceof Error) return { name: val.name, message: val.message };
  return val;
}

function serializeToolResult(tr: ToolExecutionResult): SerializedToolResult {
  const base: SerializedToolResult = {
    toolCallId: tr.toolCallId,
    toolName: tr.toolName,
    result: jsonSafeClone(tr.result),
    isError: tr.isError,
  };
  if (tr.parsedArgs !== undefined) base.parsedArgs = jsonSafeClone(tr.parsedArgs);
  if (tr.budgetExceeded) base.budgetExceeded = { ...tr.budgetExceeded };
  return base;
}

function serializeAgentStepLine(step: AgentStep): AgentRecordingStepLine {
  return {
    v: AGENT_RECORDING_VERSION,
    kind: 'step',
    step: {
      index: step.index,
      text: step.text,
      content: step.content,
      toolCalls: step.toolCalls,
      toolResults: step.toolResults.map(serializeToolResult),
      finishReason: step.finishReason,
      usage: step.usage,
    },
  };
}

/**
 * Run an agent while appending one JSON line per completed step (RFC 0015).
 * Skips HITL suspension paths — only steps that fully finish are recorded.
 */
export async function runWithAgentRecording(
  agent: Agent,
  options: AgentRunOptions & {
    recording: { writeLine: (line: string) => void | Promise<void> };
  },
): Promise<AgentRunResult> {
  const { recording, onEvent, ...rest } = options;
  return agent.run({
    ...rest,
    onEvent: async (ev) => {
      if (onEvent) await onEvent(ev);
      if (ev.type === 'step-finish') {
        const line = JSON.stringify(serializeAgentStepLine(ev.step));
        await Promise.resolve(recording.writeLine(`${line}\n`));
      }
    },
  });
}

/** RFC 0015 name — same as {@link runWithAgentRecording}. */
export const recordAgentRun = runWithAgentRecording;

/**
 * Parse JSONL produced by {@link runWithAgentRecording}.
 */
export function parseAgentRecordingJsonl(text: string): AgentRecordingStepLine[] {
  const out: AgentRecordingStepLine[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const o = JSON.parse(line) as AgentRecordingStepLine;
    if (o.v !== AGENT_RECORDING_VERSION || o.kind !== 'step') {
      throw new Error(`Unsupported agent recording line: ${line.slice(0, 120)}`);
    }
    out.push(o);
  }
  return out;
}

/**
 * Build a {@link LanguageModel} that reproduces recorded LLM steps in order.
 */
export function createReplayModelFromAgentRecording(
  lines: readonly AgentRecordingStepLine[],
  options?: { modelId?: string },
): LanguageModel {
  const responses: ModelGenerateResult[] = lines.map((l) => ({
    text: l.step.text,
    content: [...l.step.content],
    toolCalls: [...l.step.toolCalls],
    finishReason: l.step.finishReason,
    usage: { ...l.step.usage },
  }));
  return createReplayLanguageModel(responses, options);
}

/**
 * Build deterministic tool stubs keyed by tool name so {@link createAgent}
 * can replay a trace without calling real side effects.
 */
export function createReplayToolsFromAgentRecording(
  lines: readonly AgentRecordingStepLine[],
): Record<string, Tool> {
  const byCallId = new Map<string, SerializedToolResult>();
  for (const l of lines) {
    for (const tr of l.step.toolResults) {
      byCallId.set(tr.toolCallId, tr);
    }
  }

  const names = new Set<string>();
  for (const l of lines) {
    for (const tc of l.step.toolCalls) {
      names.add(tc.toolName);
    }
  }

  const tools: Record<string, Tool> = {};
  for (const name of names) {
    tools[name] = defineTool({
      name,
      description: 'Deterministic replay stub.',
      input: z.unknown(),
      mutates: false,
      requiresApproval: false,
      execute: async (_input, ctx) => {
        const rec = byCallId.get(ctx.toolCallId);
        if (!rec || rec.toolName !== name) {
          throw new ReplayMismatchError(
            `No recorded tool result for toolCallId="${ctx.toolCallId}" toolName="${name}".`,
          );
        }
        if (rec.isError) {
          const r = rec.result as { message?: string; name?: string };
          const err = new Error(r?.message ?? 'Recorded tool error');
          if (r?.name) err.name = r.name;
          throw err;
        }
        return rec.result;
      },
    });
  }
  return tools;
}

/** Options for {@link replayAgentFromRecording} — `model` / `tools` default to replay stubs. */
export type ReplayAgentFromRecordingAgentOptions = Omit<CreateAgentOptions, 'model' | 'tools'> &
  Partial<Pick<CreateAgentOptions, 'model' | 'tools'>>;

/** {@link createReplayRunBundleFromRecording} return shape (RFC 0015). */
export interface ReplayRunBundle {
  readonly agent: Agent;
  run(runOptions: AgentRunOptions): Promise<AgentRunResult>;
}

/**
 * One-call replay: {@link createReplayModelFromAgentRecording} +
 * {@link createReplayToolsFromAgentRecording} + {@link createAgent} + {@link Agent.run}.
 */
export async function replayAgentFromRecording(
  lines: readonly AgentRecordingStepLine[],
  agentOptions: ReplayAgentFromRecordingAgentOptions,
  runOptions: AgentRunOptions,
): Promise<AgentRunResult> {
  const model = agentOptions.model ?? createReplayModelFromAgentRecording(lines);
  const tools = agentOptions.tools ?? createReplayToolsFromAgentRecording(lines);
  const agent = createAgent({ ...agentOptions, model, tools });
  return agent.run(runOptions);
}

/** Parse JSONL then {@link replayAgentFromRecording}. */
export async function replayAgentFromRecordingJsonl(
  jsonl: string,
  agentOptions: ReplayAgentFromRecordingAgentOptions,
  runOptions: AgentRunOptions,
): Promise<AgentRunResult> {
  return replayAgentFromRecording(parseAgentRecordingJsonl(jsonl), agentOptions, runOptions);
}

/**
 * Build a replay {@link Agent} without running — pair with {@link Agent.run} /
 * {@link Agent.resumeFromCheckpoint} as needed (RFC 0015 convenience).
 */
export function createReplayAgentFromRecording(
  lines: readonly AgentRecordingStepLine[],
  agentOptions: ReplayAgentFromRecordingAgentOptions,
): Agent {
  const model = agentOptions.model ?? createReplayModelFromAgentRecording(lines);
  const tools = agentOptions.tools ?? createReplayToolsFromAgentRecording(lines);
  return createAgent({ ...agentOptions, model, tools });
}

/**
 * Returns `{ agent, run }` where `run` delegates to {@link Agent.run} on the
 * replay-configured agent (RFC 0015 `replayRun`-style bundle).
 */
export function createReplayRunBundleFromRecording(
  lines: readonly AgentRecordingStepLine[],
  agentOptions: ReplayAgentFromRecordingAgentOptions,
): ReplayRunBundle {
  const agent = createReplayAgentFromRecording(lines, agentOptions);
  return {
    agent,
    run: (runOptions) => agent.run(runOptions),
  };
}
