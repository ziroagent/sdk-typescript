/**
 * `cache()` — short-circuit `wrapGenerate` with a previously-stored
 * response when the same `ModelCallOptions` arrive again.
 *
 * Scope: deterministic, idempotent prompts (graders, embeddings,
 * structured-output extraction). DO NOT cache user-facing chat — even
 * `temperature=0` is not a contract from any provider.
 *
 * The default key derivation is intentionally CONSERVATIVE: it includes
 * `provider`, `modelId`, the full message array, the tool definitions,
 * and every option that affects sampling (`temperature`, `topP`,
 * `topK`, `maxTokens`, `stopSequences`, `seed`). `headers` and
 * `abortSignal` are ignored. Override `keyOf` for custom strategies
 * (e.g. ignore message timestamps, normalize whitespace).
 *
 * The default store is an in-process `Map` with optional TTL. Plug in
 * your own `CacheStore` to use Redis, SQLite, etc.
 *
 * Streaming requests (`wrapStream`) are NEVER cached — the abstraction
 * doesn't fit (we'd have to buffer the whole response and lose
 * incremental delivery). Streams pass through.
 *
 * @example
 * ```ts
 * import { cache } from '@ziro-agent/middleware';
 * import { wrapModel } from '@ziro-agent/core';
 *
 * const grader = wrapModel(openai('gpt-4o-mini'), cache({ ttlMs: 60_000 }));
 * ```
 */
import type {
  LanguageModel,
  LanguageModelMiddleware,
  ModelCallOptions,
  ModelGenerateResult,
} from '@ziro-agent/core';

export interface CacheStore {
  get(key: string): Promise<ModelGenerateResult | undefined> | ModelGenerateResult | undefined;
  set(key: string, value: ModelGenerateResult, ttlMs?: number): Promise<void> | void;
}

export interface CacheOptions {
  /** Backing store. Default: in-process `Map` (per-process, lost on restart). */
  store?: CacheStore;
  /** TTL passed to `store.set`. `undefined` = no expiry (Map fallback ignores). */
  ttlMs?: number;
  /** Custom cache key derivation. Default: stable JSON of the relevant fields. */
  keyOf?: (params: ModelCallOptions, model: LanguageModel) => string;
  /**
   * Optional sink for cache events (test injection / observability).
   * Fires once per `wrapGenerate` invocation.
   */
  onEvent?: (info: { hit: boolean; key: string }) => void;
}

/**
 * Tiny in-process Map-backed store with TTL support. Use as a sane
 * default; swap in Redis / KV when you need cross-process sharing.
 */
export class MemoryCacheStore implements CacheStore {
  private readonly entries = new Map<string, { value: ModelGenerateResult; expiresAt?: number }>();

  get(key: string): ModelGenerateResult | undefined {
    const e = this.entries.get(key);
    if (!e) return undefined;
    if (e.expiresAt !== undefined && e.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return e.value;
  }

  set(key: string, value: ModelGenerateResult, ttlMs?: number): void {
    const entry: { value: ModelGenerateResult; expiresAt?: number } = { value };
    if (ttlMs !== undefined) entry.expiresAt = Date.now() + ttlMs;
    this.entries.set(key, entry);
  }

  /** Test helper: drop every entry. Not part of the `CacheStore` contract. */
  clear(): void {
    this.entries.clear();
  }
}

/**
 * Stable JSON serializer — sorts object keys recursively so two calls
 * with identical semantics but different key insertion order produce
 * the same string. Sufficient for typed payloads; not a full canonical
 * JSON (no Number normalization, no Date handling).
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const inner = keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`)
    .join(',');
  return `{${inner}}`;
}

const defaultKeyOf = (params: ModelCallOptions, model: LanguageModel): string => {
  return stableStringify({
    provider: model.provider,
    modelId: model.modelId,
    messages: params.messages,
    tools: params.tools,
    toolChoice: params.toolChoice,
    temperature: params.temperature,
    topP: params.topP,
    topK: params.topK,
    maxTokens: params.maxTokens,
    stopSequences: params.stopSequences,
    seed: params.seed,
    providerOptions: params.providerOptions,
  });
};

export function cache(options: CacheOptions = {}): LanguageModelMiddleware {
  const store = options.store ?? new MemoryCacheStore();
  const keyOf = options.keyOf ?? defaultKeyOf;
  const ttlMs = options.ttlMs;

  return {
    middlewareId: 'cache/lru',

    async wrapGenerate({ doGenerate, model, params }): Promise<ModelGenerateResult> {
      const key = keyOf(params, model);
      const hit = await store.get(key);
      if (hit !== undefined) {
        options.onEvent?.({ hit: true, key });
        return hit;
      }
      options.onEvent?.({ hit: false, key });
      const fresh = await doGenerate();
      await store.set(key, fresh, ttlMs);
      return fresh;
    },
    // wrapStream: intentionally omitted — see module docblock.
  };
}
