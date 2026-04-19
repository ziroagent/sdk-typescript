/**
 * Why the model stopped producing output.
 */
export type FinishReason =
  | 'stop'
  | 'length'
  | 'tool-calls'
  | 'content-filter'
  | 'error'
  | 'other'
  | 'unknown';
