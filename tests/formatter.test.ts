import { describe, expect, it } from 'vitest';
import { formatClasses } from '../src/providers/FormatterProvider';

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
