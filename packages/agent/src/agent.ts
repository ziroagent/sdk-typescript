import {
  BudgetExceededError,
  type BudgetSpec,
  type ChatMessage,
  generateText,
  getCurrentBudget,
  type LanguageModel,
  type TextPart,
  type TokenUsage,
  type ToolCallPart,
  type ToolResultPart,
  withBudget,
} from '@ziro-agent/core';
import { executeToolCalls, type Tool, toolsToModelDefinitions } from '@ziro-agent/tools';
import type { StopWhen } from './stop-when.js';
import type {
  AgentBudgetExceededInfo,
  AgentFinishReason,
  AgentStep,
  StepEvent,
  StepEventListener,
} from './types.js';

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
  /**
   * Budget enforced across the entire run: every nested `generateText` and
   * `executeToolCalls` invocation participates in the same scope via
   * `AsyncLocalStorage`. See RFC 0001.
   *
   * `BudgetSpec.maxSteps` is honored here (it is intentionally ignored at
   * the `generateText` layer). If both `maxSteps` on `CreateAgentOptions`
   * and on `budget` are set, the tighter wins.
   */
  budget?: BudgetSpec;
  /**
   * Per-tool-call default budget. Composed (intersected) with each tool's
   * declared `defineTool({ budget })` and with the outer agent budget.
   * Most useful as a "safety net" against a single rogue tool burning the
   * whole agent budget.
   */
  toolBudget?: BudgetSpec;
}

export interface AgentRunResult {
  /** Final assistant text — concatenated from the last step. */
  text: string;
  /** Every step the agent took, in order. */
  steps: AgentStep[];
  /** Sum of token usage across every LLM call. */
  totalUsage: TokenUsage;
  /** Why the loop terminated. */
  finishReason: AgentFinishReason;
  /** Final conversation, including system, user, assistant, and tool messages. */
  messages: ChatMessage[];
  /**
   * Populated when the loop terminated via `onExceed: 'truncate'`. With the
   * default `'throw'` semantics, the run rejects with `BudgetExceededError`
   * instead and this field is never reached.
   */
  budgetExceeded?: AgentBudgetExceededInfo;
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
  const baseMaxSteps = options.maxSteps ?? 10;
  const toolDefs = Object.keys(tools).length > 0 ? toolsToModelDefinitions(tools) : undefined;

  return {
    tools,
    async run(runOptions: AgentRunOptions): Promise<AgentRunResult> {
      // The actual loop body — extracted so the surrounding `withBudget`
      // wrap is a single line and no logic lives outside the scope.
      const exec = async (): Promise<AgentRunResult> => runLoop(runOptions);

      if (!runOptions.budget) return await exec();
      try {
        return await withBudget(runOptions.budget, exec);
      } catch (err) {
        if (!(err instanceof BudgetExceededError)) throw err;
        const onExceed = runOptions.budget.onExceed;

        // Function-form `onExceed` (v0.1.6) — invoke the user's resolver with
        // a synthetic BudgetContext built from the error's partial usage. The
        // original ALS scope is gone (withBudget unwound on throw), but the
        // resolver only needs the spec + observed-so-far snapshot.
        if (typeof onExceed === 'function') {
          const ctx = {
            spec: runOptions.budget,
            used: err.partialUsage,
            remaining: computeRemaining(runOptions.budget, err.partialUsage),
            scopeId: err.scopeId,
          };
          let resolution: { handled: boolean; replacement?: unknown };
          try {
            resolution = await Promise.resolve(onExceed(ctx));
          } catch (resolverErr) {
            if (resolverErr instanceof Error) {
              (resolverErr as Error & { cause?: unknown }).cause = err;
            }
            throw resolverErr;
          }
          if (resolution.handled) return resolution.replacement as AgentRunResult;
          throw err;
        }

        if (onExceed === 'truncate') {
          // The loop already emitted any partial state via onEvent; rebuild
          // a result from the closure-captured progress that the loop
          // attached to the error before re-throwing.
          const partial = (err as BudgetExceededError & { __agentPartial?: AgentRunResult })
            .__agentPartial;
          if (partial) {
            return {
              ...partial,
              finishReason: 'budgetExceeded',
              budgetExceeded: toAgentBudgetInfo(err, 'preflight'),
            };
          }
          // Defensive fallback: error escaped before the loop attached
          // partial state. Surface a minimal truncation result instead of
          // re-throwing so `truncate` semantics are preserved.
          return {
            text: '',
            steps: [],
            totalUsage: {},
            messages: [],
            finishReason: 'budgetExceeded',
            budgetExceeded: toAgentBudgetInfo(err, 'preflight'),
          };
        }
        throw err;
      }

      // Local: the loop. Closes over `tools`, `toolDefs`, `options`,
      // `baseMaxSteps`, etc. so the outer wrap stays tiny.
      async function runLoop(ro: AgentRunOptions): Promise<AgentRunResult> {
        const messages: ChatMessage[] = [];
        if (options.system) messages.push({ role: 'system', content: options.system });

        if (ro.messages?.length) {
          messages.push(...ro.messages);
        } else if (ro.prompt) {
          messages.push({ role: 'user', content: ro.prompt });
        } else {
          throw new Error('createAgent.run requires either `prompt` or `messages`.');
        }

        const steps: AgentStep[] = [];
        const totalUsage: TokenUsage = {};
        let finishReason: AgentFinishReason = 'completed';
        let budgetInfo: AgentBudgetExceededInfo | undefined;

        // Effective step cap = min(CreateAgent.maxSteps, BudgetSpec.maxSteps).
        const stepCap =
          ro.budget?.maxSteps !== undefined
            ? Math.min(baseMaxSteps, ro.budget.maxSteps)
            : baseMaxSteps;

        const emit = async (event: StepEvent) => {
          if (ro.onEvent) await ro.onEvent(event);
        };

        // Snapshot of progress, kept so the `truncate` catch above can
        // rebuild an `AgentRunResult` from a `BudgetExceededError`.
        const snapshot = (): AgentRunResult => ({
          text: steps[steps.length - 1]?.text ?? '',
          steps,
          totalUsage,
          finishReason,
          messages,
        });

        const truncate = ro.budget?.onExceed === 'truncate';
        const handleBudgetThrow = async (
          err: BudgetExceededError,
          origin: AgentBudgetExceededInfo['origin'],
        ): Promise<never | undefined> => {
          const info = toAgentBudgetInfo(err, origin);
          await emit({ type: 'budget-exceeded', info });
          if (truncate) {
            budgetInfo = info;
            finishReason = 'budgetExceeded';
            return undefined;
          }
          // Stash the partial result on the error so the outer catch can
          // surface it for `truncate` (we're in `throw` mode here, but the
          // attachment is harmless and keeps the code path uniform).
          (err as BudgetExceededError & { __agentPartial?: AgentRunResult }).__agentPartial =
            snapshot();
          throw err;
        };

        for (let i = 0; i < stepCap; i++) {
          if (ro.abortSignal?.aborted) {
            finishReason = 'aborted';
            break;
          }

          const stepIndex = i + 1;
          await emit({ type: 'step-start', index: stepIndex });

          let llmResult: Awaited<ReturnType<typeof generateText>>;
          try {
            llmResult = await generateText({
              model: options.model,
              messages,
              ...(toolDefs ? { tools: toolDefs } : {}),
              ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
              ...(ro.abortSignal ? { abortSignal: ro.abortSignal } : {}),
            });
          } catch (err) {
            if (err instanceof BudgetExceededError) {
              await handleBudgetThrow(err, 'preflight');
              break;
            }
            throw err;
          }

          addUsageInPlace(totalUsage, llmResult.usage);

          await emit({
            type: 'llm-finish',
            index: stepIndex,
            text: llmResult.text,
            toolCalls: llmResult.toolCalls,
          });

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
              ...(ro.abortSignal ? { abortSignal: ro.abortSignal } : {}),
              ...(ro.toolBudget ? { toolBudget: ro.toolBudget } : {}),
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

          // Synthesize a BudgetExceededError if any tool tripped its budget,
          // so behaviour is identical whether the throw originates inside an
          // LLM call or inside a tool. We promote only the FIRST such
          // result; the rest stay on the step for the user to inspect.
          const toolBudgetHit = toolResults.find((r) => r.budgetExceeded);
          if (toolBudgetHit?.budgetExceeded) {
            const synthErr = new BudgetExceededError({
              kind: toolBudgetHit.budgetExceeded.kind,
              limit: toolBudgetHit.budgetExceeded.limit,
              observed: toolBudgetHit.budgetExceeded.observed,
              scopeId: toolBudgetHit.budgetExceeded.scopeId,
              partialUsage: getCurrentBudget()?.used ?? {
                usd: 0,
                tokens: 0,
                llmCalls: 0,
                steps: steps.length,
                durationMs: 0,
              },
              preflight: false,
            });
            await handleBudgetThrow(synthErr, 'tool');
            break;
          }

          if (llmResult.toolCalls.length === 0) {
            finishReason = 'completed';
            break;
          }

          if (options.stopWhen && (await options.stopWhen({ steps, totalUsage }))) {
            finishReason = 'stopWhen';
            break;
          }

          if (i === stepCap - 1) {
            finishReason = 'maxSteps';
            break;
          }
        }

        await emit({ type: 'agent-finish', reason: finishReason });

        const last = steps[steps.length - 1];
        return {
          text: last?.text ?? '',
          steps,
          totalUsage,
          finishReason,
          messages,
          ...(budgetInfo ? { budgetExceeded: budgetInfo } : {}),
        };
      }
    },
  };
}

function toAgentBudgetInfo(
  err: BudgetExceededError,
  origin: AgentBudgetExceededInfo['origin'],
): AgentBudgetExceededInfo {
  return {
    kind: err.kind,
    limit: err.limit,
    observed: err.observed,
    scopeId: err.scopeId,
    partialUsage: err.partialUsage,
    origin,
  };
}

/**
 * Build a `BudgetContext.remaining` snapshot from the spec + observed usage.
 * Mirrors the math in `core/src/budget/scope.ts#toContext` so user-visible
 * resolver context shape stays consistent across layers.
 */
function computeRemaining(
  spec: BudgetSpec,
  used: { usd: number; tokens: number; llmCalls: number; durationMs: number },
): { usd?: number; tokens?: number; llmCalls?: number; durationMs?: number } {
  const out: { usd?: number; tokens?: number; llmCalls?: number; durationMs?: number } = {};
  if (spec.maxUsd !== undefined) out.usd = Math.max(0, spec.maxUsd - used.usd);
  if (spec.maxTokens !== undefined) out.tokens = Math.max(0, spec.maxTokens - used.tokens);
  if (spec.maxLlmCalls !== undefined) out.llmCalls = Math.max(0, spec.maxLlmCalls - used.llmCalls);
  if (spec.maxDurationMs !== undefined) {
    out.durationMs = Math.max(0, spec.maxDurationMs - used.durationMs);
  }
  return out;
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
