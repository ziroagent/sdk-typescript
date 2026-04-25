import { checkAfterCall, checkBeforeCall, recordUsage } from './budget/enforce.js';
import { BudgetExceededError } from './budget/errors.js';
import { applyResolution } from './budget/resolver.js';
import { getCurrentScope, withBudget } from './budget/scope.js';
import { computeActualUsd, type GenerateTextOptions, resolveEstimate } from './generate-text.js';
import { getPricing } from './pricing/index.js';
import { chainAbortSignals, wrapStreamWithBudget } from './streaming/budget-stream.js';
import { fireResumableStreamEvent } from './streaming/resumable-stream-observer.js';
import type {
  ResumableStreamContinueLock,
  ResumableStreamContinueLockStore,
  ResumableStreamEventStore,
} from './streaming/resumable-stream-store.js';
import { buildStreamTextResult, type StreamTextResult } from './streaming/text-stream.js';
import type { ModelCallOptions, ModelStreamPart } from './types/model.js';
import { estimateTokensFromMessages } from './util/estimate-tokens.js';
import { normalizePrompt } from './util/normalize-prompt.js';

type StreamTextOptionsFromModel = GenerateTextOptions & {
  /** Called once per error event from the underlying model stream. */
  onError?: (err: unknown) => void;
  /**
   * If true, cache emitted stream events and return a `resumeKey`.
   */
  resumable?: boolean;
  /**
   * Storage adapter used to cache stream events when `resumable` is enabled.
   */
  streamEventStore?: ResumableStreamEventStore;
};

type StreamTextOptionsFromReplay = {
  resumeKey: string;
  resumeFromIndex?: number;
  streamEventStore: ResumableStreamEventStore;
  /** Called once per error event from the replay stream. */
  onError?: (err: unknown) => void;
  continueUpstream?: false;
};

type StreamTextOptionsFromReplayAndContinue = GenerateTextOptions & {
  resumeKey: string;
  resumeFromIndex?: number;
  streamEventStore: ResumableStreamEventStore;
  /** Called once per error event from replay/live stream. */
  onError?: (err: unknown) => void;
  continueUpstream: true;
};

export type StreamTextOptions =
  | StreamTextOptionsFromModel
  | StreamTextOptionsFromReplay
  | StreamTextOptionsFromReplayAndContinue;

/**
 * Streaming counterpart of `generateText`. Returns a result object with two
 * `ReadableStream`s (text-only and full event), plus aggregate promises that
 * resolve when the stream completes.
 *
 * Budget Guard semantics for streams (v0.1.6 layer 4):
 *   - **Pre-flight**: enforced before the stream is opened (we never start a
 *     stream we can't afford to finish).
 *   - **Mid-stream**: every `text-delta` updates a running completion-token
 *     estimate (chars/4 heuristic) and runs `checkMidStream` against the
 *     projected total. On overrun, the underlying provider request is
 *     aborted via an internal `AbortController` chained with the user's
 *     `abortSignal`, the source reader is cancelled, and the wrapper stream
 *     errors with `BudgetExceededError`.
 *   - **Post-call**: when `finish` arrives normally, `recordUsage` mutates
 *     the scope with the model's reported actual usage and `checkAfterCall`
 *     re-validates so the next call within the scope sees the updated total.
 *
 * `BudgetSpec.onExceed` function form is honored at the **pre-flight** layer
 * only — once the stream is open and chunks are flowing, mid-stream overrun
 * always surfaces the error to the consumer (the resolver semantics don't
 * fit a streaming API where bytes have already been emitted to the user).
 */
export async function streamText(options: StreamTextOptions): Promise<StreamTextResult> {
  if ('resumeKey' in options) {
    const replayParts = await options.streamEventStore.getParts(
      options.resumeKey,
      options.resumeFromIndex ?? 0,
    );
    fireResumableStreamEvent({
      phase: 'replay_start',
      resumeKey: options.resumeKey,
      replayCount: replayParts.length,
    });
    const replayStream = buildReplayStream({ parts: replayParts });
    if (!options.continueUpstream) {
      fireResumableStreamEvent({
        phase: 'replay_end',
        resumeKey: options.resumeKey,
        replayCount: replayParts.length,
      });
      const replay = buildStreamTextResult({
        source: replayStream,
        ...(options.onError ? { onError: options.onError } : {}),
      });
      return { ...replay, resumeKey: options.resumeKey };
    }
    let lock: ResumableStreamContinueLock | null = null;
    try {
      const maybeLockStore = asContinueLockStore(options.streamEventStore);
      if (maybeLockStore) {
        lock = await maybeLockStore.acquireContinueLock(options.resumeKey);
        fireResumableStreamEvent({
          phase: 'continue_lock_acquired',
          resumeKey: options.resumeKey,
        });
      }

      const meta = await options.streamEventStore.getSessionMeta(options.resumeKey);
      if (meta?.completed) {
        if (lock && maybeLockStore) {
          await maybeLockStore.releaseContinueLock(lock);
          fireResumableStreamEvent({
            phase: 'continue_lock_released',
            resumeKey: options.resumeKey,
          });
          lock = null;
        }
        fireResumableStreamEvent({
          phase: 'continue_upstream_skipped_completed',
          resumeKey: options.resumeKey,
          replayCount: replayParts.length,
        });
        fireResumableStreamEvent({
          phase: 'replay_end',
          resumeKey: options.resumeKey,
          replayCount: replayParts.length,
        });
        const replay = buildStreamTextResult({
          source: replayStream,
          ...(options.onError ? { onError: options.onError } : {}),
        });
        return { ...replay, resumeKey: options.resumeKey };
      }
      const { resumeKey, resumeFromIndex, streamEventStore, continueUpstream, onError, ...live } =
        options;
      fireResumableStreamEvent({
        phase: 'continue_upstream_start',
        resumeKey: options.resumeKey,
      });
      const liveResult = await streamText({
        ...live,
        ...(onError ? { onError } : {}),
      });
      const persistedLive = tapAndPersistStream(liveResult.fullStream, {
        resumeKey: options.resumeKey,
        store: options.streamEventStore,
        startIndex: meta?.nextIndex ?? replayParts.length,
      });
      const liveWithUnlock =
        lock && maybeLockStore
          ? withFinally(persistedLive, async () => {
              await maybeLockStore.releaseContinueLock(lock as ResumableStreamContinueLock);
              fireResumableStreamEvent({
                phase: 'continue_lock_released',
                resumeKey: options.resumeKey,
              });
            })
          : persistedLive;
      const combined = withFinally(concatStreams(replayStream, liveWithUnlock), async () => {
        fireResumableStreamEvent({
          phase: 'continue_upstream_end',
          resumeKey: options.resumeKey,
        });
        fireResumableStreamEvent({
          phase: 'replay_end',
          resumeKey: options.resumeKey,
          replayCount: replayParts.length,
        });
      });
      const replay = buildStreamTextResult({
        source: combined,
        ...(options.onError ? { onError: options.onError } : {}),
      });
      return { ...replay, resumeKey: options.resumeKey };
    } catch (err) {
      if (lock) {
        const maybeLockStore = asContinueLockStore(options.streamEventStore);
        if (maybeLockStore) {
          await maybeLockStore.releaseContinueLock(lock).catch(() => {});
          fireResumableStreamEvent({
            phase: 'continue_lock_released',
            resumeKey: options.resumeKey,
          });
        }
      }
      throw err;
    }
  }

  const { model, tools, toolChoice, onError, budget, resumable, streamEventStore, ...rest } =
    options;

  const messages = normalizePrompt(rest);

  const exec = async (): Promise<StreamTextResult> => {
    const scope = getCurrentScope();

    // Internal controller used to abort the provider HTTP request when the
    // mid-stream check trips. Chained with the user's optional signal so
    // either source can cancel.
    const internalAC = new AbortController();
    const chainedSignal = chainAbortSignals(internalAC.signal, rest.abortSignal);

    const callOptions: ModelCallOptions = {
      messages,
      ...(tools !== undefined ? { tools } : {}),
      ...(toolChoice !== undefined ? { toolChoice } : {}),
      ...(rest.temperature !== undefined ? { temperature: rest.temperature } : {}),
      ...(rest.topP !== undefined ? { topP: rest.topP } : {}),
      ...(rest.topK !== undefined ? { topK: rest.topK } : {}),
      ...(rest.maxTokens !== undefined ? { maxTokens: rest.maxTokens } : {}),
      ...(rest.stopSequences !== undefined ? { stopSequences: rest.stopSequences } : {}),
      ...(rest.seed !== undefined ? { seed: rest.seed } : {}),
      ...(rest.providerOptions !== undefined ? { providerOptions: rest.providerOptions } : {}),
      // Always pass the chained signal — when there's no scope this is just
      // the user's signal (or undefined → noop chain).
      ...(scope || rest.abortSignal ? { abortSignal: chainedSignal } : {}),
      ...(rest.headers !== undefined ? { headers: rest.headers } : {}),
    };

    let inputTokensEstimate = 0;
    if (scope) {
      const estimate = await resolveEstimate(model, callOptions);
      checkBeforeCall(scope, estimate);
      // Stash the input-token estimate so the mid-stream wrapper can build
      // the projected total without re-running the heuristic.
      inputTokensEstimate =
        estimate?.minTokens ??
        estimateTokensFromMessages(
          callOptions.messages as unknown as Parameters<typeof estimateTokensFromMessages>[0],
        );
    }

    const rawSource = await model.stream(callOptions);
    const source = scope
      ? wrapStreamWithBudget({
          source: rawSource,
          scope,
          model,
          inputTokensEstimate,
          pricing: getPricing(model.provider, model.modelId) ?? null,
          internalAbort: internalAC,
        })
      : rawSource;

    const resumeKey = resumable
      ? (streamEventStore ?? requiredStore()).createResumeKey()
      : undefined;
    const sourceWithReplay = resumeKey
      ? tapAndPersistStream(source, {
          resumeKey,
          store: streamEventStore ?? requiredStore(),
        })
      : source;

    const result = buildStreamTextResult({
      source: sourceWithReplay,
      ...(onError ? { onError } : {}),
    });

    if (scope) {
      // Post-flight check: once usage resolves we record and re-validate.
      // If the stream ended via mid-stream abort, `usage()` rejects and we
      // skip recordUsage — the BudgetExceededError already surfaced to the
      // consumer.
      void result
        .usage()
        .then((usage) => {
          const actualUsd = computeActualUsd(model, usage);
          recordUsage(scope, usage, actualUsd);
          try {
            checkAfterCall(scope);
          } catch {
            // Swallow — the next checkBeforeCall on this scope will re-throw.
          }
        })
        .catch(() => {
          // Stream errored out (mid-stream abort or transport error); usage
          // stays at last known good value and the consumer already saw the
          // error via `text()` / `for await`.
        });
    }

    return resumeKey ? { ...result, resumeKey } : result;
  };

  // The pre-flight `onExceed` function-form resolver runs only at the layer
  // that **owns** the scope (the call that passed `budget`). When streamText
  // is invoked inside an outer `withBudget`, propagate the error so the
  // owner can resolve. Mid-stream overruns always surface to the consumer
  // via the stream itself (resolver semantics don't fit a partially-emitted
  // response).
  if (budget) {
    try {
      return await withBudget(budget, exec);
    } catch (err) {
      if (err instanceof BudgetExceededError) {
        const syntheticScope = {
          id: err.scopeId,
          spec: budget,
          used: { ...err.partialUsage, steps: 0 },
          startedAt: 0,
          firedWarnings: new Set<string>(),
        };
        return await applyResolution<StreamTextResult>(syntheticScope, err);
      }
      throw err;
    }
  }
  return await exec();
}

function requiredStore(): never {
  throw new Error(
    'streamText({ resumable: true }) requires `streamEventStore` (e.g. new InMemoryResumableStreamEventStore()).',
  );
}

function tapAndPersistStream(
  source: ReadableStream<ModelStreamPart>,
  opts: { resumeKey: string; store: ResumableStreamEventStore; startIndex?: number },
): ReadableStream<ModelStreamPart> {
  return new ReadableStream<ModelStreamPart>({
    async start(controller) {
      let index = opts.startIndex ?? 0;
      const reader = source.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          // Guard errors (event/byte caps) come from store.append and should
          // fail the stream so callers can decide to downgrade/disable resumable mode.
          await opts.store.append(opts.resumeKey, index, value);
          index++;
          controller.enqueue(value);
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      } finally {
        reader.releaseLock();
      }
    },
    async cancel(reason) {
      await source.cancel(reason);
    },
  });
}

function buildReplayStream(opts: { parts: ModelStreamPart[] }): ReadableStream<ModelStreamPart> {
  return new ReadableStream<ModelStreamPart>({
    start(controller) {
      for (const part of opts.parts) controller.enqueue(part);
      controller.close();
    },
  });
}

function concatStreams(
  first: ReadableStream<ModelStreamPart>,
  second: ReadableStream<ModelStreamPart>,
): ReadableStream<ModelStreamPart> {
  return new ReadableStream<ModelStreamPart>({
    async start(controller) {
      const firstReader = first.getReader();
      const secondReader = second.getReader();
      try {
        while (true) {
          const { done, value } = await firstReader.read();
          if (done) break;
          controller.enqueue(value);
        }
        while (true) {
          const { done, value } = await secondReader.read();
          if (done) break;
          controller.enqueue(value);
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      } finally {
        firstReader.releaseLock();
        secondReader.releaseLock();
      }
    },
    async cancel(reason) {
      await Promise.allSettled([first.cancel(reason), second.cancel(reason)]);
    },
  });
}

function asContinueLockStore(
  store: ResumableStreamEventStore,
): ResumableStreamContinueLockStore | null {
  if (
    'acquireContinueLock' in store &&
    typeof store.acquireContinueLock === 'function' &&
    'releaseContinueLock' in store &&
    typeof store.releaseContinueLock === 'function'
  ) {
    return store as ResumableStreamContinueLockStore;
  }
  return null;
}

function withFinally(
  source: ReadableStream<ModelStreamPart>,
  onFinally: () => Promise<void>,
): ReadableStream<ModelStreamPart> {
  let finished = false;
  const finalize = async () => {
    if (finished) return;
    finished = true;
    await onFinally();
  };
  return new ReadableStream<ModelStreamPart>({
    async start(controller) {
      const reader = source.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      } finally {
        reader.releaseLock();
        await finalize();
      }
    },
    async cancel(reason) {
      await source.cancel(reason);
      await finalize();
    },
  });
}
