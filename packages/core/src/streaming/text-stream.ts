import type { ContentPart, ToolCallPart } from '../types/content.js';
import type { FinishReason } from '../types/finish-reason.js';
import type { ModelStreamPart } from '../types/model.js';
import { addUsage, emptyUsage, type TokenUsage } from '../types/usage.js';

export interface StreamTextResult {
  /** A `ReadableStream` of just the text deltas (UTF-8 friendly). */
  readonly textStream: ReadableStream<string>;
  /** A `ReadableStream` of all model events (text deltas, tool calls, finish, error). */
  readonly fullStream: ReadableStream<ModelStreamPart>;
  /** Async-iterable convenience wrapper around `textStream`. */
  toTextIterable(): AsyncIterable<string>;
  /** Resolves to the full concatenated text once the stream completes. */
  text(): Promise<string>;
  /** Resolves to the final `finishReason` once the stream completes. */
  finishReason(): Promise<FinishReason>;
  /** Resolves to the final aggregated `TokenUsage`. */
  usage(): Promise<TokenUsage>;
  /** All emitted tool calls, accumulated from `tool-call` events. */
  toolCalls(): Promise<ToolCallPart[]>;
  /** Final structured content (text + tool calls), reconstructed from deltas. */
  content(): Promise<ContentPart[]>;
}

interface BuildOptions {
  source: ReadableStream<ModelStreamPart>;
  onError?: (err: unknown) => void;
}

/**
 * Wrap a raw provider stream into the high-level `StreamTextResult` users get
 * back from `streamText()`. A single internal pump drains the source exactly
 * once and fans out to every consumer (text-only stream, full event stream,
 * aggregate promises). This avoids the `ReadableStream.tee()` dead-lock where
 * an unread branch blocks the other branch's progress.
 */
export function buildStreamTextResult({ source, onError }: BuildOptions): StreamTextResult {
  let resolveText: (v: string) => void = () => {};
  let resolveFinish: (v: FinishReason) => void = () => {};
  let resolveUsage: (v: TokenUsage) => void = () => {};
  let resolveToolCalls: (v: ToolCallPart[]) => void = () => {};
  let rejectAggregates: (err: unknown) => void = () => {};

  const textPromise = new Promise<string>((res, rej) => {
    resolveText = res;
    rejectAggregates = rej;
  });
  const finishPromise = new Promise<FinishReason>((res) => {
    resolveFinish = res;
  });
  const usagePromise = new Promise<TokenUsage>((res) => {
    resolveUsage = res;
  });
  const toolCallsPromise = new Promise<ToolCallPart[]>((res) => {
    resolveToolCalls = res;
  });

  let collectedText = '';
  let collectedUsage: TokenUsage = emptyUsage();
  let collectedFinish: FinishReason = 'unknown';
  const collectedToolCalls: ToolCallPart[] = [];

  const textControllers = new Set<ReadableStreamDefaultController<string>>();
  const fullControllers = new Set<ReadableStreamDefaultController<ModelStreamPart>>();

  let pumpStarted = false;
  const startPump = () => {
    if (pumpStarted) return;
    pumpStarted = true;
    void (async () => {
      const reader = source.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          switch (value.type) {
            case 'text-delta':
              collectedText += value.textDelta;
              for (const c of textControllers) c.enqueue(value.textDelta);
              break;
            case 'tool-call':
              collectedToolCalls.push({
                type: 'tool-call',
                toolCallId: value.toolCallId,
                toolName: value.toolName,
                args: value.args,
              });
              break;
            case 'finish':
              collectedFinish = value.finishReason;
              collectedUsage = addUsage(collectedUsage, value.usage);
              break;
            case 'error':
              onError?.(value.error);
              break;
          }
          for (const c of fullControllers) c.enqueue(value);
        }
        for (const c of textControllers) c.close();
        for (const c of fullControllers) c.close();
        resolveText(collectedText);
        resolveFinish(collectedFinish);
        resolveUsage(collectedUsage);
        resolveToolCalls(collectedToolCalls);
      } catch (err) {
        for (const c of textControllers) c.error(err);
        for (const c of fullControllers) c.error(err);
        rejectAggregates(err);
        onError?.(err);
      } finally {
        reader.releaseLock();
      }
    })();
  };

  const textStream = new ReadableStream<string>({
    start(c) {
      textControllers.add(c);
      startPump();
    },
    cancel() {
      textControllers.clear();
    },
  });

  const fullStream = new ReadableStream<ModelStreamPart>({
    start(c) {
      fullControllers.add(c);
      startPump();
    },
    cancel() {
      fullControllers.clear();
    },
  });

  return {
    fullStream,
    textStream,
    toTextIterable() {
      return readableToAsyncIterable(textStream);
    },
    text: () => {
      startPump();
      return textPromise;
    },
    finishReason: () => {
      startPump();
      return finishPromise;
    },
    usage: () => {
      startPump();
      return usagePromise;
    },
    toolCalls: () => {
      startPump();
      return toolCallsPromise;
    },
    async content(): Promise<ContentPart[]> {
      startPump();
      const text = await textPromise;
      const toolCalls = await toolCallsPromise;
      const out: ContentPart[] = [];
      if (text.length > 0) out.push({ type: 'text', text });
      out.push(...toolCalls);
      return out;
    },
  };
}

async function* readableToAsyncIterable<T>(stream: ReadableStream<T>): AsyncIterable<T> {
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return;
      yield value;
    }
  } finally {
    reader.releaseLock();
  }
}
