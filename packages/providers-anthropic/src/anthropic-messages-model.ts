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
} from '@ziro-ai/core';
import { parseSSEWithEvent, type SSEEvent } from './util/sse.js';

export type AnthropicMessagesModelId =
  | 'claude-opus-4-1'
  | 'claude-opus-4'
  | 'claude-sonnet-4-5'
  | 'claude-sonnet-4'
  | 'claude-3-7-sonnet-latest'
  | 'claude-3-5-sonnet-latest'
  | 'claude-3-5-haiku-latest'
  | 'claude-3-haiku-20240307'
  | (string & {});

interface AnthropicMessagesModelConfig {
  modelId: AnthropicMessagesModelId;
  baseURL: string;
  headers: Record<string, string>;
  fetcher: typeof fetch;
}

export class AnthropicMessagesModel implements LanguageModel {
  readonly provider = 'anthropic';
  readonly modelId: string;
  private readonly config: AnthropicMessagesModelConfig;

  constructor(config: AnthropicMessagesModelConfig) {
    this.modelId = config.modelId;
    this.config = config;
  }

  async generate(options: ModelCallOptions): Promise<ModelGenerateResult> {
    const body = this.buildBody(options, false);
    const res = await this.fetch('/messages', body, options);
    const json = (await res.json()) as AnthropicMessageResponse;

    const text = (json.content ?? [])
      .filter((b) => b.type === 'text')
      .map((b) => (b as { text: string }).text)
      .join('');

    const toolCalls: ToolCallPart[] = (json.content ?? [])
      .filter((b) => b.type === 'tool_use')
      .map((b) => {
        const tu = b as { id: string; name: string; input: unknown };
        return { type: 'tool-call', toolCallId: tu.id, toolName: tu.name, args: tu.input };
      });

    return {
      text,
      content: [
        ...(text.length > 0 ? [{ type: 'text' as const, text }] : []),
        ...toolCalls,
      ],
      toolCalls,
      finishReason: mapFinishReason(json.stop_reason),
      usage: mapUsage(json.usage),
      rawResponse: json,
    };
  }

  async stream(options: ModelCallOptions): Promise<ReadableStream<ModelStreamPart>> {
    const body = this.buildBody(options, true);
    const res = await this.fetch('/messages', body, options);
    if (!res.body) {
      throw new APICallError({
        message: 'Anthropic streaming response has no body.',
        statusCode: res.status,
      });
    }

    const events = parseSSEWithEvent(res.body);

    return new ReadableStream<ModelStreamPart>({
      async start(controller) {
        const toolBlocks = new Map<number, { id: string; name: string; argsBuffer: string }>();
        let finish: FinishReason = 'unknown';
        let usage: TokenUsage = {};

        try {
          for await (const evt of events) {
            const data = parseEvent(evt);
            if (!data) continue;

            switch (data.type) {
              case 'message_start': {
                const msg = data.message as { usage?: AnthropicUsage } | undefined;
                if (msg?.usage) usage = mergeUsage(usage, mapUsage(msg.usage));
                break;
              }
              case 'content_block_start': {
                const block = data.content_block as
                  | { type: string; id?: string; name?: string }
                  | undefined;
                if (block?.type === 'tool_use' && typeof data.index === 'number') {
                  toolBlocks.set(data.index, {
                    id: block.id ?? `tu_${data.index}`,
                    name: block.name ?? '',
                    argsBuffer: '',
                  });
                }
                break;
              }
              case 'content_block_delta': {
                const delta = data.delta as
                  | { type: string; text?: string; partial_json?: string }
                  | undefined;
                if (delta?.type === 'text_delta' && delta.text) {
                  controller.enqueue({ type: 'text-delta', textDelta: delta.text });
                } else if (
                  delta?.type === 'input_json_delta' &&
                  typeof data.index === 'number' &&
                  delta.partial_json
                ) {
                  const tb = toolBlocks.get(data.index);
                  if (tb) {
                    tb.argsBuffer += delta.partial_json;
                    controller.enqueue({
                      type: 'tool-call-delta',
                      toolCallId: tb.id,
                      toolName: tb.name,
                      argsDelta: delta.partial_json,
                    });
                  }
                }
                break;
              }
              case 'message_delta': {
                const delta = data.delta as { stop_reason?: string } | undefined;
                if (delta?.stop_reason) finish = mapFinishReason(delta.stop_reason);
                if (data.usage) usage = mergeUsage(usage, mapUsage(data.usage as AnthropicUsage));
                break;
              }
              case 'message_stop': {
                break;
              }
            }
          }

          for (const tb of toolBlocks.values()) {
            controller.enqueue({
              type: 'tool-call',
              toolCallId: tb.id,
              toolName: tb.name,
              args: safeParseJSON(tb.argsBuffer),
            });
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

  private buildBody(options: ModelCallOptions, stream: boolean): Record<string, unknown> {
    const { system, messages } = splitSystem(options.messages);

    const body: Record<string, unknown> = {
      model: this.modelId,
      messages: messages.map(toAnthropicMessage),
      max_tokens: options.maxTokens ?? 4096,
    };
    if (system) body['system'] = system;
    if (stream) body['stream'] = true;
    if (options.tools?.length) {
      body['tools'] = options.tools.map((t) => ({
        name: t.name,
        ...(t.description !== undefined ? { description: t.description } : {}),
        input_schema: t.parameters,
      }));
    }
    if (options.toolChoice !== undefined) {
      if (options.toolChoice === 'required') body['tool_choice'] = { type: 'any' };
      else if (options.toolChoice === 'auto') body['tool_choice'] = { type: 'auto' };
      else if (options.toolChoice === 'none') {
        // Anthropic has no explicit "none" — skip.
      } else if (typeof options.toolChoice === 'object') {
        body['tool_choice'] = { type: 'tool', name: options.toolChoice.toolName };
      }
    }
    if (options.temperature !== undefined) body['temperature'] = options.temperature;
    if (options.topP !== undefined) body['top_p'] = options.topP;
    if (options.topK !== undefined) body['top_k'] = options.topK;
    if (options.stopSequences !== undefined) body['stop_sequences'] = options.stopSequences;
    if (options.providerOptions) Object.assign(body, options.providerOptions);
    return body;
  }

  private async fetch(
    path: string,
    body: unknown,
    options: ModelCallOptions,
  ): Promise<Response> {
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
        message: `Anthropic API error: ${res.status} ${res.statusText}`,
        url,
        statusCode: res.status,
        responseBody: text,
      });
    }
    return res;
  }
}

function splitSystem(messages: NormalizedMessage[]): {
  system?: string;
  messages: NormalizedMessage[];
} {
  const sys = messages.filter((m) => m.role === 'system');
  const rest = messages.filter((m) => m.role !== 'system');
  if (sys.length === 0) return { messages: rest };
  const text = sys
    .flatMap((m) => m.content)
    .filter((p) => p.type === 'text')
    .map((p) => (p as { text: string }).text)
    .join('\n');
  return { system: text, messages: rest };
}

function toAnthropicMessage(m: NormalizedMessage): unknown {
  switch (m.role) {
    case 'user': {
      const blocks = m.content.map((p) => {
        if (p.type === 'text') return { type: 'text', text: p.text };
        if (p.type === 'image') {
          if (typeof p.image === 'string' && p.image.startsWith('http')) {
            return { type: 'image', source: { type: 'url', url: p.image } };
          }
          if (typeof p.image === 'string') {
            return { type: 'image', source: { type: 'url', url: p.image } };
          }
          return {
            type: 'image',
            source: {
              type: 'base64',
              media_type: p.mimeType ?? 'image/png',
              data: uint8ToBase64(p.image as Uint8Array),
            },
          };
        }
        return p;
      });
      return { role: 'user', content: blocks };
    }
    case 'assistant': {
      const blocks = m.content.map((p) => {
        if (p.type === 'text') return { type: 'text', text: p.text };
        if (p.type === 'tool-call') {
          return { type: 'tool_use', id: p.toolCallId, name: p.toolName, input: p.args };
        }
        return p;
      });
      return { role: 'assistant', content: blocks };
    }
    case 'tool': {
      return {
        role: 'user',
        content: m.content
          .filter((r): r is Extract<typeof r, { type: 'tool-result' }> => r.type === 'tool-result')
          .map((r) => ({
            type: 'tool_result',
            tool_use_id: r.toolCallId,
            content: typeof r.result === 'string' ? r.result : JSON.stringify(r.result),
            ...(r.isError ? { is_error: true } : {}),
          })),
      };
    }
    case 'system':
      return { role: 'user', content: '' };
  }
}

function parseEvent(evt: SSEEvent): { type: string; [k: string]: unknown } | null {
  if (!evt.data) return null;
  try {
    return JSON.parse(evt.data) as { type: string };
  } catch {
    return null;
  }
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
    case 'end_turn':
      return 'stop';
    case 'max_tokens':
      return 'length';
    case 'tool_use':
      return 'tool-calls';
    case 'stop_sequence':
      return 'stop';
    case null:
    case undefined:
      return 'unknown';
    default:
      return 'other';
  }
}

interface AnthropicUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

function mapUsage(u: AnthropicUsage | undefined): TokenUsage {
  if (!u) return {};
  const promptTokens =
    (u.input_tokens ?? 0) +
    (u.cache_read_input_tokens ?? 0) +
    (u.cache_creation_input_tokens ?? 0);
  const out: TokenUsage = {
    promptTokens: u.input_tokens !== undefined ? promptTokens : undefined,
    completionTokens: u.output_tokens,
  };
  if (out.promptTokens !== undefined && out.completionTokens !== undefined) {
    out.totalTokens = out.promptTokens + out.completionTokens;
  }
  if (u.cache_read_input_tokens !== undefined) out.cachedPromptTokens = u.cache_read_input_tokens;
  return out;
}

function mergeUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  const sum = (x?: number, y?: number) =>
    x === undefined && y === undefined ? undefined : (x ?? 0) + (y ?? 0);
  return {
    promptTokens: sum(a.promptTokens, b.promptTokens),
    completionTokens: sum(a.completionTokens, b.completionTokens),
    totalTokens: sum(a.totalTokens, b.totalTokens),
    cachedPromptTokens: sum(a.cachedPromptTokens, b.cachedPromptTokens),
  };
}

function uint8ToBase64(arr: Uint8Array): string {
  let s = '';
  for (let i = 0; i < arr.byteLength; i++) s += String.fromCharCode(arr[i] as number);
  return typeof btoa !== 'undefined'
    ? btoa(s)
    : Buffer.from(s, 'binary').toString('base64');
}

interface AnthropicMessageResponse {
  content?: Array<
    | { type: 'text'; text: string }
    | { type: 'tool_use'; id: string; name: string; input: unknown }
  >;
  stop_reason?: string;
  usage?: AnthropicUsage;
}
