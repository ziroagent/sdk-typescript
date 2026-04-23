import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMockLanguageModel } from '@ziro-agent/core/testing';
import { defineTool } from '@ziro-agent/tools';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createAgent } from '../agent.js';
import { runWithAgentRecording } from '../agent-recording.js';
import { replayAgentRunFromRecordingFile } from './recording-file.js';

describe('replayAgentRunFromRecordingFile', () => {
  it('replays from a JSONL file path', async () => {
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
          text: 'done',
          content: [{ type: 'text', text: 'done' }],
          toolCalls: [],
          finishReason: 'stop',
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        };
      },
    });
    const ping = defineTool({
      name: 'ping',
      input: z.object({ n: z.number() }),
      mutates: false,
      requiresApproval: false,
      execute: async () => ({ ok: true }),
    });
    const agent = createAgent({ model, tools: { ping }, maxSteps: 5 });
    const dir = await mkdtemp(join(tmpdir(), 'ziro-rec-'));
    const file = join(dir, 'run.jsonl');
    const chunks: string[] = [];
    await runWithAgentRecording(agent, {
      prompt: 'x',
      recording: {
        writeLine: async (line) => {
          chunks.push(line);
          await writeFile(file, chunks.join(''), 'utf8');
        },
      },
    });
    const out = await replayAgentRunFromRecordingFile(file, { maxSteps: 5 }, { prompt: 'y' });
    expect(out.text).toBe('done');
  });
});
