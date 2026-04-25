import type { ModelStreamPart, ResumableStreamEventStore } from '@ziro-agent/core';
import { ResumableStreamError } from '@ziro-agent/core';
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
 */
export class RedisResumableStreamEventStore implements ResumableStreamEventStore {
  private readonly client: RedisLike;
  private readonly prefix: string;
  private readonly ttlSeconds: number | undefined;
  private readonly now: () => number;
  /** Keys issued by this store instance in-process (`streamText` + same writer). */
  private readonly localIssued = new Set<string>();

  constructor(opts: RedisResumableStreamEventStoreOptions) {
    this.client = opts.client;
    this.prefix = opts.keyPrefix ?? 'ziro:st';
    this.ttlSeconds = opts.ttlSeconds;
    this.now = opts.now ?? Date.now;
  }

  private regKey(resumeId: string): string {
    return `${this.prefix}:reg:${resumeId}`;
  }

  private logKey(resumeId: string): string {
    return `${this.prefix}:log:${resumeId}`;
  }

  createResumeKey(): string {
    const id = uuidv7(this.now());
    this.localIssued.add(id);
    return id;
  }

  async append(resumeKey: string, index: number, part: ModelStreamPart): Promise<void> {
    if (!Number.isInteger(index) || index < 0) {
      throw new ResumableStreamError(`Invalid event index: ${index}`);
    }
    if (!this.localIssued.has(resumeKey)) {
      throw new ResumableStreamError(`Unknown resumeKey: ${resumeKey}`);
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
    if (len !== index) {
      throw new ResumableStreamError(
        `Out-of-order event index for ${resumeKey}. Expected ${len}, got ${index}.`,
      );
    }
    const payload = serializePart(part);
    await this.client.command<unknown>(['RPUSH', this.logKey(resumeKey), payload]);
    if (this.ttlSeconds !== undefined) {
      const ttl = this.ttlSeconds;
      await this.client.command<unknown>(['EXPIRE', this.regKey(resumeKey), ttl]);
      await this.client.command<unknown>(['EXPIRE', this.logKey(resumeKey), ttl]);
    }
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
