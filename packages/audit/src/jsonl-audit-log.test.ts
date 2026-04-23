import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { canonicalJsonStringify, JsonlAuditLog } from './jsonl-audit-log.js';
import { verifyJsonlAuditLogChain, verifyJsonlAuditLogFile } from './verify-chain.js';

describe('JsonlAuditLog', () => {
  it('chains hashes across appends', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ziro-audit-'));
    const path = join(dir, 'audit.jsonl');
    const log = new JsonlAuditLog(path);
    const a = await log.append({ action: 'login', actor: 'u1' });
    const b = await log.append({ action: 'tool_call', subjectId: 't1', payload: { x: 1 } });
    expect(b.prevHash).toBe(a.hash);
    const raw = await readFile(path, 'utf8');
    const lines = raw.trim().split('\n');
    expect(lines.length).toBe(2);
    expect(verifyJsonlAuditLogChain(raw).ok).toBe(true);
    expect((await verifyJsonlAuditLogFile(path)).ok).toBe(true);
  });

  it('canonicalJsonStringify is order-insensitive for objects', () => {
    const a = canonicalJsonStringify({ b: 2, a: 1 });
    const b = canonicalJsonStringify({ a: 1, b: 2 });
    expect(a).toBe(b);
  });

  it('verifyJsonlAuditLogChain rejects tampered hash', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ziro-audit-tamper-'));
    const path = join(dir, 'audit.jsonl');
    const log = new JsonlAuditLog(path);
    await log.append({ action: 'a' });
    await log.append({ action: 'b' });
    let raw = await readFile(path, 'utf8');
    raw = raw.replace('"action":"b"', '"action":"tampered"');
    await writeFile(path, raw, 'utf8');
    const r = verifyJsonlAuditLogChain(await readFile(path, 'utf8'));
    expect(r.ok).toBe(false);
    expect(r.error).toBe('hash mismatch');
  });
});
