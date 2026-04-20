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
  type TokenUsage,
  type ToolCallPart,
} from '@ziro-agent/core';
import { parseNDJSON } from './util/ndjson.js';

/**
 * Common Ollama model ids. Ollama is open-weight and the catalogue
 * grows weekly, so we leave the type open via `(string & {})` — pulling
 * a model is `ollama pull <name>` and any tag works.
 *
 * The enumerated entries are the most-pulled tool-capable models on
 * ollama.com as of v0.1.9. They are deliberately conservative — listing
 * every quant would explode the union without changing runtime behaviour.
 */
export type OllamaChatModelId =
  | 'llama3.1'
  | 'llama3.1:8b'
  | 'llama3.1:70b'
  | 'llama3.2'
  | 'llama3.2:3b'
  | 'llama3.3'
  | 'qwen2.5'
  | 'qwen2.5:7b'
  | 'qwen2.5:14b'
  | 'qwen2.5:32b'
  | 'qwen2.5-coder'
  | 'mistral'
  | 'mistral-nemo'
  | 'mixtral'
  | 'gemma3'
  | 'phi4'
  | (string & {});

interface OllamaChatModelConfig {
  modelId: OllamaChatModelId;
  baseURL: string;
  headers: Record<string, string>;
  fetcher: typeof fetch;
  /** Forwarded into Ollama's per-request `options` block. */
  defaultOptions?: Record<string, unknown>;
}

/**
 * `LanguageModel` adapter for the local Ollama HTTP API
 * (`http://localhost:11434/api/chat`). Talks the native Ollama protocol
 * (NDJSON streaming, function-calling shape) — not the OpenAI-compat
 * shim, which loses tool-call fidelity on several models.
 *
 * Sovereign-pillar primitive (RFC 0004 §v0.1.9): an open-weight default
 * provider so the SDK is not assumed-cloud-only.
 */
export class OllamaChatModel implements LanguageModel {
  readonly provider = 'ollama';
  readonly modelId: string;
  private readonly config: OllamaChatModelConfig;

  constructor(config: OllamaChatModelConfig) {
    this.modelId = config.modelId;
    this.config = config;
  }

  async generate(options: ModelCallOptions): Promise<ModelGenerateResult> {
    const body = this.buildBody(options, false);
    const res = await this.fetch('/api/chat', body, options);
    const json = (await res.json()) as OllamaChatResponse;

    const text = json.message?.content ?? '';
    const toolCalls: ToolCallPart[] =
      json.message?.tool_calls?.map((tc, i) => ({
        type: 'tool-call' as const,
        toolCallId: synthesizeToolCallId(tc.function?.name ?? 'unknown', i),
        toolName: tc.function?.name ?? '',
        args: tc.function?.arguments ?? {},
      })) ?? [];

    return {
      text,
      content: [...(text.length > 0 ? [{ type: 'text' as const, text }] : []), ...toolCalls],
      toolCalls,
      finishReason: mapFinishReason(json),
      usage: mapUsage(json),
      rawResponse: json,
    };
  }

  async stream(options: ModelCallOptions): Promise<ReadableStream<ModelStreamPart>> {
    const body = this.buildBody(options, true);
    const res = await this.fetch('/api/chat', body, options);
    if (!res.body) {
      throw new APICallError({
        message: 'Ollama streaming response has no body.',
        statusCode: res.status,
      });
    }

    const ndjson = parseNDJSON<OllamaChatResponse>(res.body);

    return new ReadableStream<ModelStreamPart>({
      async start(controller) {
        let usage: TokenUsage | undefined;
        let finish: FinishReason = 'unknown';
        let toolIdx = 0;

        try {
          for await (const chunk of ndjson) {
            if (chunk.message?.content) {
              controller.enqueue({ type: 'text-delta', textDelta: chunk.message.content });
            }
            if (chunk.message?.tool_calls) {
              for (const tc of chunk.message.tool_calls) {
                const id = synthesizeToolCallId(tc.function?.name ?? 'unknown', toolIdx++);
                // Ollama emits each tool call complete (no incremental
                // arg streaming), so we forward the full call directly
                // — matching the OpenAI provider's terminal `tool-call`
                // event shape.
                controller.enqueue({
                  type: 'tool-call',
                  toolCallId: id,
                  toolName: tc.function?.name ?? '',
                  args: tc.function?.arguments ?? {},
                });
              }
            }
            if (chunk.done) {
              finish = mapFinishReason(chunk);
              usage = mapUsage(chunk);
            }
          }
          controller.enqueue({ type: 'finish', finishReason: finish, usage: usage ?? {} });
          controller.close();
        } catch (err) {
          controller.enqueue({ type: 'error', error: err });
          controller.close();
        }
      },
    });
  }

  /**
   * Local models are free at runtime — their cost is electricity / GPU
   * time, not per-token billing. We report `pricingAvailable: true`
   * with `$0` so `Budget Guard.maxUsd` constraints simply never trip
   * for Ollama runs (instead of being silently disabled, which would
   * surprise callers migrating from OpenAI).
   *
   * `maxTokens`, `maxLlmCalls`, `maxDurationMs`, and `maxSteps` budgets
   * keep working as documented — those are the meaningful limits when
   * GPU time is the bottleneck.
   */
  estimateCost(options: ModelCallOptions): CostEstimate {
    const inputTokens = estimateTokensFromMessages(asChatMessages(options.messages));
    const maxOut = options.maxTokens ?? 8_192;
    const minOut = Math.min(16, maxOut);
    return {
      minTokens: inputTokens + minOut,
      maxTokens: inputTokens + maxOut,
      minUsd: 0,
      maxUsd: 0,
      pricingAvailable: true,
    };
  }

  private buildBody(options: ModelCallOptions, stream: boolean): Record<string, unknown> {
    const ollamaOptions: Record<string, unknown> = {
      ...(this.config.defaultOptions ?? {}),
    };
    if (options.temperature !== undefined) ollamaOptions.temperature = options.temperature;
    if (options.topP !== undefined) ollamaOptions.top_p = options.topP;
    if (options.maxTokens !== undefined) ollamaOptions.num_predict = options.maxTokens;
    if (options.stopSequences !== undefined) ollamaOptions.stop = options.stopSequences;
    if (options.seed !== undefined) ollamaOptions.seed = options.seed;

    const body: Record<string, unknown> = {
      model: this.modelId,
      messages: options.messages.map(toOllamaMessage),
      stream,
    };
    if (Object.keys(ollamaOptions).length > 0) body.options = ollamaOptions;
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
        message: `Ollama API error: ${res.status} ${res.statusText}`,
        url,
        statusCode: res.status,
        responseBody: text,
      });
    }
    return res;
  }
}

function toOllamaMessage(m: NormalizedMessage): unknown {
  switch (m.role) {
    case 'system':
    case 'user': {
      const text = m.content
        .filter((p) => p.type === 'text')
        .map((p) => (p as { text: string }).text)
        .join('');
      const images = m.content
        .filter((p) => p.type === 'image')
        .map((p) => {
          const img = (p as { image: string | URL | Uint8Array }).image;
          if (typeof img === 'string') return img.replace(/^data:[^;]+;base64,/, '');
          if (img instanceof URL) return img.toString();
          return uint8ToBase64(img);
        });
      const out: Record<string, unknown> = { role: m.role, content: text };
      if (images.length > 0) out.images = images;
      return out;
    }
    case 'assistant': {
      const text = m.content
        .filter((p) => p.type === 'text')
        .map((p) => (p as { text: string }).text)
        .join('');
      const toolCalls = m.content.filter((p) => p.type === 'tool-call');
      const out: Record<string, unknown> = { role: 'assistant', content: text };
      if (toolCalls.length > 0) {
        out.tool_calls = toolCalls.map((tc) => ({
          function: {
            name: (tc as ToolCallPart).toolName,
            arguments: (tc as ToolCallPart).args ?? {},
          },
        }));
      }
      return out;
    }
    case 'tool': {
      const first = m.content[0];
      if (!first || first.type !== 'tool-result') {
        return { role: 'tool', content: '' };
      }
      return {
        role: 'tool',
        content: typeof first.result === 'string' ? first.result : JSON.stringify(first.result),
      };
    }
  }
}

/**
 * Ollama's `tool_calls[]` entries don't carry a stable id — they're
 * just `{ function: { name, arguments } }`. We synthesise an id so the
 * downstream agent loop can match tool results back to calls without
 * collisions across a batch.
 */
function synthesizeToolCallId(name: string, index: number): string {
  return `ollama_${name}_${index}_${Math.random().toString(36).slice(2, 8)}`;
}

function asChatMessages(
  messages: NormalizedMessage[],
): Parameters<typeof estimateTokensFromMessages>[0] {
  return messages as unknown as Parameters<typeof estimateTokensFromMessages>[0];
}

function uint8ToBase64(arr: Uint8Array): string {
  let s = '';
  for (let i = 0; i < arr.byteLength; i++) s += String.fromCharCode(arr[i] as number);
  return typeof btoa !== 'undefined' ? btoa(s) : Buffer.from(s, 'binary').toString('base64');
}

function mapFinishReason(json: OllamaChatResponse): FinishReason {
  if (json.message?.tool_calls?.length) return 'tool-calls';
  if (json.done_reason === 'stop' || json.done) return 'stop';
  if (json.done_reason === 'length') return 'length';
  return 'unknown';
}

function mapUsage(json: OllamaChatResponse): TokenUsage {
  const out: TokenUsage = {};
  if (json.prompt_eval_count !== undefined) out.promptTokens = json.prompt_eval_count;
  if (json.eval_count !== undefined) out.completionTokens = json.eval_count;
  if (json.prompt_eval_count !== undefined && json.eval_count !== undefined) {
    out.totalTokens = json.prompt_eval_count + json.eval_count;
  }
  return out;
}

interface OllamaChatResponse {
  model?: string;
  created_at?: string;
  message?: {
    role?: string;
    content?: string;
    tool_calls?: Array<{
      function?: {
        name?: string;
        arguments?: Record<string, unknown>;
      };
    }>;
  };
  done?: boolean;
  done_reason?: 'stop' | 'length' | 'load' | string;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}
