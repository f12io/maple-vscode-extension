import { MAX_SCAN_LENGTH } from '@f12io/maple-language-core';
import { describe, expect, it } from 'vitest';
import { LanguageServiceRegistry } from '../src/services/LanguageServiceRegistry';

/**
 * A root element that declares the project's variables and aliases produces a
 * single class attribute far larger than any hand-written one. It must survive
 * extraction intact — overrunning the scan bound drops the whole attribute.
 */
describe('Large class attributes', () => {
  const buildClassValue = (minLength: number) => {
    const lines: Array<string> = [];
    let length = 0;
    for (let i = 0; length < minLength; i++) {
      const line = `    --alias-slot-${i}=area=header;g-{gap,4};&:has(>.\\@slot-media):cols=auto_1fr`;
      lines.push(line);
      length += line.length + 1;
    }
    return `\n    fw-bold\n${lines.join('\n')}\n    c-red-500\n  `;
  };

  it('extracts a class attribute longer than the old 5000 char bound', () => {
    const value = buildClassValue(10_000);
    const text = `<html lang="en" class="${value}">\n<body class="p-4"></body>\n</html>`;

    const classes =
      LanguageServiceRegistry.getService('html')!.extractClasses(text);

    expect(classes.length).toBe(2);
    expect(classes[0].value).toBe(value);
    expect(classes[0].value).toContain('fw-bold');
    expect(classes[0].value).toContain('c-red-500');
    expect(classes[1].value).toBe('p-4');
  });

  it('still gives up on an unterminated attribute past the scan bound', () => {
    const text = `<html class="${'fw-bold '.repeat(MAX_SCAN_LENGTH / 4)}`;

    const classes =
      LanguageServiceRegistry.getService('html')!.extractClasses(text);

    expect(classes.length).toBe(0);
  });
});
