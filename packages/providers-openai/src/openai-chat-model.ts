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

/**
 * The set of OpenAI chat model ids we explicitly know about. Other strings are
 * still allowed via the `(string & {})` trick — we don't want to lock users out
 * when OpenAI ships a new model before we update the SDK.
 */
export type OpenAIChatModelId =
  // Current flagships (verified against openai.com/api/pricing 2026-04-20).
  | 'gpt-5.4'
  | 'gpt-5.4-mini'
  | 'gpt-5.4-nano'
  // Legacy still served on the API.
  | 'gpt-4o'
  | 'gpt-4o-mini'
  // Open string for any model id we haven't enumerated — Budget Guard
  // pre-flight will return `pricingAvailable: false` for unknown ids and
  // fall back to post-call enforcement only.
  | (string & {});

interface OpenAIChatModelConfig {
  modelId: OpenAIChatModelId;
  baseURL: string;
  headers: Record<string, string>;
  fetcher: typeof fetch;
}

export class OpenAIChatModel implements LanguageModel {
  readonly provider = 'openai';
  readonly modelId: string;
  private readonly config: OpenAIChatModelConfig;

  constructor(config: OpenAIChatModelConfig) {
    this.modelId = config.modelId;
    this.config = config;
  }

  async generate(options: ModelCallOptions): Promise<ModelGenerateResult> {
    const body = this.buildBody(options, false);
    const res = await this.fetch('/chat/completions', body, options);
    const json = (await res.json()) as OpenAIChatCompletion;

    const choice = json.choices?.[0];
    if (!choice) {
      throw new APICallError({
        message: 'OpenAI response contained no choices.',
        url: `${this.config.baseURL}/chat/completions`,
        statusCode: res.status,
        responseBody: JSON.stringify(json),
      });
    }

    const text = choice.message?.content ?? '';
    const toolCalls: ToolCallPart[] =
      choice.message?.tool_calls?.map((tc) => ({
        type: 'tool-call' as const,
        toolCallId: tc.id,
        toolName: tc.function.name,
        args: safeParseJSON(tc.function.arguments),
      })) ?? [];

    return {
      text,
      content: [...(text.length > 0 ? [{ type: 'text' as const, text }] : []), ...toolCalls],
      toolCalls,
      finishReason: mapFinishReason(choice.finish_reason),
      usage: mapUsage(json.usage),
      rawResponse: json,
    };
  }

  async stream(options: ModelCallOptions): Promise<ReadableStream<ModelStreamPart>> {
    const body = this.buildBody(options, true);
    const res = await this.fetch('/chat/completions', body, options);
    if (!res.body) {
      throw new APICallError({
        message: 'OpenAI streaming response has no body.',
        statusCode: res.status,
      });
    }

    const sse = parseSSE(res.body);

    return new ReadableStream<ModelStreamPart>({
      async start(controller) {
        const toolCallsByIndex = new Map<
          number,
          { id: string; name: string; argsBuffer: string }
        >();
        let usage: TokenUsage | undefined;
        let finish: FinishReason = 'unknown';

        try {
          for await (const event of sse) {
            if (event === '[DONE]') break;
            const chunk = JSON.parse(event) as OpenAIChatChunk;

            const choice = chunk.choices?.[0];
            if (!choice) {
              if (chunk.usage) usage = mapUsage(chunk.usage);
              continue;
            }

            const delta = choice.delta;
            if (delta?.content) {
              controller.enqueue({ type: 'text-delta', textDelta: delta.content });
            }

            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index;
                let entry = toolCallsByIndex.get(idx);
                if (!entry) {
                  entry = {
                    id: tc.id ?? `call_${idx}`,
                    name: tc.function?.name ?? '',
                    argsBuffer: '',
                  };
                  toolCallsByIndex.set(idx, entry);
                }
                if (tc.id && !entry.id) entry.id = tc.id;
                if (tc.function?.name) entry.name = tc.function.name;
                if (tc.function?.arguments) {
                  entry.argsBuffer += tc.function.arguments;
                  controller.enqueue({
                    type: 'tool-call-delta',
                    toolCallId: entry.id,
                    toolName: entry.name,
                    argsDelta: tc.function.arguments,
                  });
                }
              }
            }

            if (choice.finish_reason) {
              finish = mapFinishReason(choice.finish_reason);
            }
            if (chunk.usage) usage = mapUsage(chunk.usage);
          }

          for (const entry of toolCallsByIndex.values()) {
            controller.enqueue({
              type: 'tool-call',
              toolCallId: entry.id,
              toolName: entry.name,
              args: safeParseJSON(entry.argsBuffer),
            });
          }

          controller.enqueue({
            type: 'finish',
            finishReason: finish,
            usage: usage ?? {},
          });
          controller.close();
        } catch (err) {
          controller.enqueue({ type: 'error', error: err });
          controller.close();
        }
      },
    });
  }

  /**
   * Pre-flight cost estimate. Conservative bounds: assumes the model fills
   * `maxTokens` for the upper bound, and emits ~16 tokens for the lower
   * bound. Returns `pricingAvailable: false` when the SDK has no row for
   * this model id — Budget Guard will then skip USD pre-flight enforcement.
   */
  estimateCost(options: ModelCallOptions): CostEstimate {
    const inputTokens = estimateTokensFromMessages(asChatMessages(options.messages));
    const maxOut = options.maxTokens ?? defaultOutputCap(this.modelId);
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

  private buildBody(options: ModelCallOptions, stream: boolean): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: this.modelId,
      messages: options.messages.map(toOpenAIMessage),
    };
    if (stream) {
      body.stream = true;
      body.stream_options = { include_usage: true };
    }
    if (options.tools?.length) {
      body.tools = options.tools.map((t) => ({
        type: 'function',
        function: {
          name: t.name,
          ...(t.description !== undefined ? { description: t.description } : {}),
          parameters: t.parameters,
        },
      }));
    }
    if (options.toolChoice !== undefined) {
      if (typeof options.toolChoice === 'string') {
        body.tool_choice = options.toolChoice;
      } else {
        body.tool_choice = {
          type: 'function',
          function: { name: options.toolChoice.toolName },
        };
      }
    }
    if (options.temperature !== undefined) body.temperature = options.temperature;
    if (options.topP !== undefined) body.top_p = options.topP;
    if (options.maxTokens !== undefined) body.max_tokens = options.maxTokens;
    if (options.stopSequences !== undefined) body.stop = options.stopSequences;
    if (options.seed !== undefined) body.seed = options.seed;
    if (options.providerOptions) Object.assign(body, options.providerOptions);
    return body;
  }

  private async fetch(path: string, body: unknown, options: ModelCallOptions): Promise<Response> {
    const url = `${this.config.baseURL}${path}`;
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
        message: `OpenAI API error: ${res.status} ${res.statusText}`,
        url,
        statusCode: res.status,
        responseBody: text,
      });
    }
    return res;
  }
}

function uint8ToBase64(arr: Uint8Array): string {
  let s = '';
  for (let i = 0; i < arr.byteLength; i++) s += String.fromCharCode(arr[i] as number);
  return typeof btoa !== 'undefined' ? btoa(s) : Buffer.from(s, 'binary').toString('base64');
}

function openAiAudioFormat(mime?: string): 'wav' | 'mp3' | null {
  const m = (mime ?? '').toLowerCase();
  if (m.includes('wav')) return 'wav';
  if (m.includes('mp3') || m.includes('mpeg')) return 'mp3';
  return null;
}

function openAiGuessFilename(mime?: string): string {
  const m = (mime ?? '').toLowerCase();
  if (m.includes('pdf')) return 'document.pdf';
  if (m.includes('plain')) return 'document.txt';
  return 'document.bin';
}

function mapOpenAiUserContentPart(p: ContentPart): unknown {
  if (p.type === 'text') return { type: 'text', text: p.text };
  if (p.type === 'image') {
    const url =
      typeof p.image === 'string'
        ? p.image
        : p.image instanceof URL
          ? p.image.toString()
          : `data:${p.mimeType ?? 'image/png'};base64,${uint8ToBase64(p.image)}`;
    return { type: 'image_url', image_url: { url } };
  }
  if (p.type === 'audio') {
    const r = resolveMediaInput(p.audio);
    if ('url' in r) {
      throw new UnsupportedPartError({
        partType: 'audio',
        provider: 'openai',
        message:
          'OpenAI `input_audio` requires inline WAV/MP3 as a Uint8Array or a `data:` URL. The SDK does not fetch remote URLs.',
      });
    }
    const fmt = openAiAudioFormat(r.mimeType ?? p.mimeType);
    if (!fmt) {
      throw new UnsupportedPartError({
        partType: 'audio',
        provider: 'openai',
        message: `OpenAI supports input_audio with format "wav" or "mp3" only (got mime "${r.mimeType ?? p.mimeType ?? 'unknown'}").`,
      });
    }
    return { type: 'input_audio', input_audio: { data: r.base64, format: fmt } };
  }
  if (p.type === 'file') {
    if (typeof p.file === 'string' && p.file.startsWith('file-')) {
      return {
        type: 'file',
        file: {
          file_id: p.file,
          ...(p.filename !== undefined ? { filename: p.filename } : {}),
        },
      };
    }
    const r = resolveMediaInput(p.file);
    if ('url' in r) {
      throw new UnsupportedPartError({
        partType: 'file',
        provider: 'openai',
        message:
          'OpenAI file parts need a Files API id (`file-…`), or inline bytes / a base64 `data:` URL. The SDK does not fetch remote URLs.',
      });
    }
    return {
      type: 'file',
      file: {
        file_data: r.base64,
        filename: p.filename ?? openAiGuessFilename(r.mimeType ?? p.mimeType),
      },
    };
  }
  if (p.type === 'video') {
    throw new UnsupportedPartError({
      partType: 'video',
      provider: 'openai',
      message:
        'Video `UserMessage` parts are reserved (RFC 0014) — the OpenAI chat adapter does not map them yet.',
    });
  }
  throw new UnsupportedPartError({
    partType: (p as { type?: string }).type ?? 'unknown',
    provider: 'openai',
    message: 'Unexpected content part in user message.',
  });
}

function toOpenAIMessage(m: NormalizedMessage): unknown {
  switch (m.role) {
    case 'system': {
      const text = m.content
        .filter((p) => p.type === 'text')
        .map((p) => (p as { text: string }).text)
        .join('');
      return { role: 'system', content: text };
    }
    case 'user': {
      const allText = m.content.every((p) => p.type === 'text');
      if (allText) {
        return {
          role: 'user',
          content: m.content.map((p) => (p as { text: string }).text).join(''),
        };
      }
      return {
        role: 'user',
        content: m.content.map((p) => mapOpenAiUserContentPart(p)),
      };
    }
    case 'assistant': {
      const toolCalls = m.content.filter((p) => p.type === 'tool-call');
      const text = m.content
        .filter((p) => p.type === 'text')
        .map((p) => (p as { text: string }).text)
        .join('');
      const out: Record<string, unknown> = { role: 'assistant', content: text || null };
      if (toolCalls.length > 0) {
        out.tool_calls = toolCalls.map((tc) => ({
          id: (tc as ToolCallPart).toolCallId,
          type: 'function',
          function: {
            name: (tc as ToolCallPart).toolName,
            arguments: JSON.stringify((tc as ToolCallPart).args ?? {}),
          },
        }));
      }
      return out;
    }
    case 'tool': {
      // OpenAI requires one tool message per result.
      // The caller will need to flatten before passing. We pick the first.
      const first = m.content[0];
      if (!first || first.type !== 'tool-result') {
        return { role: 'tool', content: '', tool_call_id: '' };
      }
      return {
        role: 'tool',
        content: typeof first.result === 'string' ? first.result : JSON.stringify(first.result),
        tool_call_id: first.toolCallId,
      };
    }
  }
}

/**
 * Bridge `NormalizedMessage[]` (always `ContentPart[]`) to the public
 * `ChatMessage[]` shape `estimateTokensFromMessages` accepts. The estimator
 * only inspects `role` + `content`, so the structural cast is safe.
 */
function asChatMessages(
  messages: NormalizedMessage[],
): Parameters<typeof estimateTokensFromMessages>[0] {
  return messages as unknown as Parameters<typeof estimateTokensFromMessages>[0];
}

/**
 * Default output token cap when the caller didn't pass `maxTokens`. Mirrors
 * OpenAI's typical model defaults; intentionally generous so pre-flight
 * over- rather than underestimates.
 */
function defaultOutputCap(modelId: string): number {
  if (modelId.startsWith('o1') || modelId.startsWith('o3')) return 100_000;
  if (modelId.startsWith('gpt-5')) return 32_768;
  return 16_384;
}

function safeParseJSON(text: string): unknown {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function mapFinishReason(reason: string | null | undefined): FinishReason {
  switch (reason) {
    case 'stop':
      return 'stop';
    case 'length':
      return 'length';
    case 'tool_calls':
    case 'function_call':
      return 'tool-calls';
    case 'content_filter':
      return 'content-filter';
    case null:
    case undefined:
      return 'unknown';
    default:
      return 'other';
  }
}

function mapUsage(u: OpenAIUsage | undefined): TokenUsage {
  if (!u) return {};
  const out: TokenUsage = {};
  if (u.prompt_tokens !== undefined) out.promptTokens = u.prompt_tokens;
  if (u.completion_tokens !== undefined) out.completionTokens = u.completion_tokens;
  if (u.total_tokens !== undefined) out.totalTokens = u.total_tokens;
  if (u.prompt_tokens_details?.cached_tokens !== undefined) {
    out.cachedPromptTokens = u.prompt_tokens_details.cached_tokens;
  }
  if (u.completion_tokens_details?.reasoning_tokens !== undefined) {
    out.reasoningTokens = u.completion_tokens_details.reasoning_tokens;
  }
  return out;
}

interface OpenAIUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
  completion_tokens_details?: { reasoning_tokens?: number };
}

interface OpenAIChatCompletion {
  choices?: Array<{
    message?: {
      content?: string;
      tool_calls?: Array<{
        id: string;
        function: { name: string; arguments: string };
      }>;
    };
    finish_reason?: string | null;
  }>;
  usage?: OpenAIUsage;
}

interface OpenAIChatChunk {
  choices?: Array<{
    delta?: {
      content?: string;
      tool_calls?: Array<{
        index: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
    finish_reason?: string | null;
  }>;
  usage?: OpenAIUsage;
}
