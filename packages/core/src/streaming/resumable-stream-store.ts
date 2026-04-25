import type { ModelStreamPart } from '../types/model.js';

export class ResumableStreamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResumableStreamError';
  }
}

export interface ResumableStreamEventStore {
  createResumeKey(): string;
  append(resumeKey: string, index: number, part: ModelStreamPart): Promise<void>;
  getParts(resumeKey: string, fromIndex: number): Promise<ModelStreamPart[]>;
}

interface StreamSession {
  parts: ModelStreamPart[];
}

export class InMemoryResumableStreamEventStore implements ResumableStreamEventStore {
  private readonly sessions = new Map<string, StreamSession>();
  private readonly now: () => number;

  constructor(opts: { now?: () => number } = {}) {
    this.now = opts.now ?? Date.now;
  }

  createResumeKey(): string {
    const key = uuidv7(this.now());
    this.sessions.set(key, { parts: [] });
    return key;
  }

  async append(resumeKey: string, index: number, part: ModelStreamPart): Promise<void> {
    const session = this.sessions.get(resumeKey);
    if (!session) {
      throw new ResumableStreamError(`Unknown resumeKey: ${resumeKey}`);
    }
    if (!Number.isInteger(index) || index < 0) {
      throw new ResumableStreamError(`Invalid event index: ${index}`);
    }
    if (index !== session.parts.length) {
      throw new ResumableStreamError(
        `Out-of-order event index for ${resumeKey}. Expected ${session.parts.length}, got ${index}.`,
      );
    }
    session.parts.push(part);
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
