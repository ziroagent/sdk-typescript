import type { ContentPart } from '@ziro-agent/core';
import {
  APICallError,
  type CostEstimate,
  estimateTokensFromMessages,
  type FinishReason,
  type LanguageModel,
  type ModelCallOptions,
  type ModelGenerateResult,
  type ModelStreamPart,
  type NormalizedMessage,
  resolveMediaInput,
  type TokenUsage,
  type ToolCallPart,
  UnsupportedPartError,
} from '@ziro-agent/core';
import { getPricing } from '@ziro-agent/core/pricing';
import { parseSSE } from './util/sse.js';

export type GoogleGenerativeModelId =
  // Current 2026 lineup (verified against ai.google.dev/pricing 2026-04-22).
  | 'gemini-2.5-pro'
  | 'gemini-2.5-flash'
  | 'gemini-2.5-flash-lite'
  // Stable 2.0-series.
  | 'gemini-2.0-flash'
  | 'gemini-2.0-flash-lite'
  // Open string for any model id we haven't enumerated.
  | (string & {});

interface GoogleGenerativeModelConfig {
  modelId: GoogleGenerativeModelId;
  baseURL: string;
  apiKey: string | undefined;
  headers: Record<string, string>;
  fetcher: typeof fetch;
}

/**
 * Adapter for Google's Generative Language API (`generativelanguage.googleapis.com`).
 *
 * Notes about Gemini's wire format that drove these design choices:
 * - The system prompt lives at the top level as `systemInstruction`,
 *   NOT in `contents`. We hoist out any `system` messages from the
 *   normalized message list before serialising.
 * - Roles are `user` and `model` (not `assistant`). Tool results come
 *   back as `user` messages with `functionResponse` parts.
 * - Tool calls do NOT carry an id from the API. We synthesize one from
 *   `name+index` so downstream tool-result correlation still works.
 * - Streaming is `:streamGenerateContent?alt=sse`, not WebSocket.
 *
 * For Vertex AI auth (OAuth instead of API key) build a custom config
 * by replacing `headers` and `baseURL`; the adapter contract is the same.
 */
export class GoogleGenerativeModel implements LanguageModel {
  readonly provider = 'google';
  readonly modelId: string;
  private readonly config: GoogleGenerativeModelConfig;

  constructor(config: GoogleGenerativeModelConfig) {
    this.modelId = config.modelId;
    this.config = config;
  }

  async generate(options: ModelCallOptions): Promise<ModelGenerateResult> {
    const body = this.buildBody(options);
    const res = await this.fetch(`/models/${this.modelId}:generateContent`, body, options);
    const json = (await res.json()) as GeminiGenerateContentResponse;

    const candidate = json.candidates?.[0];
    const parts = candidate?.content?.parts ?? [];

    const text = parts
      .filter((p): p is { text: string } => typeof (p as { text?: unknown }).text === 'string')
      .map((p) => p.text)
      .join('');

    const toolCalls: ToolCallPart[] = [];
    let toolIdx = 0;
    for (const part of parts) {
      const fc = (part as { functionCall?: { name: string; args?: unknown } }).functionCall;
      if (fc) {
        toolCalls.push({
          type: 'tool-call',
          toolCallId: synthesizeToolCallId(fc.name, toolIdx++),
          toolName: fc.name,
          args: fc.args ?? {},
        });
      }
    }

    return {
      text,
      content: [...(text.length > 0 ? [{ type: 'text' as const, text }] : []), ...toolCalls],
      toolCalls,
      finishReason: mapFinishReason(candidate?.finishReason),
      usage: mapUsage(json.usageMetadata),
      rawResponse: json,
    };
  }

  async stream(options: ModelCallOptions): Promise<ReadableStream<ModelStreamPart>> {
    const body = this.buildBody(options);
    const res = await this.fetch(
      `/models/${this.modelId}:streamGenerateContent?alt=sse`,
      body,
      options,
    );
    if (!res.body) {
      throw new APICallError({
        message: 'Gemini streaming response has no body.',
        statusCode: res.status,
      });
    }
    const events = parseSSE(res.body);

    return new ReadableStream<ModelStreamPart>({
      async start(controller) {
        let finish: FinishReason = 'unknown';
        let usage: TokenUsage = {};
        // Gemini streams complete tool calls inside `functionCall` parts;
        // it does not emit incremental `argsDelta`. We track which calls
        // we've already flushed by name+ordinal so we don't double-emit
        // when the model includes the same functionCall in a later
        // SSE chunk's full snapshot (rare but possible).
        let toolIdx = 0;
        const seen = new Set<string>();

        try {
          for await (const evt of events) {
            const data = parseChunk(evt.data);
            if (!data) continue;

            const cand = data.candidates?.[0];
            const parts = cand?.content?.parts ?? [];
            for (const part of parts) {
              if (typeof (part as { text?: unknown }).text === 'string') {
                const t = (part as { text: string }).text;
                if (t.length > 0) controller.enqueue({ type: 'text-delta', textDelta: t });
              }
              const fc = (part as { functionCall?: { name: string; args?: unknown } }).functionCall;
              if (fc) {
                const key = `${fc.name}#${toolIdx}`;
                if (!seen.has(key)) {
                  seen.add(key);
                  controller.enqueue({
                    type: 'tool-call',
                    toolCallId: synthesizeToolCallId(fc.name, toolIdx),
                    toolName: fc.name,
                    args: fc.args ?? {},
                  });
                  toolIdx++;
                }
              }
            }
            if (cand?.finishReason) finish = mapFinishReason(cand.finishReason);
            if (data.usageMetadata) usage = mergeUsage(usage, mapUsage(data.usageMetadata));
          }
          controller.enqueue({ type: 'finish', finishReason: finish, usage });
          controller.close();
        } catch (err) {
          controller.enqueue({ type: 'error', error: err });
          controller.close();
        }
      },
    });
  }

  /**
   * Pre-flight cost estimate. Mirror the Anthropic adapter — assume
   * `maxTokens` (or 8192 default) is consumed for the upper bound.
   * Returns `pricingAvailable: false` when the SDK has no row for the
   * model (note: Gemini rate cards are marked `unverified` until
   * cross-checked, so the default branch still kicks in for the 2.5-series).
   */
  estimateCost(options: ModelCallOptions): CostEstimate {
    const inputTokens = estimateTokensFromMessages(asChatMessages(options.messages));
    const maxOut = options.maxTokens ?? 8192;
    const minOut = Math.min(16, maxOut);
    const pricing = getPricing(this.provider, this.modelId);
    if (!pricing) {
      return {
        minTokens: inputTokens + minOut,
        maxTokens: inputTokens + maxOut,
        minUsd: 0,
        maxUsd: 0,
        pricingAvailable: false,
      };
    }
    return {
      minTokens: inputTokens + minOut,
      maxTokens: inputTokens + maxOut,
      minUsd:
        (inputTokens * pricing.inputPer1M) / 1_000_000 + (minOut * pricing.outputPer1M) / 1_000_000,
      maxUsd:
        (inputTokens * pricing.inputPer1M) / 1_000_000 + (maxOut * pricing.outputPer1M) / 1_000_000,
      pricingAvailable: true,
    };
  }

  private buildBody(options: ModelCallOptions): Record<string, unknown> {
    const { systemText, others } = splitSystem(options.messages);

    const body: Record<string, unknown> = {
      contents: others.map(toGeminiContent),
    };
    if (systemText) {
      body.systemInstruction = { parts: [{ text: systemText }] };
    }

    if (options.tools?.length) {
      body.tools = [
        {
          functionDeclarations: options.tools.map((t) => ({
            name: t.name,
            ...(t.description !== undefined ? { description: t.description } : {}),
            parameters: t.parameters,
          })),
        },
      ];
    }

    if (options.toolChoice !== undefined) {
      // Gemini's tool config is wrapped in `toolConfig.functionCallingConfig`.
      const cfg: Record<string, unknown> = {};
      if (options.toolChoice === 'auto') cfg.mode = 'AUTO';
      else if (options.toolChoice === 'none') cfg.mode = 'NONE';
      else if (options.toolChoice === 'required') cfg.mode = 'ANY';
      else if (typeof options.toolChoice === 'object') {
        cfg.mode = 'ANY';
        cfg.allowedFunctionNames = [options.toolChoice.toolName];
      }
      body.toolConfig = { functionCallingConfig: cfg };
    }

    const generationConfig: Record<string, unknown> = {};
    if (options.temperature !== undefined) generationConfig.temperature = options.temperature;
    if (options.topP !== undefined) generationConfig.topP = options.topP;
    if (options.topK !== undefined) generationConfig.topK = options.topK;
    if (options.maxTokens !== undefined) generationConfig.maxOutputTokens = options.maxTokens;
    if (options.stopSequences !== undefined) generationConfig.stopSequences = options.stopSequences;
    if (options.seed !== undefined) generationConfig.seed = options.seed;
    if (Object.keys(generationConfig).length > 0) body.generationConfig = generationConfig;

    if (options.providerOptions) Object.assign(body, options.providerOptions);
    return body;
  }

  private async fetch(path: string, body: unknown, options: ModelCallOptions): Promise<Response> {
    let url = `${this.config.baseURL}${path}`;
    // Prefer header auth when the consumer passed a custom Bearer header
    // (Vertex AI / OAuth path). Otherwise fall back to the documented
    // `?key=...` query parameter for the public Generative Language API.
    const usingHeaderAuth =
      this.config.headers.Authorization !== undefined ||
      this.config.headers.authorization !== undefined;
    if (this.config.apiKey && !usingHeaderAuth) {
      url += url.includes('?') ? `&key=${this.config.apiKey}` : `?key=${this.config.apiKey}`;
    }
    const headers = { ...this.config.headers, ...options.headers };
    const init: RequestInit = {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    };
    if (options.abortSignal) init.signal = options.abortSignal;

    const res = await this.config.fetcher(url, init);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new APICallError({
        message: `Google Gemini API error: ${res.status} ${res.statusText}`,
        url,
        statusCode: res.status,
        responseBody: text,
      });
    }
    return res;
  }
}

/** See AnthropicMessagesModel for the rationale of this structural cast. */
function asChatMessages(
  messages: NormalizedMessage[],
): Parameters<typeof estimateTokensFromMessages>[0] {
  return messages as unknown as Parameters<typeof estimateTokensFromMessages>[0];
}

function splitSystem(messages: NormalizedMessage[]): {
  systemText?: string;
  others: NormalizedMessage[];
} {
  const sys = messages.filter((m) => m.role === 'system');
  const others = messages.filter((m) => m.role !== 'system');
  if (sys.length === 0) return { others };
  const text = sys
    .flatMap((m) => m.content)
    .filter((p) => p.type === 'text')
    .map((p) => (p as { text: string }).text)
    .join('\n');
  return { systemText: text, others };
}

function mapGeminiUserPart(p: ContentPart): unknown {
  if (p.type === 'text') return { text: p.text };
  if (p.type === 'image') {
    if (typeof p.image === 'string') {
      if (p.image.startsWith('data:')) {
        const [meta, data] = p.image.split(',');
        const mime =
          meta?.replace(/^data:/, '').replace(/;base64$/, '') ?? p.mimeType ?? 'image/png';
        return { inlineData: { mimeType: mime, data: data ?? '' } };
      }
      return { fileData: { mimeType: p.mimeType ?? 'image/png', fileUri: p.image } };
    }
    return {
      inlineData: {
        mimeType: p.mimeType ?? 'image/png',
        data: uint8ToBase64(p.image as Uint8Array),
      },
    };
  }
  if (p.type === 'audio') {
    const r = resolveMediaInput(p.audio);
    const mime = p.mimeType ?? ('url' in r ? undefined : r.mimeType) ?? 'audio/wav';
    if ('url' in r) {
      return { fileData: { mimeType: mime, fileUri: r.url } };
    }
    return { inlineData: { mimeType: mime, data: r.base64 } };
  }
  if (p.type === 'file') {
    const r = resolveMediaInput(p.file);
    const mime = p.mimeType ?? ('url' in r ? undefined : r.mimeType) ?? 'application/octet-stream';
    if ('url' in r) {
      return { fileData: { mimeType: mime, fileUri: r.url } };
    }
    return { inlineData: { mimeType: mime, data: r.base64 } };
  }
  throw new UnsupportedPartError({
    partType: (p as { type?: string }).type ?? 'unknown',
    provider: 'google',
    message: 'Unexpected content part in user message.',
  });
}

function toGeminiContent(m: NormalizedMessage): unknown {
  switch (m.role) {
    case 'user': {
      const parts = m.content.map((p) => mapGeminiUserPart(p));
      return { role: 'user', parts };
    }
    case 'assistant': {
      const parts = m.content.map((p) => {
        if (p.type === 'text') return { text: p.text };
        if (p.type === 'tool-call') {
          return { functionCall: { name: p.toolName, args: p.args ?? {} } };
        }
        return p;
      });
      return { role: 'model', parts };
    }
    case 'tool': {
      // Gemini wraps tool results inside a `user` content with
      // `functionResponse` parts. The response content must be JSON-y;
      // we wrap raw strings in `{ result: "..." }` to comply.
      const parts = m.content
        .filter((r): r is Extract<typeof r, { type: 'tool-result' }> => r.type === 'tool-result')
        .map((r) => ({
          functionResponse: {
            name: r.toolName,
            response:
              typeof r.result === 'object' && r.result !== null
                ? r.result
                : { result: r.result, ...(r.isError ? { error: true } : {}) },
          },
        }));
      return { role: 'user', parts };
    }
    case 'system':
      // System is hoisted in `splitSystem`; this branch should be unreachable.
      return { role: 'user', parts: [{ text: '' }] };
  }
}

/**
 * Gemini's API never returns a stable per-call id for tool calls. We
 * synthesize one from `<name>_<idx>` so downstream tool-result lookup
 * still has something to correlate on. The `gemini_` prefix makes it
 * obvious these are SDK-generated, not provider-supplied.
 */
function synthesizeToolCallId(name: string, idx: number): string {
  return `gemini_${name}_${idx}`;
}

function parseChunk(raw: string): GeminiGenerateContentResponse | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as GeminiGenerateContentResponse;
  } catch {
    return null;
  }
}

function mapFinishReason(reason: string | null | undefined): FinishReason {
  switch (reason) {
    case 'STOP':
      return 'stop';
    case 'MAX_TOKENS':
      return 'length';
    case 'SAFETY':
    case 'RECITATION':
    case 'PROHIBITED_CONTENT':
    case 'BLOCKLIST':
    case 'SPII':
      return 'content-filter';
    case 'TOOL_CALL':
      return 'tool-calls';
    case null:
    case undefined:
      return 'unknown';
    default:
      return 'other';
  }
}

interface GeminiUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
  cachedContentTokenCount?: number;
}

function mapUsage(u: GeminiUsageMetadata | undefined): TokenUsage {
  if (!u) return {};
  const out: TokenUsage = {
    promptTokens: u.promptTokenCount,
    completionTokens: u.candidatesTokenCount,
    totalTokens: u.totalTokenCount,
  };
  if (u.cachedContentTokenCount !== undefined) out.cachedPromptTokens = u.cachedContentTokenCount;
  if (
    out.totalTokens === undefined &&
    out.promptTokens !== undefined &&
    out.completionTokens !== undefined
  ) {
    out.totalTokens = out.promptTokens + out.completionTokens;
  }
  return out;
}

function mergeUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  // Gemini emits the cumulative usage at the END of the stream, so on
  // each chunk we just keep the latest non-undefined values rather than
  // summing — summing would double-count. Match `b` over `a` field-wise.
  return {
    promptTokens: b.promptTokens ?? a.promptTokens,
    completionTokens: b.completionTokens ?? a.completionTokens,
    totalTokens: b.totalTokens ?? a.totalTokens,
    cachedPromptTokens: b.cachedPromptTokens ?? a.cachedPromptTokens,
  };
}

function uint8ToBase64(arr: Uint8Array): string {
  let s = '';
  for (let i = 0; i < arr.byteLength; i++) s += String.fromCharCode(arr[i] as number);
  return typeof btoa !== 'undefined' ? btoa(s) : Buffer.from(s, 'binary').toString('base64');
}

interface GeminiGenerateContentResponse {
  candidates?: Array<{
    content?: {
      role?: string;
      parts?: Array<{ text: string } | { functionCall: { name: string; args?: unknown } }>;
    };
    finishReason?: string;
  }>;
  usageMetadata?: GeminiUsageMetadata;
}
