import * as esbuild from 'esbuild';

/**
 * Dual CJS/ESM build.
 *
 * The VS Code extension and the Prettier plugin load this package with
 * `require`, while the docs playground is bundled by Angular and wants real
 * ESM — shipping only CJS forces `allowedCommonJsDependencies` there and
 * blocks tree-shaking. Declarations come from `tsc` (see package.json).
 *
 * The engine packages stay external so consumers resolve their own copy
 * instead of embedding a second one.
 */
const shared = {
  entryPoints: ['src/index.ts'],
  bundle: true,
  target: ['node18', 'es2021'],
  external: ['@f12io/maple', '@f12io/coco'],
  sourcemap: true,
  logLevel: 'warning',
};

await esbuild.build({
  ...shared,
  format: 'cjs',
  platform: 'node',
  outfile: 'dist/index.cjs',
});

// `neutral` keeps the ESM build free of node assumptions: it also runs in the
// browser, where the playground uses it.
await esbuild.build({
  ...shared,
  format: 'esm',
  platform: 'neutral',
  outfile: 'dist/index.mjs',
});
