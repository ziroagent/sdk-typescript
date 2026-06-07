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

describe('JsonlAuditLog — HMAC signing (tamper-evidence)', () => {
  const KEY = 'super-secret-kms-key';

  it('signs records with alg=hmac-sha256 and verifies with the key', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ziro-audit-hmac-'));
    const path = join(dir, 'audit.jsonl');
    const log = new JsonlAuditLog(path, { hmacKey: KEY });
    const a = await log.append({ action: 'login', actor: 'u1' });
    const b = await log.append({ action: 'tool_call', payload: { x: 1 } });
    expect(a.alg).toBe('hmac-sha256');
    expect(b.prevHash).toBe(a.hash);
    const raw = await readFile(path, 'utf8');
    expect(verifyJsonlAuditLogChain(raw, { hmacKey: KEY }).ok).toBe(true);
  });

  it('fails closed when verifying a signed log without the key', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ziro-audit-hmac-nokey-'));
    const path = join(dir, 'audit.jsonl');
    const log = new JsonlAuditLog(path, { hmacKey: KEY });
    await log.append({ action: 'a' });
    const r = verifyJsonlAuditLogChain(await readFile(path, 'utf8'));
    expect(r.ok).toBe(false);
    expect(r.error).toContain('hmac key');
  });

  it('rejects verification under a different key (forgery-resistant)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ziro-audit-hmac-wrong-'));
    const path = join(dir, 'audit.jsonl');
    const log = new JsonlAuditLog(path, { hmacKey: KEY });
    await log.append({ action: 'a' });
    const r = verifyJsonlAuditLogChain(await readFile(path, 'utf8'), { hmacKey: 'wrong-key' });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('hash mismatch');
  });

  it('detects a re-hashed forgery: editing a signed record needs the key', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ziro-audit-hmac-forge-'));
    const path = join(dir, 'audit.jsonl');
    const log = new JsonlAuditLog(path, { hmacKey: KEY });
    await log.append({ action: 'transfer', payload: { amount: 100 } });
    let raw = await readFile(path, 'utf8');
    // Attacker edits the payload but cannot recompute a valid HMAC without KEY.
    raw = raw.replace('"amount":100', '"amount":1000000');
    await writeFile(path, raw, 'utf8');
    const r = verifyJsonlAuditLogChain(await readFile(path, 'utf8'), { hmacKey: KEY });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('hash mismatch');
  });

  it('unkeyed logs still verify (backward compatible)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ziro-audit-legacy-'));
    const path = join(dir, 'audit.jsonl');
    const log = new JsonlAuditLog(path); // no key
    const a = await log.append({ action: 'a' });
    expect(a.alg).toBeUndefined();
    // A key passed to the verifier is ignored for unkeyed records.
    expect(verifyJsonlAuditLogChain(await readFile(path, 'utf8'), { hmacKey: KEY }).ok).toBe(true);
  });
});
