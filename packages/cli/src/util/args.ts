/**
 * Tiny argv parser. Accepts:
 *   - positional args
 *   - `--flag` (boolean, true)
 *   - `--key=value`
 *   - `--key value`
 *   - `-x` short flags treated as boolean
 *
 * No prototype pollution: result is a `null`-prototype object.
 */
export interface ParsedArgs {
  _: string[];
  flags: Record<string, string | boolean>;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = Object.create(null);

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq !== -1) {
        const k = a.slice(2, eq);
        flags[k] = a.slice(eq + 1);
      } else {
        const k = a.slice(2);
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith('-')) {
          flags[k] = next;
          i++;
        } else {
          flags[k] = true;
        }
      }
    } else if (a.startsWith('-') && a.length > 1) {
      flags[a.slice(1)] = true;
    } else {
      positional.push(a);
    }
  }

  return { _: positional, flags };
}
