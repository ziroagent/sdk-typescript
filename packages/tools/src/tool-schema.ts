import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { z } from 'zod';
import { zodFromStandardSchema } from './standard-schema.js';

/** `defineTool` input / output: native Zod or any Standard Schema v1 type. */
export type ToolSchemaSpec<T> = z.ZodType<T> | StandardSchemaV1<unknown, T>;

export function isZodType(x: unknown): x is z.ZodType {
  return (
    typeof x === 'object' &&
    x !== null &&
    '_def' in (x as object) &&
    typeof (x as { parse?: unknown }).parse === 'function'
  );
}

export function normalizeToolSchema<T>(spec: ToolSchemaSpec<T>): z.ZodType<T> {
  if (isZodType(spec)) return spec as z.ZodType<T>;
  return zodFromStandardSchema(spec as StandardSchemaV1<unknown, T>);
}
