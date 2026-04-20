/**
 * `wrapModel` — fold an array of {@link LanguageModelMiddleware} over a
 * {@link LanguageModel}, producing a new model that runs each
 * middleware in onion order: middleware[0] is the OUTERMOST wrapper
 * (sees the call first, sees the response last).
 *
 * Returns a NEW model — the original is never mutated. Re-wrapping a
 * wrapped model is supported and composes naturally:
 *
 * ```ts
 * const m1 = wrapModel(openai('gpt-4o-mini'), retryMw);
 * const m2 = wrapModel(m1, [cacheMw, redactMw]); // applies on top of retry
 * ```
 *
 * Specified in {@link https://github.com/ziro-agent/ziroagent-sdk/blob/main/rfcs/0005-language-model-middleware.md RFC 0005}.
 */
import type {
  LanguageModelMiddleware,
  WrapGenerateContext,
  WrapStreamContext,
} from '../types/middleware.js';
import type {
  LanguageModel,
  ModelCallOptions,
  ModelGenerateResult,
  ModelStreamPart,
} from '../types/model.js';

export function wrapModel(
  model: LanguageModel,
  middleware: LanguageModelMiddleware | readonly LanguageModelMiddleware[],
): LanguageModel {
  const mws = Array.isArray(middleware)
    ? (middleware as readonly LanguageModelMiddleware[])
    : ([middleware as LanguageModelMiddleware] as const);
  if (mws.length === 0) return model;

  /**
   * Run all `transformParams` hooks left-to-right. Each sees the
   * params produced by the previous one — letting `redactPII` run
   * after `injectSystem`, for example.
   */
  const applyTransforms = async (params: ModelCallOptions): Promise<ModelCallOptions> => {
    let current = params;
    for (const mw of mws) {
      if (mw.transformParams) {
        current = await mw.transformParams({ params: current, model });
      }
    }
    return current;
  };

  return {
    modelId: model.modelId,
    provider: model.provider,
    ...(model.estimateCost ? { estimateCost: model.estimateCost.bind(model) } : {}),

    async generate(options: ModelCallOptions): Promise<ModelGenerateResult> {
      const transformed = await applyTransforms(options);

      // Build the onion: each middleware's `wrapGenerate` calls the
      // next via `doGenerate`. Middlewares without `wrapGenerate` are
      // skipped (they only do `transformParams`).
      const generators = mws.filter((mw) => mw.wrapGenerate);
      let next: () => Promise<ModelGenerateResult> = () => model.generate(transformed);
      for (let i = generators.length - 1; i >= 0; i--) {
        const mw = generators[i];
        if (!mw) continue;
        const inner = next;
        next = () => {
          const ctx: WrapGenerateContext = {
            params: transformed,
            model,
            doGenerate: inner,
          };
          // Non-null asserted: filter() guarantees `wrapGenerate` exists.
          // biome-ignore lint/style/noNonNullAssertion: predicate guarantees presence
          return mw.wrapGenerate!(ctx);
        };
      }
      return await next();
    },

    async stream(options: ModelCallOptions): Promise<ReadableStream<ModelStreamPart>> {
      const transformed = await applyTransforms(options);

      const streamers = mws.filter((mw) => mw.wrapStream);
      let next: () => Promise<ReadableStream<ModelStreamPart>> = () => model.stream(transformed);
      for (let i = streamers.length - 1; i >= 0; i--) {
        const mw = streamers[i];
        if (!mw) continue;
        const inner = next;
        next = () => {
          const ctx: WrapStreamContext = {
            params: transformed,
            model,
            doStream: inner,
          };
          // biome-ignore lint/style/noNonNullAssertion: predicate guarantees presence
          return mw.wrapStream!(ctx);
        };
      }
      return await next();
    },
  };
}
