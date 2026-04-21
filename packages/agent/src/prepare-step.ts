import type { ChatMessage, LanguageModel } from '@ziro-agent/core';
import { type Tool, toolsToModelDefinitions } from '@ziro-agent/tools';

/**
 * Context for {@link PrepareStep} — invoked before each `generateText` in the
 * agent loop (RFC 0004 / Vercel `prepareStep` pattern).
 */
export interface PrepareStepContext {
  /** 1-based step index (matches `step-start` / `AgentStep.index`). */
  stepIndex: number;
  /**
   * Messages passed to the model this iteration (after memory transforms).
   * Treat as read-only; the hook receives a fresh structured clone.
   */
  messages: ChatMessage[];
}

/**
 * Optional return value from {@link PrepareStep}. All fields are independent:
 * omit a field to leave the agent default for that axis.
 */
export interface PrepareStepResult {
  /** Use this model for the current `generateText` call only. */
  model?: LanguageModel;
  /**
   * Replace the first `role: 'system'` message for this call only, or
   * prepend one if the list has no system message.
   */
  system?: string;
  /**
   * Restrict which tools are sent to the model this step. **Empty array**
   * removes all tools for this step. **Omit** to keep the full agent tool map.
   */
  activeTools?: string[];
}

/**
 * Per-step hook on `createAgent` / `agent.run` / `agent.resume`.
 */
export type PrepareStep = (
  ctx: PrepareStepContext,
) => PrepareStepResult | undefined | Promise<PrepareStepResult | undefined>;

/**
 * Applies {@link PrepareStep} for one agent iteration. Always clones
 * `baseMessages` so the hook cannot mutate the live conversation array.
 */
export async function resolvePrepareForStep(
  prepare: PrepareStep | undefined,
  stepIndex: number,
  baseMessages: ChatMessage[],
  defaultModel: LanguageModel,
  allTools: Record<string, Tool>,
): Promise<{
  messages: ChatMessage[];
  model: LanguageModel;
  toolsForStep: Record<string, Tool>;
  toolDefs: ReturnType<typeof toolsToModelDefinitions> | undefined;
}> {
  let messages = structuredClone(baseMessages);
  let model = defaultModel;
  let toolsForStep: Record<string, Tool> = allTools;
  if (prepare) {
    const out = await prepare({ stepIndex, messages });
    if (out && typeof out === 'object') {
      if (out.model !== undefined) model = out.model;
      if (out.system !== undefined) {
        const sys = out.system;
        const si = messages.findIndex((m) => m.role === 'system');
        if (si >= 0) {
          messages = messages.map((m, i) =>
            i === si ? { role: 'system' as const, content: sys } : m,
          );
        } else {
          messages = [{ role: 'system' as const, content: sys }, ...messages];
        }
      }
      if (out.activeTools !== undefined) {
        const entries: [string, Tool][] = [];
        for (const name of out.activeTools) {
          const t = allTools[name];
          if (t) entries.push([name, t]);
        }
        toolsForStep = Object.fromEntries(entries);
      }
    }
  }
  const toolDefs =
    Object.keys(toolsForStep).length > 0 ? toolsToModelDefinitions(toolsForStep) : undefined;
  return { messages, model, toolsForStep, toolDefs };
}
