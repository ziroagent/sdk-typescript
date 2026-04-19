import {
  type ChatMessage,
  generateText,
  type LanguageModel,
  type TextPart,
  type TokenUsage,
  type ToolCallPart,
  type ToolResultPart,
} from '@ziro-agent/core';
import { executeToolCalls, type Tool, toolsToModelDefinitions } from '@ziro-agent/tools';
import type { StopWhen } from './stop-when.js';
import type { AgentStep, StepEvent, StepEventListener } from './types.js';

export interface CreateAgentOptions {
  model: LanguageModel;
  tools?: Record<string, Tool>;
  /** System message passed to the model on every step. */
  system?: string;
  /** Hard cap on iterations. Default 10. */
  maxSteps?: number;
  /**
   * Predicate evaluated after every step; return true to stop early.
   * Combine with `stepCountIs`, `totalTokensExceeds`, etc.
   */
  stopWhen?: StopWhen;
  /** Default temperature for every step. */
  temperature?: number;
  /** Per-step LLM call timeout. Set 0 / undefined to disable. */
  timeoutMs?: number;
}

export interface AgentRunOptions {
  /** Either a single user prompt or a full message list. */
  prompt?: string;
  messages?: ChatMessage[];
  abortSignal?: AbortSignal;
  /** Subscribe to fine-grained step events while the agent runs. */
  onEvent?: StepEventListener;
}

export interface AgentRunResult {
  /** Final assistant text — concatenated from the last step. */
  text: string;
  /** Every step the agent took, in order. */
  steps: AgentStep[];
  /** Sum of token usage across every LLM call. */
  totalUsage: TokenUsage;
  /** Why the loop terminated. */
  finishReason: 'completed' | 'stopWhen' | 'maxSteps' | 'aborted';
  /** Final conversation, including system, user, assistant, and tool messages. */
  messages: ChatMessage[];
}

export interface Agent {
  readonly tools: Record<string, Tool>;
  run(options: AgentRunOptions): Promise<AgentRunResult>;
}

/**
 * Create a tool-using agent. Internally runs a `generateText → executeToolCalls`
 * loop, threading messages back to the model until either:
 *   - the model returns no tool calls (natural completion)
 *   - `stopWhen` returns true
 *   - `maxSteps` is reached
 *   - `abortSignal` fires
 */
export function createAgent(options: CreateAgentOptions): Agent {
  const tools = options.tools ?? {};
  const maxSteps = options.maxSteps ?? 10;
  const toolDefs = Object.keys(tools).length > 0 ? toolsToModelDefinitions(tools) : undefined;

  return {
    tools,
    async run(runOptions: AgentRunOptions): Promise<AgentRunResult> {
      const messages: ChatMessage[] = [];
      if (options.system) messages.push({ role: 'system', content: options.system });

      if (runOptions.messages?.length) {
        messages.push(...runOptions.messages);
      } else if (runOptions.prompt) {
        messages.push({ role: 'user', content: runOptions.prompt });
      } else {
        throw new Error('createAgent.run requires either `prompt` or `messages`.');
      }

      const steps: AgentStep[] = [];
      const totalUsage: TokenUsage = {};
      let finishReason: AgentRunResult['finishReason'] = 'completed';

      const emit = async (event: StepEvent) => {
        if (runOptions.onEvent) await runOptions.onEvent(event);
      };

      for (let i = 0; i < maxSteps; i++) {
        if (runOptions.abortSignal?.aborted) {
          finishReason = 'aborted';
          break;
        }

        const stepIndex = i + 1;
        await emit({ type: 'step-start', index: stepIndex });

        const llmResult = await generateText({
          model: options.model,
          messages,
          ...(toolDefs ? { tools: toolDefs } : {}),
          ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
          ...(runOptions.abortSignal ? { abortSignal: runOptions.abortSignal } : {}),
        });

        addUsageInPlace(totalUsage, llmResult.usage);

        await emit({
          type: 'llm-finish',
          index: stepIndex,
          text: llmResult.text,
          toolCalls: llmResult.toolCalls,
        });

        // Append the assistant turn to the conversation regardless of whether
        // there are tool calls, so the model sees its own previous responses.
        if (llmResult.toolCalls.length > 0) {
          const assistantContent = llmResult.content.filter(
            (p): p is TextPart | ToolCallPart => p.type === 'text' || p.type === 'tool-call',
          );
          messages.push({ role: 'assistant', content: assistantContent });
        } else {
          messages.push({ role: 'assistant', content: llmResult.text });
        }

        let toolResults: Awaited<ReturnType<typeof executeToolCalls>> = [];
        if (llmResult.toolCalls.length > 0) {
          toolResults = await executeToolCalls({
            tools,
            toolCalls: llmResult.toolCalls,
            ...(runOptions.abortSignal ? { abortSignal: runOptions.abortSignal } : {}),
          });

          for (const r of toolResults) {
            await emit({ type: 'tool-result', index: stepIndex, result: r });
          }

          const toolContent: ToolResultPart[] = toolResults.map((r) => ({
            type: 'tool-result',
            toolCallId: r.toolCallId,
            toolName: r.toolName,
            result: r.result,
            ...(r.isError ? { isError: true } : {}),
          }));
          messages.push({ role: 'tool', content: toolContent });
        }

        const step: AgentStep = {
          index: stepIndex,
          text: llmResult.text,
          content: llmResult.content,
          toolCalls: llmResult.toolCalls,
          toolResults,
          finishReason: llmResult.finishReason,
          usage: llmResult.usage,
        };
        steps.push(step);
        await emit({ type: 'step-finish', step });

        if (llmResult.toolCalls.length === 0) {
          finishReason = 'completed';
          break;
        }

        if (options.stopWhen && (await options.stopWhen({ steps, totalUsage }))) {
          finishReason = 'stopWhen';
          break;
        }

        if (i === maxSteps - 1) {
          finishReason = 'maxSteps';
          break;
        }
      }

      const lastStep = steps[steps.length - 1];
      await emit({ type: 'agent-finish', reason: finishReason });

      return {
        text: lastStep?.text ?? '',
        steps,
        totalUsage,
        finishReason,
        messages,
      };
    },
  };
}

function addUsageInPlace(target: TokenUsage, add: TokenUsage): void {
  const sum = (a?: number, b?: number) =>
    a === undefined && b === undefined ? undefined : (a ?? 0) + (b ?? 0);
  target.promptTokens = sum(target.promptTokens, add.promptTokens);
  target.completionTokens = sum(target.completionTokens, add.completionTokens);
  target.totalTokens = sum(target.totalTokens, add.totalTokens);
  target.cachedPromptTokens = sum(target.cachedPromptTokens, add.cachedPromptTokens);
  target.reasoningTokens = sum(target.reasoningTokens, add.reasoningTokens);
}
