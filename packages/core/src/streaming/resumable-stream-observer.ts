export interface ResumableStreamEvent {
  phase:
    | 'replay_start'
    | 'replay_end'
    | 'continue_lock_acquired'
    | 'continue_lock_released'
    | 'continue_upstream_start'
    | 'continue_upstream_end'
    | 'continue_upstream_skipped_completed';
  resumeKey: string;
  replayCount?: number;
}

export interface ResumableStreamObserver {
  onEvent?(event: ResumableStreamEvent): void | Promise<void>;
}

let observer: ResumableStreamObserver | null = null;

export function setResumableStreamObserver(next: ResumableStreamObserver | null): void {
  observer = next;
}

export function fireResumableStreamEvent(event: ResumableStreamEvent): void {
  if (!observer?.onEvent) return;
  try {
    void observer.onEvent(event);
  } catch {
    // Instrumentation hooks must never break stream execution.
  }
}
