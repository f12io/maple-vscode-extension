import { describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';
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
    const input = "c-blue p-2 m-${isActive ? '2' : '3'} o-50 fw-normal ${isActive ? 'fs-50' : 'fs-60'} ${isActive ? `fs-50 m-${isActive ? '2' : '3'} bgc-red p-2 o-50` : `fs-60 m-${isActive ? '2' : '3'}`}";
    
    const expected = `
    c-blue
    p-2
    m-\${isActive ? '2' : '3'}
    o-50 fw-normal
    \${isActive ? 'fs-50' : 'fs-60'}
    \${isActive ? \`
      fs-50
      m-\${isActive ? '2' : '3'}
      bgc-red
      p-2
      o-50
    \` : \`
      fs-60
      m-\${isActive ? '2' : '3'}
    \`}
  `;

    const result = formatClasses(input, baseIndent, maxClassesPerLine, 'javascript');
    expect(result).toBe(expected);
  });

  it('formats PHP expressions', () => {
    const input = "c-blue p-2 m-<?= $isActive ? '2' : '3' ?> o-50 fw-normal <?= $isActive ? 'fs-50' : 'fs-60' ?> <?= $isActive ? 'fs-50 m-' . ($isActive ? '2' : '3') . ' bgc-red p-2 o-50' : 'fs-60 m-' . ($isActive ? '2' : '3') ?>";
    
    const expected = `
    c-blue
    p-2
    m-<?= $isActive ? '2' : '3' ?>
    o-50 fw-normal
    <?= $isActive ? 'fs-50' : 'fs-60' ?>
    <?= $isActive ? '
      fs-50
      m-' . ($isActive ? '2' : '3') . '
      bgc-red
      p-2
      o-50
    ' : '
      fs-60
      m-' . ($isActive ? '2' : '3') ?>
  `;

    const result = formatClasses(input, baseIndent, maxClassesPerLine, 'php');
    expect(result).toBe(expected);
  });

  it('formats Razor expressions', () => {
    const input = 'c-blue p-2 m-@(isActive ?"2" : "3") o-50 fw-normal @(isActive ? "fs-50" : "fs-60") @(isActive ? $@"fs-50 m-{(isActive ? "2" : "3")} bgc-red p-2 o-50" : $@"fs-60 m-{(isActive ? "2" : "3")}")';
    
    const expected = `
    c-blue
    p-2
    m-@(isActive ? "2" : "3")
    o-50 fw-normal
    @(isActive ? "fs-50" : "fs-60")
    @(isActive ? $@"
      fs-50
      m-{(isActive ? "2" : "3")}
      bgc-red
      p-2
      o-50
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
