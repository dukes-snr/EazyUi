import { defineConfig } from 'tsup';

export default defineConfig({
    entry: ['src/index.ts'],
    format: ['cjs', 'esm'],
    dts: true, // Enable tsup dts generation
    tsconfig: 'tsconfig.build.json',
    splitting: false,
    clean: true,
    sourcemap: true,
    skipNodeModulesBundle: true,
});
