import { checkMidStream } from '../budget/enforce.js';
import { BudgetExceededError } from '../budget/errors.js';
import type { BudgetScope } from '../budget/scope.js';
import type { ModelPricing } from '../pricing/data.js';
import type { LanguageModel, ModelStreamPart } from '../types/model.js';
import { estimateTokensFromString } from '../util/estimate-tokens.js';

/**
 * Wrap a provider stream with mid-flight Budget Guard. For every `text-delta`
 * we accumulate the running completion-token estimate (chars/4 heuristic when
 * the provider doesn't emit per-chunk usage) and project the would-be total
 * against the active scope. On overrun we:
 *
 *   1. Throw `BudgetExceededError` into the wrapper stream so the consumer's
 *      `for await` rejects.
 *   2. Cancel the source reader so we stop pulling chunks.
 *   3. Abort the underlying provider HTTP request via `internalAC.abort()`,
 *      which the call site chained into `ModelCallOptions.abortSignal`.
 *
 * Throttling: every chunk runs an O(1) projection check; the chars/4
 * estimate is recomputed only against the new chunk's length, not the
 * accumulated buffer. Overhead is dominated by the existing per-chunk
 * `controller.enqueue` cost.
 *
 * Conservatism: text-only providers don't tell us how many output tokens a
 * chunk really represents. The chars/4 heuristic over-estimates ~5-10% on
 * average — that's the right direction (false-positive abort costs nothing,
 * false-negative costs real money).
 */
export function wrapStreamWithBudget(args: {
  source: ReadableStream<ModelStreamPart>;
  scope: BudgetScope;
  model: LanguageModel;
  inputTokensEstimate: number;
  pricing: ModelPricing | null;
  internalAbort: AbortController;
}): ReadableStream<ModelStreamPart> {
  const { source, scope, inputTokensEstimate, pricing, internalAbort } = args;

  let pendingCompletionTokens = 0;
  let aborted = false;

  const reader = source.getReader();

  return new ReadableStream<ModelStreamPart>({
    async pull(controller) {
      if (aborted) {
        controller.close();
        return;
      }
      let result: ReadableStreamReadResult<ModelStreamPart>;
      try {
        result = await reader.read();
      } catch (err) {
        controller.error(err);
        return;
      }
      const { done, value } = result;
      if (done) {
        controller.close();
        return;
      }

      // Update the running estimate BEFORE the projection check so we always
      // catch the chunk that pushed us over the line.
      if (value.type === 'text-delta' && value.textDelta.length > 0) {
        pendingCompletionTokens += estimateTokensFromString(value.textDelta);
      }

      const projectedTokens = inputTokensEstimate + pendingCompletionTokens;
      const projectedUsd = pricing
        ? (inputTokensEstimate * pricing.inputPer1M) / 1_000_000 +
          (pendingCompletionTokens * pricing.outputPer1M) / 1_000_000
        : 0;

      try {
        checkMidStream(scope, projectedTokens, projectedUsd);
      } catch (err) {
        if (err instanceof BudgetExceededError) {
          aborted = true;
          // Abort the underlying HTTP request first — providers that respect
          // the chained signal will tear down their socket. We do NOT await
          // `reader.cancel` here because the source's `cancel` may take its
          // time (real providers tear down sockets) and we want the consumer
          // to see the error promptly.
          if (!internalAbort.signal.aborted) {
            internalAbort.abort(err);
          }
          controller.error(err);
          // Fire-and-forget cancellation; any rejection is swallowed.
          void reader.cancel(err).catch(() => {});
          return;
        }
        controller.error(err);
        return;
      }

      controller.enqueue(value);
    },
    async cancel(reason) {
      aborted = true;
      try {
        await reader.cancel(reason);
      } catch {
        // Ignore.
      }
    },
  });
}

/**
 * Compose a child `AbortSignal` from the user-provided signal (if any) and an
 * internal controller. The returned signal aborts when **either** source
 * aborts. Uses `AbortSignal.any` when available (Node 20+, modern browsers)
 * and falls back to a manual listener chain otherwise.
 */
export function chainAbortSignals(
  internal: AbortSignal,
  user: AbortSignal | undefined,
): AbortSignal {
  if (!user) return internal;

  const anyFn = (AbortSignal as unknown as { any?: (signals: AbortSignal[]) => AbortSignal }).any;
  if (typeof anyFn === 'function') {
    return anyFn([internal, user]);
  }

  // Manual fallback for Node < 20.
  const ac = new AbortController();
  if (internal.aborted) ac.abort(internal.reason);
  if (user.aborted) ac.abort(user.reason);
  internal.addEventListener('abort', () => ac.abort(internal.reason), { once: true });
  user.addEventListener('abort', () => ac.abort(user.reason), { once: true });
  return ac.signal;
}
