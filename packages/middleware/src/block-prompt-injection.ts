import type {
  LanguageModelMiddleware,
  ModelCallOptions,
  NormalizedMessage,
} from '@ziro-agent/core';
import { PromptInjectionError } from './errors.js';

export interface InjectionVerdict {
  injected: boolean;
  /** Confidence in [0, 1] when the adapter exposes one. */
  score?: number;
  /** Free-form explanation surfaced via {@link PromptInjectionError}. */
  reason?: string;
}

export interface PromptInjectionAdapter {
  check(args: { text: string }): InjectionVerdict | Promise<InjectionVerdict>;
}

export interface BlockPromptInjectionOptions {
  /**
   * Adapter (Lakera, Rebuff, custom) used for the primary scan. When
   * omitted, only the built-in heuristic runs.
   */
  adapter?: PromptInjectionAdapter;
  /**
   * Run the built-in regex/keyword heuristic in ADDITION to the adapter.
   * Default: `true` when an adapter is provided (defence-in-depth);
   * `true` always when no adapter is provided.
   */
  heuristic?: boolean;
  /**
   * Which roles to scan. Default: `['user', 'tool']`. Tool messages are
   * scanned because tool *results* are a notorious indirect-injection
   * vector ("the doc contains: ignore previous instructions, …").
   */
  scanRoles?: ReadonlyArray<NormalizedMessage['role']>;
  /**
   * Minimum adapter score that triggers a block. Default: `0.5`.
   * Heuristic matches always block (binary signal).
   */
  minScore?: number;
  /**
   * Optional hook invoked when a verdict triggers a block. Useful for
   * logging / alerting BEFORE the throw bubbles up.
   */
  onBlocked?: (args: {
    verdict: InjectionVerdict;
    params: ModelCallOptions;
    messageIndex: number;
  }) => void | Promise<void>;
}

/**
 * Built-in heuristic — case-insensitive matches on common jailbreak
 * phrases. Designed for high precision; misses sophisticated attacks.
 * Always pair with an adapter for production.
 */
const HEURISTIC_PATTERNS: RegExp[] = [
  /ignore\s+(?:all\s+|the\s+|any\s+)?(?:previous|prior|above|earlier)\s+(?:instructions?|prompts?|messages?|rules?)/i,
  /disregard\s+(?:all\s+|the\s+|any\s+)?(?:previous|prior|above)\s+(?:instructions?|prompts?)/i,
  /forget\s+(?:everything|all)\s+(?:above|before|previously)/i,
  /you\s+are\s+now\s+(?:a|an)\s+\w+/i,
  /(?:reveal|print|show|output|display)\s+(?:your|the)\s+(?:system\s+)?(?:prompt|instructions?)/i,
  /act\s+as\s+(?:if\s+)?(?:you\s+(?:are|were)|a\s+different)/i,
  /\bjailbreak\b/i,
  /\bDAN\s+mode\b/i,
];

const heuristicVerdict = (text: string): InjectionVerdict => {
  for (const pat of HEURISTIC_PATTERNS) {
    const match = pat.exec(text);
    if (match) {
      return {
        injected: true,
        score: 1,
        reason: `heuristic match: ${pat.source.slice(0, 60)}`,
      };
    }
  }
  return { injected: false };
};

/**
 * `blockPromptInjection()` — pre-flight injection check. Throws
 * {@link PromptInjectionError} on the first offending message. Runs in
 * `transformParams` so cache hits (when wrapped underneath) NEVER
 * receive injected prompts.
 */
export function blockPromptInjection(
  options: BlockPromptInjectionOptions = {},
): LanguageModelMiddleware {
  const adapter = options.adapter;
  const heuristic = options.heuristic ?? true;
  const scanRoles = options.scanRoles ?? ['user', 'tool'];
  const minScore = options.minScore ?? 0.5;
  const onBlocked = options.onBlocked;

  const block = async (verdict: InjectionVerdict, idx: number, params: ModelCallOptions) => {
    if (onBlocked) await onBlocked({ verdict, params, messageIndex: idx });
    throw new PromptInjectionError({
      reason: verdict.reason ?? 'injected content detected',
      ...(verdict.score !== undefined ? { score: verdict.score } : {}),
      messageIndex: idx,
    });
  };

  return {
    middlewareId: 'ziro/block-prompt-injection',
    async transformParams({ params }) {
      for (let i = 0; i < params.messages.length; i++) {
        const msg = params.messages[i];
        if (!msg) continue;
        if (!scanRoles.includes(msg.role)) continue;

        const texts: string[] = [];
        for (const part of msg.content) {
          if (part.type === 'text') texts.push(part.text);
          else if (part.type === 'tool-result') {
            // Stringify tool results so heuristic can scan them.
            texts.push(typeof part.result === 'string' ? part.result : JSON.stringify(part.result));
          }
        }
        if (texts.length === 0) continue;
        const joined = texts.join('\n');

        if (heuristic) {
          const verdict = heuristicVerdict(joined);
          if (verdict.injected) await block(verdict, i, params);
        }

        if (adapter) {
          const verdict = await adapter.check({ text: joined });
          const score = verdict.score ?? (verdict.injected ? 1 : 0);
          if (verdict.injected && score >= minScore) await block(verdict, i, params);
        }
      }
      return params;
    },
  };
}
