// Shared esbuild settings: ESM main process, CommonJS preload (required for sandboxed preloads).
export const builds = [
  {
    entryPoints: ['src/main.ts'],
    outfile: 'dist/main.js',
    format: 'esm',
    platform: 'node',
    target: 'node22',
    bundle: true,
    packages: 'external',
    sourcemap: true,
    logLevel: 'info',
  },
  {
    entryPoints: ['src/preload.ts'],
    outfile: 'dist/preload.cjs',
    format: 'cjs',
    platform: 'node',
    target: 'node22',
    bundle: true,
    external: ['electron'],
    sourcemap: true,
    logLevel: 'info',
  },
]
