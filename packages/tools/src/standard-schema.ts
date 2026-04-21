import type { StandardSchemaV1 } from '@standard-schema/spec';
import { z } from 'zod';

function flatIssuePath(
  path?: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }>,
): PropertyKey[] {
  if (!path?.length) return [];
  return path.map((p) =>
    typeof p === 'object' && p !== null && 'key' in p
      ? (p as { readonly key: PropertyKey }).key
      : p,
  ) as PropertyKey[];
}

/**
 * Bridges any [Standard Schema v1](https://standardschema.dev) validator
 * (Zod 4, Valibot 1+, ArkType, …) into a Zod schema so it works with
 * {@link defineTool}'s `input` / `output` and {@link toolToModelDefinition}'s
 * `z.toJSONSchema()` emission.
 *
 * Validation runs via `parseAsync` inside {@link executeToolCalls}, so async
 * `validate` implementations are supported.
 */
export function zodFromStandardSchema<TOutput>(
  schema: StandardSchemaV1<unknown, TOutput>,
): z.ZodType<TOutput> {
  return z.unknown().transform(async (val) => {
    const result = await schema['~standard'].validate(val);
    if ('issues' in result && result.issues?.length) {
      throw new z.ZodError(
        result.issues.map((issue) => ({
          code: 'custom' as const,
          message: issue.message,
          path: flatIssuePath(issue.path),
        })),
      );
    }
    if (!('value' in result)) {
      throw new z.ZodError([
        { code: 'custom', message: 'Standard schema returned no value', path: [] },
      ]);
    }
    return result.value as TOutput;
  }) as z.ZodType<TOutput>;
}
