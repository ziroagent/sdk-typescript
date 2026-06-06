import { createHash, createHmac } from 'node:crypto';
import { appendFile, readFile } from 'node:fs/promises';

export const AUDIT_LOG_SCHEMA_VERSION = 1 as const;

export interface AuditAppendInput {
  action: string;
  actor?: string;
  subjectId?: string;
  payload?: Record<string, unknown>;
}

export interface AuditRecord extends AuditAppendInput {
  v: typeof AUDIT_LOG_SCHEMA_VERSION;
  ts: string;
  prevHash: string;
  /**
   * Digest algorithm. Present ONLY on HMAC-signed records; absent means the
   * legacy unkeyed SHA-256 chain. Kept optional so existing logs verify
   * unchanged.
   */
  alg?: 'hmac-sha256';
  hash: string;
}

export interface JsonlAuditLogOptions {
  /**
   * When set, each record's `hash` is an **HMAC-SHA256** keyed with this secret
   * instead of a plain SHA-256. This upgrades the chain from tamper-DETECTION
   * to tamper-EVIDENCE: an attacker who can write the file but does not hold
   * the key cannot forge a valid downstream chain. Store the key in a KMS /
   * secret manager — never alongside the log. Records written with a key carry
   * `alg: 'hmac-sha256'`; verification requires the same key.
   */
  hmacKey?: string | Buffer;
}

/**
 * Chain digest: HMAC-SHA256 when a key is supplied (tamper-evidence), else
 * plain SHA-256 (tamper-detection). Shared shape used by writer and verifier.
 */
export function auditDigestHex(input: string, hmacKey?: string | Buffer): string {
  if (hmacKey !== undefined) {
    return createHmac('sha256', hmacKey).update(input, 'utf8').digest('hex');
  }
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/** Deterministic JSON for hashing (sorted object keys, recursively). */
export function canonicalJsonStringify(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((x) => canonicalJsonStringify(x)).join(',')}]`;
  }
  const o = value as Record<string, unknown>;
  const keys = Object.keys(o).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJsonStringify(o[k])}`).join(',')}}`;
}

async function readLastHash(filePath: string): Promise<string> {
  try {
    const text = await readFile(filePath, 'utf8');
    const lines = text.trim().split('\n').filter(Boolean);
    const last = lines[lines.length - 1];
    if (!last) return '';
    const rec = JSON.parse(last) as Partial<AuditRecord>;
    return typeof rec.hash === 'string' ? rec.hash : '';
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') return '';
    throw err;
  }
}

/**
 * Append-only JSONL audit sink with a simple hash chain (`prevHash` → `hash`).
 *
 * SECURITY SCOPE — read before relying on this for compliance. The chain uses
 * **unkeyed** SHA-256: every input to the hash lives in the file and the hash
 * function is public, so an attacker with write access can edit a record AND
 * recompute the entire downstream chain. This therefore provides tamper-
 * **detection** (you catch edits *if* you retain the tip hash out-of-band, or
 * compare against an external copy) — NOT cryptographic tamper-**evidence**
 * against a malicious writer.
 *
 * To get tamper-**evidence**, construct with `{ hmacKey }` (keep the key in a
 * KMS / secret manager, never beside the log): records are then HMAC-SHA256
 * signed, so a writer without the key cannot forge a valid chain. Verify with
 * `verifyJsonlAuditLogChain(content, { hmacKey })`. For the strongest trails
 * (EU AI Act, SOC 2) also anchor the tip hash to an external notary/timestamp
 * or store on WORM media.
 */
export class JsonlAuditLog {
  private readonly hmacKey?: string | Buffer;

  constructor(
    private readonly filePath: string,
    options?: JsonlAuditLogOptions,
  ) {
    if (options?.hmacKey !== undefined) this.hmacKey = options.hmacKey;
  }

  async append(input: AuditAppendInput): Promise<AuditRecord> {
    const prevHash = await readLastHash(this.filePath);
    const ts = new Date().toISOString();
    const keyed = this.hmacKey !== undefined;
    const bodyForHash = {
      v: AUDIT_LOG_SCHEMA_VERSION,
      ts,
      prevHash,
      // `alg` is part of the hashed body so it cannot be stripped to downgrade
      // a signed record to an unkeyed one without breaking verification.
      ...(keyed ? { alg: 'hmac-sha256' as const } : {}),
      action: input.action,
      ...(input.actor !== undefined ? { actor: input.actor } : {}),
      ...(input.subjectId !== undefined ? { subjectId: input.subjectId } : {}),
      ...(input.payload !== undefined ? { payload: input.payload } : {}),
    };
    const hash = auditDigestHex(canonicalJsonStringify(bodyForHash), this.hmacKey);
    const record: AuditRecord = { ...bodyForHash, hash };
    await appendFile(this.filePath, `${JSON.stringify(record)}\n`, 'utf8');
    return record;
  }
}
