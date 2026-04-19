/**
 * RFC 4122 v4 UUID. Uses `globalThis.crypto.randomUUID` when available
 * (Node ≥ 19, all modern browsers / edge runtimes), otherwise falls back to
 * a `Math.random()`-based generator suitable for non-security uses (we only
 * use this for opaque document ids, never tokens).
 */
export function uuid(): string {
  const c = (globalThis as unknown as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = ((bytes[6] as number) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] as number) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'));
  return (
    `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-` +
    `${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`
  );
}
