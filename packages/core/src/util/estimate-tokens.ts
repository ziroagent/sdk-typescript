import type { ChatMessage } from '../types/messages.js';

/**
 * Cheap, dependency-free token estimator. Uses the well-known `chars / 4`
 * heuristic from OpenAI's tokenizer guide — accurate to ~10% on English
 * prose, less so on code or non-Latin scripts. Good enough for a pre-flight
 * BudgetSpec check; a tiktoken-backed estimator is on the v0.4 roadmap.
 */
export function estimateTokensFromString(text: string): number {
  if (!text) return 0;
  // ceil so an empty-ish 1-char string still costs 1.
  return Math.max(1, Math.ceil(text.length / 4));
}

export function estimateTokensFromMessages(messages: readonly ChatMessage[]): number {
  let total = 0;
  for (const msg of messages) {
    // ~3 token per-message overhead (role + delimiters), per OpenAI guidance.
    total += 3;
    total += estimateTokensFromContent(msg.content as unknown);
  }
  // ~3 token reply primer.
  return total + 3;
}

function estimateTokensFromContent(content: unknown): number {
  if (typeof content === 'string') return estimateTokensFromString(content);
  if (!Array.isArray(content)) return 0;
  let n = 0;
  for (const part of content) {
    if (!part || typeof part !== 'object') continue;
    const p = part as { type?: string; text?: string; args?: unknown; result?: unknown };
    if (p.type === 'text' && typeof p.text === 'string') {
      n += estimateTokensFromString(p.text);
    } else if (p.type === 'image') {
      // OpenAI bills detail=auto images at ~85 base tokens; a safe lower bound.
      n += 85;
    } else if (p.type === 'tool-call') {
      n += estimateTokensFromString(JSON.stringify(p.args ?? {}));
    } else if (p.type === 'tool-result') {
      n += estimateTokensFromString(
        typeof p.result === 'string' ? p.result : JSON.stringify(p.result ?? null),
      );
    }
  }
  return n;
}
