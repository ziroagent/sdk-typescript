import { defineRecordingRegressionEval, exactMatch } from '@ziro-agent/eval';

const recordingJsonl =
  '{"v":1,"kind":"step","step":{"index":0,"text":"refund approved for order 42","content":[],"toolCalls":[],"toolResults":[],"finishReason":"stop","usage":{"totalTokens":12}}}';

export default defineRecordingRegressionEval({
  name: 'recording-regression-smoke',
  recordingJsonl,
  prompt: 'Refund order 42',
  run: async () => 'refund approved for order 42',
  graders: [exactMatch()],
  gate: { kind: 'meanScore', min: 1 },
});
