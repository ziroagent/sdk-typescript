import {
  APICallError,
  type FinishReason,
  type LanguageModel,
  type ModelCallOptions,
  type ModelGenerateResult,
  type ModelStreamPart,
  type NormalizedMessage,
  type TokenUsage,
  type ToolCallPart,
} from '@ziro-agent/core';
import { parseSSE } from './util/sse.js';

/**
 * The set of OpenAI chat model ids we explicitly know about. Other strings are
 * still allowed via the `(string & {})` trick — we don't want to lock users out
 * when OpenAI ships a new model before we update the SDK.
 */
export type OpenAIChatModelId =
  | 'gpt-4o'
  | 'gpt-4o-mini'
  | 'gpt-4.1'
  | 'gpt-4.1-mini'
  | 'gpt-4.1-nano'
  | 'gpt-4-turbo'
  | 'gpt-3.5-turbo'
  | 'o1'
  | 'o1-mini'
  | 'o3'
  | 'o3-mini'
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
        content: m.content.map((p) => {
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
          return p;
        }),
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

function uint8ToBase64(arr: Uint8Array): string {
  let s = '';
  for (let i = 0; i < arr.byteLength; i++) s += String.fromCharCode(arr[i] as number);
  return typeof btoa !== 'undefined' ? btoa(s) : Buffer.from(s, 'binary').toString('base64');
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
