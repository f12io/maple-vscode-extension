/**
 * Dual-build smoke test.
 *
 * The rest of the suite imports `src/` directly, so it can never catch a
 * packaging mistake — a broken `exports` map, an ESM build that still calls
 * `require`, or the engine getting bundled in twice. This builds the package
 * and loads both artifacts the way real consumers do.
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const PACKAGE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const CJS = path.join(PACKAGE, 'dist', 'index.cjs');
const ESM = path.join(PACKAGE, 'dist', 'index.mjs');

const FIXTURE = '<div class="md:hover:bgc-red-500"></div>';

describe('published bundles', () => {
  beforeAll(() => {
    execSync('npm run build', { cwd: PACKAGE, stdio: 'pipe' });
  }, 60000);

  it('declares both artifacts in the exports map', () => {
    const pkg = require(path.join(PACKAGE, 'package.json'));

    expect(pkg.exports['.']).toEqual({
      types: './dist/types/index.d.ts',
      import: './dist/index.mjs',
      require: './dist/index.cjs',
    });
    // `main`/`types` keep resolvers that ignore `exports` working
    expect(pkg.main).toBe('./dist/index.cjs');
    expect(pkg.types).toBe('./dist/types/index.d.ts');
  });

  it('works when required as CommonJS', () => {
    const core = require(CJS);

    expect(
      core.computeSemanticTokens(FIXTURE, { languageId: 'html' }).length,
    ).toBeGreaterThan(0);
    expect(core.formatText(FIXTURE, 'html', 2)).toContain('class=');
    expect(core.validateClass('p-4!')?.fix).toBe('!p-4');
    expect(core.getHoverInfo(FIXTURE, 25, { languageId: 'html' })).not.toBe(
      null,
    );
    expect(
      core.getDiagnostics('<div class="p-4 p-8"></div>', {
        languageId: 'html',
      }),
    ).toHaveLength(2);
    expect(
      core.getDocumentColors(FIXTURE, { languageId: 'html' }),
    ).toHaveLength(1);
  });

  it('works when imported as ESM', async () => {
    const core = await import(ESM);

    expect(
      core.computeSemanticTokens(FIXTURE, { languageId: 'html' }).length,
    ).toBeGreaterThan(0);
    // offset 14 sits at the end of `p-`, inside the class attribute
    expect(
      core.getCompletions('<div class="p-"></div>', 14, { languageId: 'html' }),
    ).not.toBeNull();
    expect(
      core.getDocumentColors(FIXTURE, { languageId: 'html' }),
    ).toHaveLength(1);
  });

  it('agrees between the two builds', async () => {
    const cjs = require(CJS);
    const esm = await import(ESM);
    const ctx = { languageId: 'html' };

    expect(esm.computeSemanticTokens(FIXTURE, ctx)).toEqual(
      cjs.computeSemanticTokens(FIXTURE, ctx),
    );
    expect(esm.getDocumentColors(FIXTURE, ctx)).toEqual(
      cjs.getDocumentColors(FIXTURE, ctx),
    );
  });

  it('ships real ESM, not CommonJS with a different extension', () => {
    const esm = readFileSync(ESM, 'utf8');

    expect(esm).toMatch(/^export \{/m);
    expect(esm).not.toMatch(/\brequire\(/);
    expect(esm).not.toMatch(/\bmodule\.exports\b/);
  });

  it('leaves the engine packages external in both builds', () => {
    // Inlining them would ship a second copy of the engine and break the
    // single-stylesheet assumption at runtime.
    expect(readFileSync(ESM, 'utf8')).toMatch(/from ["']@f12io\/maple["']/);
    expect(readFileSync(CJS, 'utf8')).toMatch(
      /require\(["']@f12io\/maple["']\)/,
    );
  });

  it('emits declarations for the intelligence APIs', () => {
    const types = readFileSync(
      path.join(PACKAGE, 'dist', 'types', 'index.d.ts'),
      'utf8',
    );

    expect(types).toContain('computeSemanticTokens');
    expect(types).toContain('getCompletions');
    expect(types).toContain('getHoverInfo');
    expect(types).toContain('validateClass');
    expect(types).toContain('getDiagnostics');
    expect(types).toContain('getDocumentColors');
    expect(types).toContain('getColorPresentations');
  });
});
