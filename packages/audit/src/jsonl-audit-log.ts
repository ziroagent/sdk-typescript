import { createHash } from 'node:crypto';
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
  hash: string;
}

function sha256Hex(input: string): string {
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
 */
export class JsonlAuditLog {
  constructor(private readonly filePath: string) {}

  async append(input: AuditAppendInput): Promise<AuditRecord> {
    const prevHash = await readLastHash(this.filePath);
    const ts = new Date().toISOString();
    const bodyForHash = {
      v: AUDIT_LOG_SCHEMA_VERSION,
      ts,
      prevHash,
      action: input.action,
      ...(input.actor !== undefined ? { actor: input.actor } : {}),
      ...(input.subjectId !== undefined ? { subjectId: input.subjectId } : {}),
      ...(input.payload !== undefined ? { payload: input.payload } : {}),
    };
    const hash = sha256Hex(canonicalJsonStringify(bodyForHash));
    const record: AuditRecord = { ...bodyForHash, hash };
    await appendFile(this.filePath, `${JSON.stringify(record)}\n`, 'utf8');
    return record;
  }
}
