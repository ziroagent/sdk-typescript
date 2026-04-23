import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import {
  AUDIT_LOG_SCHEMA_VERSION,
  type AuditRecord,
  canonicalJsonStringify,
} from './jsonl-audit-log.js';

export interface VerifyJsonlAuditLogChainResult {
  ok: boolean;
  lineCount: number;
  error?: string;
  /** 1-based line index when `ok` is false */
  errorLine?: number;
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

function bodyForHashFromRecord(rec: AuditRecord): Record<string, unknown> {
  return {
    v: rec.v,
    ts: rec.ts,
    prevHash: rec.prevHash,
    action: rec.action,
    ...(rec.actor !== undefined ? { actor: rec.actor } : {}),
    ...(rec.subjectId !== undefined ? { subjectId: rec.subjectId } : {}),
    ...(rec.payload !== undefined ? { payload: rec.payload } : {}),
  };
}

/**
 * Verifies every line in an audit JSONL string recomputes to the stored `hash`
 * and that `prevHash` chains line-to-line (RFC 0016 integrity checks).
 */
export function verifyJsonlAuditLogChain(content: string): VerifyJsonlAuditLogChainResult {
  const lines = content.trim().split('\n').filter(Boolean);
  let prevHash = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    let rec: AuditRecord;
    try {
      rec = JSON.parse(line) as AuditRecord;
    } catch {
      return {
        ok: false,
        lineCount: lines.length,
        error: 'JSON parse error',
        errorLine: i + 1,
      };
    }
    if (rec.v !== AUDIT_LOG_SCHEMA_VERSION) {
      return {
        ok: false,
        lineCount: lines.length,
        error: `unsupported schema v=${String(rec.v)}`,
        errorLine: i + 1,
      };
    }
    if (rec.prevHash !== prevHash) {
      return {
        ok: false,
        lineCount: lines.length,
        error: 'prevHash chain broken',
        errorLine: i + 1,
      };
    }
    const expected = sha256Hex(canonicalJsonStringify(bodyForHashFromRecord(rec)));
    if (expected !== rec.hash) {
      return {
        ok: false,
        lineCount: lines.length,
        error: 'hash mismatch',
        errorLine: i + 1,
      };
    }
    prevHash = rec.hash;
  }
  return { ok: true, lineCount: lines.length };
}

/** Read a file then {@link verifyJsonlAuditLogChain}. */
export async function verifyJsonlAuditLogFile(
  filePath: string,
): Promise<VerifyJsonlAuditLogChainResult> {
  const text = await readFile(filePath, 'utf8');
  return verifyJsonlAuditLogChain(text);
}
