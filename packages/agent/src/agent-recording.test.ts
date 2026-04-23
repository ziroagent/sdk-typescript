import { createMockLanguageModel } from '@ziro-agent/core/testing';
import { defineTool } from '@ziro-agent/tools';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createAgent } from './agent.js';
import {
  createReplayModelFromAgentRecording,
  createReplayToolsFromAgentRecording,
  parseAgentRecordingJsonl,
  replayAgentFromRecordingJsonl,
  runWithAgentRecording,
} from './agent-recording.js';

describe('agent recording / replay', () => {
  it('records and replays a two-step tool run', async () => {
    let gen = 0;
    const model = createMockLanguageModel({
      modelId: 'seq',
      async generate() {
        gen += 1;
        if (gen === 1) {
          return {
            text: '',
            content: [
              {
                type: 'tool-call',
                toolCallId: 'call-1',
                toolName: 'ping',
                args: { n: 1 },
              },
            ],
            toolCalls: [
              {
                type: 'tool-call',
                toolCallId: 'call-1',
                toolName: 'ping',
                args: { n: 1 },
              },
            ],
            finishReason: 'tool-calls',
            usage: { promptTokens: 1, completionTokens: 0, totalTokens: 1 },
          };
        }
        return {
          text: 'all good',
          content: [{ type: 'text', text: 'all good' }],
          toolCalls: [],
          finishReason: 'stop',
          usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
        };
      },
    });

    const ping = defineTool({
      name: 'ping',
      input: z.object({ n: z.number() }),
      mutates: false,
      requiresApproval: false,
      execute: async ({ n }) => ({ pong: n + 1 }),
    });

    const agent = createAgent({
      model,
      tools: { ping },
      maxSteps: 5,
    });

    const chunks: string[] = [];
    const result = await runWithAgentRecording(agent, {
      prompt: 'hi',
      recording: { writeLine: (line) => chunks.push(line) },
    });

    expect(result.text).toBe('all good');
    const jsonl = chunks.join('');
    const lines = parseAgentRecordingJsonl(jsonl);
    expect(lines.length).toBe(2);

    const replayAgent = createAgent({
      model: createReplayModelFromAgentRecording(lines, { modelId: 'replay' }),
      tools: createReplayToolsFromAgentRecording(lines),
      maxSteps: 5,
    });

    const replayed = await replayAgent.run({ prompt: 'ignored' });
    expect(replayed.text).toBe('all good');
    expect(replayed.steps.length).toBe(2);

    const viaSugar = await replayAgentFromRecordingJsonl(
      jsonl,
      { maxSteps: 5 },
      { prompt: 'ignored' },
    );
    expect(viaSugar.text).toBe('all good');
  });
});
