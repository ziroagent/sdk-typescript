/**
 * Middleware contract for {@link LanguageModel}. Three composable hooks
 * intercept the request/response cycle of `generate()` and `stream()`:
 *
 *  1. `transformParams` — rewrite `ModelCallOptions` BEFORE the call
 *     (e.g. inject system messages, redact PII, swap models, add headers).
 *  2. `wrapGenerate` — wrap the non-streaming call (cache hit/miss, retry,
 *     audit logging, structured-output post-processing).
 *  3. `wrapStream` — wrap the streaming call (the same set of concerns,
 *     but the inner `doStream()` returns a `ReadableStream<ModelStreamPart>`).
 *
 * Middlewares are pure values (no constructor, no lifecycle). Compose
 * them with `wrapModel(model, middlewareOrArray)`. Order matters: the
 * FIRST middleware in the array sees the original call first and the
 * final response last (think onion / Koa).
 *
 * Specified in {@link https://github.com/ziro-agent/ziroagent-sdk/blob/main/rfcs/0005-language-model-middleware.md RFC 0005}.
 *
 * @example Simple retry middleware
 * ```ts
 * const retryMw: LanguageModelMiddleware = {
 *   async wrapGenerate({ doGenerate }) {
 *     for (let i = 0; i < 3; i++) {
 *       try { return await doGenerate(); }
 *       catch (err) { if (i === 2) throw err; }
 *     }
 *     throw new Error('unreachable');
 *   },
 * };
 * const robust = wrapModel(openai('gpt-4o-mini'), retryMw);
 * ```
 *
 * @public
 */
import type {
  LanguageModel,
  ModelCallOptions,
  ModelGenerateResult,
  ModelStreamPart,
} from './model.js';

/**
 * Context passed to a middleware's `wrapGenerate` / `wrapStream` hook.
 * `model` is the *underlying* (un-wrapped) model — middlewares peek at
 * `model.modelId` / `model.provider` for routing and observability.
 */
export interface LanguageModelMiddlewareContext {
  /** The (already-transformed) parameters about to be issued. */
  params: ModelCallOptions;
  /** The underlying model — exposed for routing decisions and logging. */
  model: LanguageModel;
}

export interface WrapGenerateContext extends LanguageModelMiddlewareContext {
  /**
   * Invoke the next middleware (or the underlying model when this is
   * the innermost wrapper). Returns the model's response so the
   * middleware can post-process before returning to the caller.
   */
  doGenerate: () => Promise<ModelGenerateResult>;
}

export interface WrapStreamContext extends LanguageModelMiddlewareContext {
  /**
   * Invoke the next middleware (or the underlying model). Returns the
   * raw `ReadableStream<ModelStreamPart>` so middleware can splice
   * a `TransformStream` over it.
   */
  doStream: () => Promise<ReadableStream<ModelStreamPart>>;
}

export interface LanguageModelMiddleware {
  /**
   * Optional human-readable id used in error messages and traces.
   * Recommended convention: `<scope>/<name>` — e.g. `retry/exponential`,
   * `cache/lru`, `pii/redact-emails`.
   */
  readonly middlewareId?: string;

  /**
   * Synchronously rewrite `params` before they reach the model. Return
   * the original `params` (or `undefined`) to leave them unchanged.
   * Avoid heavy I/O here — long-running operations belong in
   * `wrapGenerate` / `wrapStream` where they can be cancelled via
   * `params.abortSignal`.
   */
  transformParams?(args: {
    params: ModelCallOptions;
    model: LanguageModel;
  }): ModelCallOptions | Promise<ModelCallOptions>;

  /**
   * Wrap the non-streaming call. MUST eventually call `doGenerate()`
   * (possibly multiple times for retry) OR throw. Returning a cached
   * result without invoking `doGenerate()` is the canonical "cache
   * hit" pattern.
   */
  wrapGenerate?(ctx: WrapGenerateContext): Promise<ModelGenerateResult>;

  /**
   * Wrap the streaming call. Same semantics as `wrapGenerate` but the
   * inner call returns a `ReadableStream<ModelStreamPart>`. Middlewares
   * that need to inspect every chunk should pipe through a
   * `TransformStream` rather than buffering the full output.
   */
  wrapStream?(ctx: WrapStreamContext): Promise<ReadableStream<ModelStreamPart>>;
}
