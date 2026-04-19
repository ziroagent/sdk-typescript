import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    clean: true,
    treeshake: true,
    splitting: false,
    target: 'es2022',
  },
  {
    entry: { cli: 'src/cli.ts' },
    format: ['esm'],
    sourcemap: true,
    clean: false,
    splitting: false,
    target: 'es2022',
    banner: { js: '#!/usr/bin/env node' },
  },
]);
