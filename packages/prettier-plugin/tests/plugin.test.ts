import * as prettier from 'prettier';
import { describe, expect, it } from 'vitest';
import * as plugin from '../src/index';

async function format(source: string, parser: string): Promise<string> {
  return prettier.format(source, {
    parser,
    plugins: [plugin],
  });
}

describe('@f12io/prettier-plugin-maple', () => {
  it('wraps long html class attributes onto multiple lines', async () => {
    const result = await format(
      '<div class="c-blue p-2 m-2 o-50 fw-normal fs-50"></div>',
      'html',
    );

    expect(result).toMatch(/class="\n/);
    expect(result).toContain('c-blue');
    expect(result).toContain('fs-50');
  });

  it('re-indents wrapped class attributes to the element position', async () => {
    const result = await format(
      '<section><div><span class="c-blue p-2 m-2 o-50 fw-normal fs-50"></span></div></section>',
      'html',
    );

    // The class lines sit deeper than the nested element's own indentation
    const classLine = result
      .split('\n')
      .find((line) => line.includes('c-blue'));
    const elementLine = result
      .split('\n')
      .find((line) => line.includes('<span'));
    expect(classLine).toBeDefined();
    expect(elementLine).toBeDefined();
    expect((classLine ?? '').search(/\S/)).toBeGreaterThan(
      (elementLine ?? '').search(/\S/),
    );
  });

  it('keeps short html class attributes on one line, normalized', async () => {
    const result = await format(
      '<div class="c-blue    p-2   m-2"></div>',
      'html',
    );

    expect(result).toContain('class="c-blue p-2 m-2"');
  });

  it('formats maple classes inside embedded script tags', async () => {
    const result = await format(
      '<script>const c = /* maple */ "c-blue p-2 m-2 o-50 fw-normal fs-50";</script>',
      'html',
    );

    // The embedded script routes through the wrapped babel parser
    expect(result).toContain('`');
    expect(result).toMatch(/`\n/);
    expect(result).toContain('fs-50');
  });

  it('leaves short class attributes on one line', async () => {
    const result = await format('<div class="c-blue p-2"></div>', 'html');
    expect(result).toContain('class="c-blue p-2"');
  });

  it('formats className template literals via the babel parser', async () => {
    const result = await format(
      'const x = <div className={`c-blue p-2 m-2 o-50 fw-normal fs-50`} />;',
      'babel',
    );

    expect(result).toMatch(/className=\{`\n/);
    expect(result).toContain('fs-50');
  });

  it('formats /* maple */ opt-in strings via the typescript parser', async () => {
    const result = await format(
      "const cls = /* maple */ 'c-blue p-2 m-2 o-50 fw-normal fs-50';\n",
      'typescript',
    );

    // Upgraded to a template literal to hold the multi-line layout
    expect(result).toContain('`');
    expect(result).toContain('\n');
    expect(result).toContain('c-blue');
  });

  it('is idempotent', async () => {
    const source = '<div class="c-blue p-2 m-2 o-50 fw-normal fs-50"></div>';
    const once = await format(source, 'html');
    const twice = await format(once, 'html');
    expect(twice).toBe(once);
    expect(once).toMatch(/class="\n/);
  });

  it('respects mapleMaxClassesPerLine', async () => {
    const result = await prettier.format(
      'const x = <div className={`c-blue p-2`} />;',
      { parser: 'babel', plugins: [plugin], mapleMaxClassesPerLine: 1 },
    );

    expect(result).toMatch(/className=\{`\n/);
    expect(result).toMatch(/c-blue\n/);
  });
});
