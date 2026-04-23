import { readFile } from 'node:fs/promises';

import type { AgentRunOptions, AgentRunResult } from '../agent.js';
import {
  type ReplayAgentFromRecordingAgentOptions,
  replayAgentFromRecordingJsonl,
} from '../agent-recording.js';

/**
 * Read a JSONL agent recording from disk and {@link replayAgentFromRecordingJsonl}.
 *
 * **Node-only** — import from `@ziro-agent/agent/node`, not the browser-safe
 * main entry.
 */
export async function replayAgentRunFromRecordingFile(
  recordingPath: string,
  agentOptions: ReplayAgentFromRecordingAgentOptions,
  runOptions: AgentRunOptions,
): Promise<AgentRunResult> {
  const jsonl = await readFile(recordingPath, 'utf8');
  return replayAgentFromRecordingJsonl(jsonl, agentOptions, runOptions);
}
