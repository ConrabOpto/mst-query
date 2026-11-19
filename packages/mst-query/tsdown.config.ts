import { defineConfig } from 'tsdown';

export default defineConfig({
    entry: ['src/index.ts'],
    // Keep one output file per module so 'use client' directives survive.
    unbundle: true,
    format: ['cjs', 'esm'],
    dts: true,
    clean: true,
    sourcemap: true,
    target: 'es2022',
    fixedExtension: false,
});
