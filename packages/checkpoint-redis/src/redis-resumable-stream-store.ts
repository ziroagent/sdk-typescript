import type {
  ModelStreamPart,
  ResumableStreamContinueLock,
  ResumableStreamContinueLockStore,
  ResumableStreamEventStore,
  ResumableStreamSessionMeta,
} from '@ziro-agent/core';
import { isTerminalModelStreamPart, ResumableStreamError } from '@ziro-agent/core';
import type { RedisLike } from './redis-checkpointer.js';
import { uuidv7 } from './uuid7.js';

export interface RedisResumableStreamEventStoreOptions {
  client: RedisLike;
  /**
   * Prefix for Redis keys. Default `ziro:st` so stream logs do not collide
   * with the checkpointer’s default `ziro:cp`.
   */
  keyPrefix?: string;
  /**
   * Optional TTL in seconds, applied to both the registration and list keys.
   * Refreshed on every {@link append} (sliding window).
   */
  ttlSeconds?: number;
  /** Optional cap on retained events for a single resume key. */
  maxEventsPerStream?: number;
  /** Optional cap on approximate UTF-8 bytes retained per resume key. */
  maxBytesPerStream?: number;
  /**
   * Override byte accounting (defaults to UTF-8 length of the wire JSON line
   * stored in Redis, i.e. `byteLength(serializePart(part))`).
   * Matches `InMemoryResumableStreamEventStore`’s `measurePartBytes` hook.
   */
  measurePartBytes?: (part: ModelStreamPart) => number;
  /**
   * Lock TTL (seconds) for `continueUpstream` single-writer coordination.
   * Default 30s.
   */
  continueLockSeconds?: number;
  /** For deterministic ids in tests. */
  now?: () => number;
}

/**
 * {@link ResumableStreamEventStore} backed by Redis: one registration key
 * plus one LIST of JSON-serialized {@link ModelStreamPart} per `resumeKey`
 * (RFC 0006 resumable `streamText` follow-up).
 *
 * `createResumeKey()` is synchronous (matches {@link ResumableStreamEventStore}):
 * the key is reserved in this process; the first {@link append} (index 0) writes
 * the Redis `SET` + first `RPUSH`. Another process that only has the opaque
 * `resumeKey` string can still {@link getParts} once events exist in Redis.
 *
 * Key layout (default `keyPrefix = "ziro:st"`):
 *
 * - `ziro:st:reg:<resumeKey>` — STRING `"1"` (optional TTL)
 * - `ziro:st:log:<resumeKey>` — LIST of wire-format JSON lines
 * - `ziro:st:bytes:<resumeKey>` — STRING integer total bytes (optional)
 * - `ziro:st:ts:<resumeKey>` — STRING ms (last append; optional TTL, sliding)
 * - `ziro:st:comp:<resumeKey>` — STRING `"1"` once a terminal part is stored
 */
export class RedisResumableStreamEventStore
  implements ResumableStreamEventStore, ResumableStreamContinueLockStore
{
  private readonly client: RedisLike;
  private readonly prefix: string;
  private readonly ttlSeconds: number | undefined;
  private readonly maxEventsPerStream: number | undefined;
  private readonly maxBytesPerStream: number | undefined;
  private readonly continueLockSeconds: number;
  private readonly now: () => number;
  private readonly measurePartBytes: ((part: ModelStreamPart) => number) | undefined;
  /** Keys issued by this store instance in-process (`streamText` + same writer). */
  private readonly localIssued = new Set<string>();

  constructor(opts: RedisResumableStreamEventStoreOptions) {
    this.client = opts.client;
    this.prefix = opts.keyPrefix ?? 'ziro:st';
    this.ttlSeconds = opts.ttlSeconds;
    this.maxEventsPerStream = opts.maxEventsPerStream;
    this.maxBytesPerStream = opts.maxBytesPerStream;
    this.continueLockSeconds = opts.continueLockSeconds ?? 30;
    this.now = opts.now ?? Date.now;
    this.measurePartBytes = opts.measurePartBytes;
  }

  private regKey(resumeId: string): string {
    return `${this.prefix}:reg:${resumeId}`;
  }

  private logKey(resumeId: string): string {
    return `${this.prefix}:log:${resumeId}`;
  }

  private bytesKey(resumeId: string): string {
    return `${this.prefix}:bytes:${resumeId}`;
  }

  private tsKey(resumeId: string): string {
    return `${this.prefix}:ts:${resumeId}`;
  }

  private compKey(resumeId: string): string {
    return `${this.prefix}:comp:${resumeId}`;
  }

  private lockKey(resumeId: string): string {
    return `${this.prefix}:lock:${resumeId}`;
  }

  createResumeKey(): string {
    const id = uuidv7(this.now());
    this.localIssued.add(id);
    return id;
  }

  async acquireContinueLock(resumeKey: string): Promise<ResumableStreamContinueLock> {
    const token = uuidv7(this.now());
    const resp = await this.client.command<string | null>([
      'SET',
      this.lockKey(resumeKey),
      token,
      'NX',
      'EX',
      this.continueLockSeconds,
    ]);
    if (resp !== 'OK') {
      throw new ResumableStreamError(
        `Continue lock already held for ${resumeKey}; another worker may be continuing upstream.`,
      );
    }
    return { resumeKey, token };
  }

  async releaseContinueLock(lock: ResumableStreamContinueLock): Promise<void> {
    const current = await this.client.command<string | null>(['GET', this.lockKey(lock.resumeKey)]);
    if (current === lock.token) {
      await this.client.command<unknown>(['DEL', this.lockKey(lock.resumeKey)]);
    }
  }

  async append(resumeKey: string, index: number, part: ModelStreamPart): Promise<void> {
    if (!Number.isInteger(index) || index < 0) {
      throw new ResumableStreamError(`Invalid event index: ${index}`);
    }
    if (!this.localIssued.has(resumeKey)) {
      throw new ResumableStreamError(`Unknown resumeKey: ${resumeKey}`);
    }
    const done =
      (await this.client.command<string | null>(['GET', this.compKey(resumeKey)])) ?? null;
    if (done === '1') {
      throw new ResumableStreamError(
        `Resumable stream is already completed for ${resumeKey}; appends are not allowed.`,
      );
    }
    const reg = (await this.client.command<string | null>(['GET', this.regKey(resumeKey)])) ?? null;
    if (reg === null && index !== 0) {
      throw new ResumableStreamError(`Unknown resumeKey: ${resumeKey}`);
    }
    if (reg === null && index === 0) {
      const setArgs: (string | number)[] = ['SET', this.regKey(resumeKey), '1'];
      if (this.ttlSeconds !== undefined) {
        setArgs.push('EX', this.ttlSeconds);
      }
      await this.client.command<unknown>(setArgs);
    }
    const len = (await this.client.command<number>(['LLEN', this.logKey(resumeKey)])) ?? 0;
    if (len > 0) {
      const lastLines = await this.client.command<string[]>([
        'LRANGE',
        this.logKey(resumeKey),
        len - 1,
        len - 1,
      ]);
      const line = lastLines?.[0];
      if (line) {
        try {
          const last = deserializePart(line);
          if (isTerminalModelStreamPart(last)) {
            throw new ResumableStreamError(
              `Resumable stream is already completed for ${resumeKey}; appends are not allowed.`,
            );
          }
        } catch (e) {
          if (e instanceof ResumableStreamError) throw e;
        }
      }
    }
    if (len !== index) {
      throw new ResumableStreamError(
        `Out-of-order event index for ${resumeKey}. Expected ${len}, got ${index}.`,
      );
    }
    const nextCount = len + 1;
    if (this.maxEventsPerStream !== undefined && nextCount > this.maxEventsPerStream) {
      throw new ResumableStreamError(
        `Resumable stream event cap exceeded for ${resumeKey}: ${nextCount} > ${this.maxEventsPerStream}.`,
      );
    }
    const payload = serializePart(part);
    const currentBytesRaw =
      (await this.client.command<string | null>(['GET', this.bytesKey(resumeKey)])) ?? null;
    const currentBytes = currentBytesRaw ? Number(currentBytesRaw) : 0;
    const payloadBytes = this.accountPartBytes(part, payload);
    if (!Number.isFinite(payloadBytes) || payloadBytes < 0) {
      throw new ResumableStreamError(`Invalid measured part bytes: ${payloadBytes}`);
    }
    const nextBytes = currentBytes + payloadBytes;
    if (this.maxBytesPerStream !== undefined && nextBytes > this.maxBytesPerStream) {
      throw new ResumableStreamError(
        `Resumable stream byte cap exceeded for ${resumeKey}: ${nextBytes} > ${this.maxBytesPerStream}.`,
      );
    }
    await this.client.command<unknown>(['RPUSH', this.logKey(resumeKey), payload]);
    await this.client.command<unknown>(['SET', this.bytesKey(resumeKey), String(nextBytes)]);

    const t = String(this.now());
    const ttlArgs: (string | number)[] = [this.tsKey(resumeKey), t];
    if (this.ttlSeconds !== undefined) {
      ttlArgs.push('EX', this.ttlSeconds);
    }
    await this.client.command<unknown>(['SET', ...ttlArgs]);

    if (isTerminalModelStreamPart(part)) {
      const compS: (string | number)[] = ['SET', this.compKey(resumeKey), '1'];
      if (this.ttlSeconds !== undefined) {
        compS.push('EX', this.ttlSeconds);
      }
      await this.client.command<unknown>(compS);
    }

    if (this.ttlSeconds !== undefined) {
      const ttl = this.ttlSeconds;
      await this.client.command<unknown>(['EXPIRE', this.regKey(resumeKey), ttl]);
      await this.client.command<unknown>(['EXPIRE', this.logKey(resumeKey), ttl]);
      await this.client.command<unknown>(['EXPIRE', this.bytesKey(resumeKey), ttl]);
      await this.client.command<unknown>(['EXPIRE', this.tsKey(resumeKey), ttl]);
      await this.client.command<unknown>(['EXPIRE', this.compKey(resumeKey), ttl]);
    }
  }

  async getSessionMeta(resumeKey: string): Promise<ResumableStreamSessionMeta | null> {
    const local = this.localIssued.has(resumeKey);
    const hasReg =
      (await this.client.command<string | null>(['GET', this.regKey(resumeKey)])) != null;
    const len = (await this.client.command<number>(['LLEN', this.logKey(resumeKey)])) ?? 0;
    if (!local && !hasReg && len === 0) {
      return null;
    }
    const compRaw =
      (await this.client.command<string | null>(['GET', this.compKey(resumeKey)])) ?? null;
    let completed = compRaw === '1';
    if (!completed && len > 0) {
      const tail = await this.client.command<string[]>([
        'LRANGE',
        this.logKey(resumeKey),
        len - 1,
        len - 1,
      ]);
      const line = tail?.[0];
      if (line) {
        try {
          const lastPart = deserializePart(line);
          if (isTerminalModelStreamPart(lastPart)) {
            completed = true;
          }
        } catch {
          // treat as incomplete
        }
      }
    }
    const tsRaw =
      (await this.client.command<string | null>(['GET', this.tsKey(resumeKey)])) ?? null;
    const t = tsRaw != null ? Number(tsRaw) : undefined;
    return {
      nextIndex: len,
      completed,
      ...(t !== undefined && !Number.isNaN(t) ? { updatedAt: t } : {}),
    };
  }

  async getParts(resumeKey: string, fromIndex: number): Promise<ModelStreamPart[]> {
    if (!Number.isInteger(fromIndex) || fromIndex < 0) {
      throw new ResumableStreamError(`Invalid resumeFromIndex: ${fromIndex}`);
    }
    const hasRedis =
      (await this.client.command<string | null>(['GET', this.regKey(resumeKey)])) != null;
    const len = (await this.client.command<number>(['LLEN', this.logKey(resumeKey)])) ?? 0;
    if (!hasRedis && len === 0) {
      if (this.localIssued.has(resumeKey)) {
        if (fromIndex > 0) {
          throw new ResumableStreamError(
            `resumeFromIndex ${fromIndex} is out of bounds for ${resumeKey} (0 events).`,
          );
        }
        return [];
      }
      throw new ResumableStreamError(`Unknown resumeKey: ${resumeKey}`);
    }
    if (fromIndex > len) {
      throw new ResumableStreamError(
        `resumeFromIndex ${fromIndex} is out of bounds for ${resumeKey} (${len} events).`,
      );
    }
    if (fromIndex === len) {
      return [];
    }
    const stop = len - 1;
    const raw = await this.client.command<string[]>([
      'LRANGE',
      this.logKey(resumeKey),
      fromIndex,
      stop,
    ]);
    if (!raw || raw.length === 0) {
      return [];
    }
    return raw.map((line) => deserializePart(line));
  }

  private accountPartBytes(part: ModelStreamPart, wire: string): number {
    if (this.measurePartBytes) {
      return this.measurePartBytes(part);
    }
    return byteLength(wire);
  }
}

function serializePart(p: ModelStreamPart): string {
  return JSON.stringify(p, (_key, value) => {
    if (value instanceof Error) {
      return { __ziroError: true, name: value.name, message: value.message, stack: value.stack };
    }
    return value;
  });
}

function deserializePart(s: string): ModelStreamPart {
  const o = JSON.parse(s) as unknown;
  if (!o || typeof o !== 'object') {
    throw new ResumableStreamError('Invalid stored stream part');
  }
  const v = o as { type?: string; error?: unknown };
  if (v.type === 'error' && v.error && typeof v.error === 'object' && v.error !== null) {
    const e = v.error as { __ziroError?: boolean; name?: string; message?: string; stack?: string };
    if (e.__ziroError) {
      const err = new Error(e.message ?? 'error');
      err.name = e.name ?? 'Error';
      if (e.stack) err.stack = e.stack;
      return { type: 'error', error: err };
    }
  }
  return o as ModelStreamPart;
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
