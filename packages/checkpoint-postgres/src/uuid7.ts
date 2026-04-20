/**
 * Minimal UUID v7 generator (RFC 9562 §5.7) — copied verbatim from
 * `@ziro-agent/checkpoint-memory` to keep this package zero-runtime-dep
 * (we don't take a dep on the memory adapter just for one helper).
 *
 * v7 ids are lexicographically time-sortable: a string `<` comparison
 * orders them by creation time. That's exactly what the
 * {@link Checkpointer.list} contract wants and lets us avoid an extra
 * `ORDER BY created_at` on every read path.
 */
export function uuidv7(now: number = Date.now()): string {
  const ms = BigInt(now);
  const random = randomBytes(10);

  random[0] = ((random[0] as number) & 0x0f) | 0x70;
  random[2] = ((random[2] as number) & 0x3f) | 0x80;

  const hex = (n: bigint, len: number): string => n.toString(16).padStart(len, '0');
  const tsHex = hex(ms, 12);
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
