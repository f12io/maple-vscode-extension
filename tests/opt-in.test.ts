import { describe, expect, it } from 'vitest';
import { LanguageServiceRegistry } from '../src/services/LanguageServiceRegistry';

describe('Opt-in Comments', () => {
  it('should extract strings with /* maple */ comment', () => {
    const text = `
      const a = /* maple */ 'fw-bold c-red';
      const b = /* maple */ \`
        fw-normal
        c-blue
      \`;
      const c = "ignored";
    `;
    const classes =
      LanguageServiceRegistry.getService('html')!.extractClasses(text);
    expect(classes.length).toBe(2);
    expect(classes[0].value).toBe('fw-bold c-red');
    expect(classes[1].value).toContain('fw-normal');
    expect(classes[1].value).toContain('c-blue');
  });

  it('should extract objects with /* maple */ comment', () => {
    const text = `
      const x = /* maple */ {
        'bg-red-500': true,
        'c-white': false
      };
    `;
    const classes =
      LanguageServiceRegistry.getService('html')!.extractClasses(text);
    expect(classes.length).toBe(2);
    expect(classes[0].value).toBe('bg-red-500');
    expect(classes[1].value).toBe('c-white');
  });
});
