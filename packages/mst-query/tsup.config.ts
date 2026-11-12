import { defineConfig, type Options } from 'tsup';

type EsbuildPlugin = NonNullable<Options['esbuildPlugins']>[number];

// Each source file is built separately so 'use client' directives survive,
// so relative imports have to point at the emitted files.
const relativeImportExtensions: EsbuildPlugin = {
    name: 'relative-import-extensions',
    setup(build) {
        const extension = build.initialOptions.format === 'cjs' ? '.cjs' : '.js';
        build.onResolve({ filter: /^\.\.?\// }, (args) => {
            if (args.kind === 'entry-point') {
                return;
            }
            return { path: `${args.path}${extension}`, external: true };
        });
    },
};

export default defineConfig({
    entry: ['src/**/*.ts', 'src/**/*.tsx'],
    format: ['cjs', 'esm'],
    dts: { entry: 'src/index.ts' },
    clean: true,
    sourcemap: true,
    esbuildPlugins: [relativeImportExtensions],
});
