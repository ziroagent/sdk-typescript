import type { ModelStreamPart } from '../types/model.js';

export class ResumableStreamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResumableStreamError';
  }
}

/**
 * True when the model run for this `resumeKey` has emitted a terminal part
 * (`finish` or `error`). Used for RFC 0017 continue-upstream and observability.
 */
export function isTerminalModelStreamPart(part: ModelStreamPart): boolean {
  return part.type === 'finish' || part.type === 'error';
}

/** Snapshot of a resumable stream log (see {@link ResumableStreamEventStore.getSessionMeta}). */
export interface ResumableStreamSessionMeta {
  /** Monotonic; index of the next `append` for this key. */
  nextIndex: number;
  /** True once a terminal part (`finish` or `error`) has been stored. */
  completed: boolean;
  /** Milliseconds since epoch of the last successful `append`, if any. */
  updatedAt?: number;
}

export interface ResumableStreamContinueLock {
  resumeKey: string;
  token: string;
}

/**
 * Optional extension for stores that can coordinate single-writer continuation
 * across processes (RFC 0017 phase C).
 */
export interface ResumableStreamContinueLockStore {
  acquireContinueLock(resumeKey: string): Promise<ResumableStreamContinueLock>;
  releaseContinueLock(lock: ResumableStreamContinueLock): Promise<void>;
}

export interface ResumableStreamEventStore {
  createResumeKey(): string;
  append(resumeKey: string, index: number, part: ModelStreamPart): Promise<void>;
  getParts(resumeKey: string, fromIndex: number): Promise<ModelStreamPart[]>;
  /**
   * Returns session metadata for a known `resumeKey`, or `null` if the key was
   * never created in this store (or no longer exists, e.g. evicted in Redis).
   */
  getSessionMeta(resumeKey: string): Promise<ResumableStreamSessionMeta | null>;
}

interface StreamSession {
  parts: ModelStreamPart[];
  sizeBytes: number;
  completed: boolean;
  updatedAt?: number;
}

export interface InMemoryResumableStreamEventStoreOptions {
  now?: () => number;
  /** Optional cap on retained events for a single resume key. */
  maxEventsPerStream?: number;
  /** Optional cap on approximate UTF-8 bytes retained per resume key. */
  maxBytesPerStream?: number;
  /**
   * Override byte accounting strategy for tests / custom sizing.
   * Defaults to UTF-8 bytes of `JSON.stringify(part)`.
   */
  measurePartBytes?: (part: ModelStreamPart) => number;
}

export class InMemoryResumableStreamEventStore implements ResumableStreamEventStore {
  private readonly sessions = new Map<string, StreamSession>();
  private readonly now: () => number;
  private readonly maxEventsPerStream: number | undefined;
  private readonly maxBytesPerStream: number | undefined;
  private readonly measurePartBytes: (part: ModelStreamPart) => number;

  constructor(opts: InMemoryResumableStreamEventStoreOptions = {}) {
    this.now = opts.now ?? Date.now;
    this.maxEventsPerStream = opts.maxEventsPerStream;
    this.maxBytesPerStream = opts.maxBytesPerStream;
    this.measurePartBytes = opts.measurePartBytes ?? defaultMeasurePartBytes;
  }

  createResumeKey(): string {
    const key = uuidv7(this.now());
    this.sessions.set(key, { parts: [], sizeBytes: 0, completed: false });
    return key;
  }

  async append(resumeKey: string, index: number, part: ModelStreamPart): Promise<void> {
    const session = this.sessions.get(resumeKey);
    if (!session) {
      throw new ResumableStreamError(`Unknown resumeKey: ${resumeKey}`);
    }
    if (session.completed) {
      throw new ResumableStreamError(
        `Resumable stream is already completed for ${resumeKey}; appends are not allowed.`,
      );
    }
    if (!Number.isInteger(index) || index < 0) {
      throw new ResumableStreamError(`Invalid event index: ${index}`);
    }
    if (index !== session.parts.length) {
      throw new ResumableStreamError(
        `Out-of-order event index for ${resumeKey}. Expected ${session.parts.length}, got ${index}.`,
      );
    }
    const partBytes = this.measurePartBytes(part);
    if (!Number.isFinite(partBytes) || partBytes < 0) {
      throw new ResumableStreamError(`Invalid measured part bytes: ${partBytes}`);
    }
    const nextCount = session.parts.length + 1;
    if (this.maxEventsPerStream !== undefined && nextCount > this.maxEventsPerStream) {
      throw new ResumableStreamError(
        `Resumable stream event cap exceeded for ${resumeKey}: ${nextCount} > ${this.maxEventsPerStream}.`,
      );
    }
    const nextBytes = session.sizeBytes + partBytes;
    if (this.maxBytesPerStream !== undefined && nextBytes > this.maxBytesPerStream) {
      throw new ResumableStreamError(
        `Resumable stream byte cap exceeded for ${resumeKey}: ${nextBytes} > ${this.maxBytesPerStream}.`,
      );
    }
    session.parts.push(part);
    session.sizeBytes = nextBytes;
    const t = this.now();
    session.updatedAt = t;
    if (isTerminalModelStreamPart(part)) {
      session.completed = true;
    }
  }

  async getSessionMeta(resumeKey: string): Promise<ResumableStreamSessionMeta | null> {
    const session = this.sessions.get(resumeKey);
    if (!session) {
      return null;
    }
    return {
      nextIndex: session.parts.length,
      completed: session.completed,
      ...(session.updatedAt !== undefined ? { updatedAt: session.updatedAt } : {}),
    };
  }

  async getParts(resumeKey: string, fromIndex: number): Promise<ModelStreamPart[]> {
    const session = this.sessions.get(resumeKey);
    if (!session) {
      throw new ResumableStreamError(`Unknown resumeKey: ${resumeKey}`);
    }
    if (!Number.isInteger(fromIndex) || fromIndex < 0) {
      throw new ResumableStreamError(`Invalid resumeFromIndex: ${fromIndex}`);
    }
    if (fromIndex > session.parts.length) {
      throw new ResumableStreamError(
        `resumeFromIndex ${fromIndex} is out of bounds for ${resumeKey} (${session.parts.length} events).`,
      );
    }
    return session.parts.slice(fromIndex);
  }
}

function uuidv7(now: number = Date.now()): string {
  const ms = BigInt(now);
  const random = randomBytes(10);

  random[0] = ((random[0] as number) & 0x0f) | 0x70;
  random[2] = ((random[2] as number) & 0x3f) | 0x80;

  const tsHex = ms.toString(16).padStart(12, '0');
  const rndHex = Array.from(random, (b) => b.toString(16).padStart(2, '0')).join('');
  return (
    `${tsHex.slice(0, 8)}-${tsHex.slice(8, 12)}-${rndHex.slice(0, 4)}-` +
    `${rndHex.slice(4, 8)}-${rndHex.slice(8, 20)}`
  );
}

function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  const c = (
    globalThis as unknown as {
      crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array };
    }
  ).crypto;
  if (c?.getRandomValues) {
    c.getRandomValues(out);
    return out;
  }
  for (let i = 0; i < n; i++) out[i] = Math.floor(Math.random() * 256);
  return out;
}

function defaultMeasurePartBytes(part: ModelStreamPart): number {
  return byteLength(JSON.stringify(part));
}

function byteLength(s: string): number {
  let bytes = 0;
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4;
      i++;
    } else bytes += 3;
  }
  return bytes;
}
