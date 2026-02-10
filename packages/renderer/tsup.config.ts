import { defineConfig } from 'tsup';

export default defineConfig({
    entry: ['src/index.ts'],
    format: ['cjs', 'esm'],
    dts: false, // Disable tsup dts, use tsc instead
    splitting: false,
    clean: true,
    sourcemap: true,
    skipNodeModulesBundle: true,
});
