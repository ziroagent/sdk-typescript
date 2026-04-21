import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/stores/pgvector.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  splitting: false,
  target: 'es2022',
  /** Bundling `pdf-parse` pulls a webpack UMD prelude that breaks Rollup sourcemaps. */
  external: ['pdf-parse'],
});
