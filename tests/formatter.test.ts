import { describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';
import { detectIndentUnit, formatText } from '@f12io/maple-language-core';
import {
  applyFormatting,
  formatClasses,
} from '../src/providers/FormatterProvider';

vi.mock('../src/helpers/config', () => ({
  isExtensionEnabled: () => true,
  isExtensionExplicitlyDisabled: () => false,
  isFeatureEnabled: () => true,
  getHighlightingMode: () => 'on',
}));

function makeDocument(languageId: string, text: string) {
  const lineStarts = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') lineStarts.push(i + 1);
  }
  return {
    languageId,
    fileName: `test.${languageId}`,
    uri: { scheme: 'untitled', fsPath: '', toString: () => 'untitled:test' },
    getText: () => text,
    positionAt: (offset: number) => {
      let line = 0;
      while (line + 1 < lineStarts.length && lineStarts[line + 1] <= offset) {
        line++;
      }
      return { line, character: offset - lineStarts[line] };
    },
    offsetAt: (pos: { line: number; character: number }) =>
      lineStarts[pos.line] + pos.character,
  } as unknown as vscode.TextDocument;
}

describe('FormatterProvider.formatClasses', () => {
  const maxClassesPerLine = 4;
  const baseIndent = '  ';

  it('formats Javascript template literals', () => {
    const input =
      "c-blue p-2 m-${isActive ? '2' : '3'} o-50 fw-normal ${isActive ? 'fs-50' : 'fs-60'} ${isActive ? `fs-50 m-${isActive ? '2' : '3'} bgc-red p-2 o-50` : `fs-60 m-${isActive ? '2' : '3'}`}";

    const expected = `
    c-blue p-2
    m-\${isActive ? '2' : '3'}
    o-50 fw-normal
    \${isActive ? 'fs-50' : 'fs-60'}
    \${isActive ? \`
      fs-50
      m-\${isActive ? '2' : '3'}
      bgc-red p-2 o-50
    \` : \`
      fs-60
      m-\${isActive ? '2' : '3'}
    \`}
  `;

    const result = formatClasses(
      input,
      baseIndent,
      maxClassesPerLine,
      'javascript',
    );
    expect(result).toBe(expected);
  });

  it('merges singleton type-groups into neighboring lines', () => {
    // `fx` (flex → space type) sits between differently-typed neighbors;
    // without merging it would be stranded on a line of its own
    const input = 'bgc-primary-muted c-red m-2 p-2 fs-5 o-50 fx fxrow-cc abs';

    const expected = `
    bgc-primary-muted c-red
    m-2 p-2 fs-5 o-50
    fx fxrow-cc abs
  `;

    const result = formatClasses(input, baseIndent, maxClassesPerLine, 'html');
    expect(result).toBe(expected);
  });

  it('formats PHP expressions', () => {
    const input =
      "c-blue p-2 m-<?= $isActive ? '2' : '3' ?> o-50 fw-normal <?= $isActive ? 'fs-50' : 'fs-60' ?> <?= $isActive ? 'fs-50 m-' . ($isActive ? '2' : '3') . ' bgc-red p-2 o-50' : 'fs-60 m-' . ($isActive ? '2' : '3') ?>";

    const expected = `
    c-blue p-2
    m-<?= $isActive ? '2' : '3' ?>
    o-50 fw-normal
    <?= $isActive ? 'fs-50' : 'fs-60' ?>
    <?= $isActive ? '
      fs-50
      m-' . ($isActive ? '2' : '3') . '
      bgc-red p-2 o-50
    ' : '
      fs-60
      m-' . ($isActive ? '2' : '3') ?>
  `;

    const result = formatClasses(input, baseIndent, maxClassesPerLine, 'php');
    expect(result).toBe(expected);
  });

  it('formats Razor expressions', () => {
    const input =
      'c-blue p-2 m-@(isActive ?"2" : "3") o-50 fw-normal @(isActive ? "fs-50" : "fs-60") @(isActive ? $@"fs-50 m-{(isActive ? "2" : "3")} bgc-red p-2 o-50" : $@"fs-60 m-{(isActive ? "2" : "3")}")';

    const expected = `
    c-blue p-2
    m-@(isActive ? "2" : "3")
    o-50 fw-normal
    @(isActive ? "fs-50" : "fs-60")
    @(isActive ? $@"
      fs-50
      m-{(isActive ? "2" : "3")}
      bgc-red p-2 o-50
    " : $@"
      fs-60
      m-{(isActive ? "2" : "3")}
    ")
  `;

    const result = formatClasses(input, baseIndent, maxClassesPerLine, 'razor');
    expect(result).toBe(expected);
  });
});

describe('applyFormatting for /* maple */ opt-in strings', () => {
  const maxClassesPerLine = 4;

  it('upgrades JS single-quoted strings to template literals when wrapping', () => {
    const doc = makeDocument(
      'javascript',
      "const a = /* maple */ 'c-blue p-2 m-2 o-50 fw-normal fs-50';",
    );
    const edits = applyFormatting(doc, maxClassesPerLine);

    expect(edits).toHaveLength(1);
    expect(edits[0].newText.startsWith('`')).toBe(true);
    expect(edits[0].newText.endsWith('`')).toBe(true);
    expect(edits[0].newText).toContain('\n');
    expect(edits[0].newText).toContain('c-blue');
    expect(edits[0].newText).toContain('fs-50');
  });

  it('formats opted-in template literals in place', () => {
    const doc = makeDocument(
      'javascript',
      'const a = /* maple */ `c-blue p-2 m-2 o-50 fw-normal fs-50`;',
    );
    const edits = applyFormatting(doc, maxClassesPerLine);

    expect(edits).toHaveLength(1);
    expect(edits[0].newText.startsWith('`')).toBe(true);
    expect(edits[0].newText).toContain('\n');
  });

  it('upgrades razor $" strings to verbatim $@" when wrapping', () => {
    const doc = makeDocument(
      'razor',
      'var cls = /* maple */ $"c-blue p-2 m-{pad} o-50 fw-normal fs-50";',
    );
    const edits = applyFormatting(doc, maxClassesPerLine);

    expect(edits).toHaveLength(1);
    expect(edits[0].newText.startsWith('$@"')).toBe(true);
    expect(edits[0].newText.endsWith('"')).toBe(true);
    expect(edits[0].newText).toContain('\n');
    expect(edits[0].newText).toContain('m-{pad}');
  });

  it('leaves escape-bearing razor $" strings untouched', () => {
    const doc = makeDocument(
      'razor',
      'var cls = /* maple */ $"c-blue\\tp-2 m-2 o-50 fw-normal fs-50";',
    );
    const edits = applyFormatting(doc, maxClassesPerLine);

    // Upgrading to verbatim would change what \t means at runtime
    expect(edits).toHaveLength(0);
  });

  it('keeps PHP quotes as-is (newlines are legal in PHP strings)', () => {
    const doc = makeDocument(
      'php',
      "<?php $cls = /* maple */ 'c-blue p-2 m-2 o-50 fw-normal fs-50'; ?>",
    );
    const edits = applyFormatting(doc, maxClassesPerLine);

    expect(edits).toHaveLength(1);
    expect(edits[0].newText.startsWith("'")).toBe(true);
    expect(edits[0].newText.endsWith("'")).toBe(true);
    expect(edits[0].newText).toContain('\n');
  });

  it('formats PHP opt-in ternaries with the same structure as class attributes', () => {
    const doc = makeDocument(
      'php',
      "<?php $extraClass = /* maple */ $isActive ? 'fs-50 m-' . ($isActive ? '2' : '3') . ' bgc-red p-2 o-50' : 'fs-60 m-' . ($isActive ? '2' : '3'); ?>",
    );
    const edits = applyFormatting(doc, maxClassesPerLine);

    expect(edits).toHaveLength(1);
    const result = edits[0].newText;
    // The arm exceeds maxClassesPerLine, so it wraps with the concatenation
    // structure preserved — not collapsed per-literal
    expect(result).toContain('\n');
    expect(result).toContain("' . ($isActive ? '2' : '3') . '");
    expect(result).toContain('fs-50');
    expect(result).toContain('bgc-red');
    expect(result).toContain('fs-60');
  });

  it('formats razor opt-in ternaries with the same structure as class attributes', () => {
    const doc = makeDocument(
      'razor',
      'var cls = /* maple */ isActive ? $@"fs-50 m-{pad} bgc-red p-2 o-50" : $@"fs-60 m-{pad}";',
    );
    const edits = applyFormatting(doc, maxClassesPerLine);

    expect(edits).toHaveLength(1);
    const result = edits[0].newText;
    expect(result).toContain('\n');
    expect(result).toContain('$@"');
    expect(result).toContain('m-{pad}');
    expect(result).toContain('fs-60');
  });

  it('formats string arguments of clsx/classNames/cva calls', () => {
    const doc = makeDocument(
      'javascript',
      "const c = clsx('c-blue p-2 m-2 o-50 fw-normal fs-50', cond && 'p-1');",
    );
    const edits = applyFormatting(doc, maxClassesPerLine);

    expect(edits).toHaveLength(1);
    expect(edits[0].newText.startsWith('`')).toBe(true);
    expect(edits[0].newText).toContain('\n');
    expect(edits[0].newText).toContain('c-blue');
  });

  it('formats template literals inside JSX className expressions', () => {
    const doc = makeDocument(
      'javascriptreact',
      '<div className={`c-blue p-2 m-2 o-50 fw-normal fs-50`}>',
    );
    const edits = applyFormatting(doc, maxClassesPerLine);

    expect(edits).toHaveLength(1);
    expect(edits[0].newText.startsWith('`')).toBe(true);
    expect(edits[0].newText).toContain('\n');
  });

  it('formats ternaries inside JSX className expressions structurally', () => {
    const doc = makeDocument(
      'javascriptreact',
      '<div className={cond ? `c-blue p-2 m-2 o-50 fw-normal fs-50` : `fs-60 m-1`}>',
    );
    const edits = applyFormatting(doc, maxClassesPerLine);

    expect(edits).toHaveLength(1);
    expect(edits[0].newText).toContain(' ? `');
    expect(edits[0].newText).toContain('` : `');
    expect(edits[0].newText).toContain('\n');
  });

  it('formats svelte class expressions, upgrading quotes when wrapping', () => {
    const doc = makeDocument(
      'svelte',
      "<div class={cond ? 'c-blue p-2 m-2 o-50 fw-normal fs-50' : 'fs-60'}>",
    );
    const edits = applyFormatting(doc, maxClassesPerLine);

    expect(edits).toHaveLength(1);
    expect(edits[0].newText.startsWith('`')).toBe(true);
    expect(edits[0].newText).toContain('\n');
  });

  it('does not produce overlapping edits when clsx is also opted in', () => {
    const doc = makeDocument(
      'javascript',
      "const c = /* maple */ clsx('c-blue p-2 m-2 o-50 fw-normal fs-50');",
    );
    const edits = applyFormatting(doc, maxClassesPerLine);

    // The opt-in region and the clsx region cover the same literal; it must
    // be edited exactly once
    expect(edits).toHaveLength(1);
    expect(edits[0].newText).toContain('c-blue');
  });

  it('normalizes vue :class literals on a single line only', () => {
    const doc = makeDocument(
      'vue',
      `<div :class="cond ? 'c-blue    p-2' : 'm-1'">`,
    );
    const edits = applyFormatting(doc, maxClassesPerLine);

    // Whitespace normalization applies, but no multi-line rewrite: JS strings
    // inside an HTML attribute cannot span lines
    expect(edits).toHaveLength(1);
    expect(edits[0].newText).toBe("'c-blue p-2'");
  });

  it('never wraps angular template expression literals across lines', () => {
    const doc = makeDocument(
      'html',
      `<div [ngClass]="cond ? 'c-blue p-2 m-2 o-50 fw-normal fs-50' : 'm-1'">`,
    );
    const edits = applyFormatting(doc, maxClassesPerLine);

    // The literal exceeds maxClassesPerLine but Angular expressions cannot
    // hold multi-line strings, so it must be left untouched
    expect(edits).toHaveLength(0);
  });

  it('leaves short opt-in strings unchanged', () => {
    const doc = makeDocument(
      'javascript',
      "const a = /* maple */ 'c-blue p-2';",
    );
    const edits = applyFormatting(doc, maxClassesPerLine);

    expect(edits).toHaveLength(0);
  });
});

describe('html element gets one class per line', () => {
  const maxClassesPerLine = 4;

  const format = (text: string) => formatText(text, 'html', maxClassesPerLine);

  it('keeps the html tag on one line at or under the limit', () => {
    const text =
      '<html class="--alias-a=p-2 --alias-b=m-2 --alias-c=o-50 --alias-d=c-red-500">';

    expect(format(text)).toBe(text);
  });

  it('gives every class its own line once over the limit', () => {
    const text =
      '<html class="--alias-a=p-2 --alias-b=m-2 --alias-c=o-50 --alias-d=c-red-500 --alias-e=fs-50">';

    expect(format(text)).toBe(`<html class="
  --alias-a=p-2
  --alias-b=m-2
  --alias-c=o-50
  --alias-d=c-red-500
  --alias-e=fs-50
">`);
  });

  it('still groups by property type on other elements', () => {
    const text =
      '<div class="bgc-red-500 p-2 m-4 o-50 c-blue brc-red-500 pb-2 mt-4">';

    expect(format(text)).toBe(`<div class="
  bgc-red-500 p-2 m-4 o-50
  c-blue brc-red-500
  pb-2 mt-4
">`);
  });
});

describe('author blank lines are preserved', () => {
  const maxClassesPerLine = 4;

  const format = (text: string) => formatText(text, 'html', maxClassesPerLine);

  it('formats each block on its own, without merging across the gap', () => {
    const text = `<div class="
  bgc-red-500 p-2

  m-4 o-50 c-blue brc-red-500 pb-2 mt-4
">`;

    expect(format(text)).toBe(`<div class="
  bgc-red-500 p-2

  m-4 o-50
  c-blue brc-red-500
  pb-2 mt-4
">`);
  });

  it('keeps short blocks apart instead of collapsing to one line', () => {
    const text = `<div class="
  p-2

  m-4
">`;

    expect(format(text)).toBe(text);
  });

  it('is stable across repeated formatting', () => {
    const text = `<html class="
  --alias-a=p-2 --alias-b=m-2

  --alias-c=o-50 --alias-d=c-red-500 --alias-e=fs-50
">`;

    const once = format(text);
    expect(once).toBe(`<html class="
  --alias-a=p-2
  --alias-b=m-2

  --alias-c=o-50
  --alias-d=c-red-500
  --alias-e=fs-50
">`);
    expect(format(once)).toBe(once);
  });
});

describe('indentation follows the file', () => {
  const maxClassesPerLine = 4;
  const classes = 'bgc-red-500 p-2 m-4 o-50 c-blue brc-red-500';

  it('defaults to two spaces when the file has no indentation', () => {
    expect(formatText(`<div class="${classes}">`, 'html', maxClassesPerLine))
      .toBe(`<div class="
  bgc-red-500 p-2 m-4 o-50
  c-blue brc-red-500
">`);
  });

  it('uses a tab when the file is tab-indented', () => {
    const text = `<body>\n\t<div class="${classes}"></div>\n</body>`;

    expect(formatText(text, 'html', maxClassesPerLine)).toBe(`<body>
\t<div class="
\t\tbgc-red-500 p-2 m-4 o-50
\t\tc-blue brc-red-500
\t"></div>
</body>`);
  });

  it('uses four spaces when the file indents by four', () => {
    const text = `<body>\n    <div class="${classes}"></div>\n</body>`;

    expect(formatText(text, 'html', maxClassesPerLine)).toBe(`<body>
    <div class="
        bgc-red-500 p-2 m-4 o-50
        c-blue brc-red-500
    "></div>
</body>`);
  });

  it('gives nested interpolations the same unit', () => {
    const text = [
      'function a() {',
      '\tconst cls = /* maple */ `c-blue p-2 m-2 o-50 fw-normal ${cond ? `p-4 m-4 o-60 fw-bold` : `p-8`}`;',
      '}',
    ].join('\n');

    const out = formatText(text, 'javascript', maxClassesPerLine);

    expect(out).toContain('\n\t\tc-blue');
    expect(out).not.toContain('  c-blue');
  });
});

describe('detectIndentUnit', () => {
  it('reads the file step', () => {
    expect(detectIndentUnit('<a>\n  <b>\n    <c>\n  </b>\n</a>')).toBe('  ');
    expect(detectIndentUnit('<a>\n    <b>\n        <c>\n    </b>\n</a>')).toBe(
      '    ',
    );
    expect(detectIndentUnit('<a>\n\t<b>\n\t\t<c>\n\t</b>\n</a>')).toBe('\t');
  });

  it('is not thrown off by one-space comment continuations', () => {
    const js = [
      '/**',
      ' * A doc block whose continuation lines are indented by one.',
      ' */',
      'function a() {',
      '  const b = 1;',
      '  if (b) {',
      '    return 2;',
      '  }',
      '}',
    ].join('\n');

    expect(detectIndentUnit(js)).toBe('  ');
  });

  it('falls back to two spaces when the file has no indentation', () => {
    expect(detectIndentUnit('<div class="a b">x</div>')).toBe('  ');
  });
});

describe('attribute on its own line', () => {
  const maxClassesPerLine = 4;

  it('indents from the attribute line, not one character short of it', () => {
    const text = `<html\n  class="--alias-a=p-2 --alias-b=m-2 --alias-c=o-50 --alias-d=c-red-500 --alias-e=fs-50"\n>\n  <body></body>\n</html>`;

    expect(formatText(text, 'html', maxClassesPerLine)).toBe(`<html
  class="
    --alias-a=p-2
    --alias-b=m-2
    --alias-c=o-50
    --alias-d=c-red-500
    --alias-e=fs-50
  "
>
  <body></body>
</html>`);
  });

  it('repairs a file whose classes drifted to an odd column, then holds', () => {
    const drifted = `<html\n  class="\n   --alias-a=p-2\n   --alias-b=m-2\n   --alias-c=o-50\n   --alias-d=c-red-500\n   --alias-e=fs-50\n "\n>`;

    const repaired = formatText(drifted, 'html', maxClassesPerLine);

    expect(repaired).toBe(`<html
  class="
    --alias-a=p-2
    --alias-b=m-2
    --alias-c=o-50
    --alias-d=c-red-500
    --alias-e=fs-50
  "
>`);
    expect(formatText(repaired, 'html', maxClassesPerLine)).toBe(repaired);
  });
});
