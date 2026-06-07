import { readFile } from 'node:fs/promises';

import {
  AUDIT_LOG_SCHEMA_VERSION,
  type AuditRecord,
  auditDigestHex,
  canonicalJsonStringify,
} from './jsonl-audit-log.js';

export interface VerifyJsonlAuditLogChainResult {
  ok: boolean;
  lineCount: number;
  error?: string;
  /** 1-based line index when `ok` is false */
  errorLine?: number;
}

export interface VerifyJsonlAuditLogChainOptions {
  /**
   * The HMAC key the log was signed with. Required to verify records that
   * carry `alg: 'hmac-sha256'`; ignored for legacy unkeyed records. Verifying
   * a signed log WITHOUT the key fails closed (you cannot confirm integrity).
   */
  hmacKey?: string | Buffer;
}

function bodyForHashFromRecord(rec: AuditRecord): Record<string, unknown> {
  return {
    v: rec.v,
    ts: rec.ts,
    prevHash: rec.prevHash,
    ...(rec.alg !== undefined ? { alg: rec.alg } : {}),
    action: rec.action,
    ...(rec.actor !== undefined ? { actor: rec.actor } : {}),
    ...(rec.subjectId !== undefined ? { subjectId: rec.subjectId } : {}),
    ...(rec.payload !== undefined ? { payload: rec.payload } : {}),
  };
}

/**
 * Verifies every line in an audit JSONL string recomputes to the stored `hash`
 * and that `prevHash` chains line-to-line (RFC 0016 integrity checks).
 *
 * For HMAC-signed logs (records with `alg: 'hmac-sha256'`), pass the same
 * `hmacKey` used to write them; without it, verification of a signed record
 * fails closed.
 */
export function verifyJsonlAuditLogChain(
  content: string,
  options?: VerifyJsonlAuditLogChainOptions,
): VerifyJsonlAuditLogChainResult {
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
    if (rec.alg === 'hmac-sha256' && options?.hmacKey === undefined) {
      return {
        ok: false,
        lineCount: lines.length,
        error: 'hmac key required to verify a signed record',
        errorLine: i + 1,
      };
    }
    // Unkeyed records verify with SHA-256 even if a key was supplied, so a
    // mixed/legacy log still validates per-record by its own `alg`.
    const key = rec.alg === 'hmac-sha256' ? options?.hmacKey : undefined;
    const expected = auditDigestHex(canonicalJsonStringify(bodyForHashFromRecord(rec)), key);
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
  options?: VerifyJsonlAuditLogChainOptions,
): Promise<VerifyJsonlAuditLogChainResult> {
  const text = await readFile(filePath, 'utf8');
  return verifyJsonlAuditLogChain(text, options);
}
