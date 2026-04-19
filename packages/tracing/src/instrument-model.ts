import type {
  LanguageModel,
  ModelCallOptions,
  ModelGenerateResult,
  ModelStreamPart,
} from '@ziro-ai/core';
import { ATTR } from './attributes.js';
import { getTracer } from './tracer.js';

/**
 * Wrap a {@link LanguageModel} so every `generate` and `stream` call opens
 * an OpenTelemetry span ("gen_ai.<provider>.<operation>") with the GenAI
 * semantic-convention attributes.
 *
 * No-op when no OTel tracer is registered.
 */
export function instrumentModel(model: LanguageModel): LanguageModel {
  return {
    modelId: model.modelId,
    provider: model.provider,

    async generate(options: ModelCallOptions): Promise<ModelGenerateResult> {
      const tracer = getTracer();
      return tracer.withSpan(
        `gen_ai.${model.provider}.chat`,
        async (span) => {
          span.setAttributes(buildRequestAttrs(model, options, 'chat'));
          const result = await model.generate(options);
          span.setAttributes(buildResponseAttrs(result));
          return result;
        },
        { kind: 'client' },
      );
    },

    async stream(options: ModelCallOptions): Promise<ReadableStream<ModelStreamPart>> {
      const tracer = getTracer();
      const span = tracer.startSpan(`gen_ai.${model.provider}.chat.stream`, {
        kind: 'client',
        attributes: buildRequestAttrs(model, options, 'chat'),
      });
      try {
        const upstream = await model.stream(options);
        return upstream.pipeThrough(
          new TransformStream<ModelStreamPart, ModelStreamPart>({
            transform(part, controller) {
              if (part.type === 'finish') {
                span.setAttributes({
                  [ATTR.GenAiResponseFinishReasons]: [part.finishReason],
                  ...numAttr(ATTR.GenAiUsagePromptTokens, part.usage.promptTokens),
                  ...numAttr(ATTR.GenAiUsageCompletionTokens, part.usage.completionTokens),
                  ...numAttr(ATTR.GenAiUsageTotalTokens, part.usage.totalTokens),
                });
              } else if (part.type === 'error') {
                span.recordException(part.error);
                span.setStatus({
                  code: 2,
                  message: part.error instanceof Error ? part.error.message : String(part.error),
                });
              }
              controller.enqueue(part);
            },
            flush() {
              span.setStatus({ code: 1 });
              span.end();
            },
          }),
        );
      } catch (err) {
        span.recordException(err);
        span.setStatus({ code: 2, message: err instanceof Error ? err.message : String(err) });
        span.end();
        throw err;
      }
    },
  };
}

function buildRequestAttrs(
  model: LanguageModel,
  options: ModelCallOptions,
  operation: string,
) {
  return {
    [ATTR.GenAiSystem]: model.provider,
    [ATTR.GenAiOperationName]: operation,
    [ATTR.GenAiRequestModel]: model.modelId,
    ...numAttr(ATTR.GenAiRequestTemperature, options.temperature),
    ...numAttr(ATTR.GenAiRequestMaxTokens, options.maxTokens),
  };
}

function buildResponseAttrs(result: ModelGenerateResult) {
  return {
    [ATTR.GenAiResponseFinishReasons]: [result.finishReason],
    ...numAttr(ATTR.GenAiUsagePromptTokens, result.usage.promptTokens),
    ...numAttr(ATTR.GenAiUsageCompletionTokens, result.usage.completionTokens),
    ...numAttr(ATTR.GenAiUsageTotalTokens, result.usage.totalTokens),
  };
}

function numAttr(key: string, value: number | undefined): Record<string, number> {
  return value === undefined ? {} : { [key]: value };
}
