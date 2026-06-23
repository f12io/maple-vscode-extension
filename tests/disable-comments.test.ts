import { describe, expect, it } from 'vitest';
import { extractAllClasses } from '../src/helpers/class-extractor';

describe('Inline Disable Comments', () => {
  it('should skip entire file if maple-disable-file is present', () => {
    const text = `
      /* maple-disable-file */
      const x = <div class="bg-red-500"></div>;
      const y = <span className="text-xl"></span>;
    `;
    const classes = extractAllClasses(text);
    expect(classes.length).toBe(0);
  });

  it('should skip specific line if maple-disable-line is present', () => {
    const text = `
      const x = <div class="bg-red-500"></div>; // maple-disable-line
      const y = <span className="text-xl"></span>;
    `;
    const classes = extractAllClasses(text);
    expect(classes.length).toBe(1);
    expect(classes[0].value).toBe('text-xl');
  });

  it('should skip next line if maple-disable-next-line is present', () => {
    const text = `
      // maple-disable-next-line
      const x = <div class="bg-red-500"></div>;
      const y = <span className="text-xl"></span>;
    `;
    const classes = extractAllClasses(text);
    expect(classes.length).toBe(1);
    expect(classes[0].value).toBe('text-xl');
  });

  it('should skip blocks if maple-disable is used', () => {
    const text = `
      const a = <div class="btn"></div>;
      /* maple-disable */
      const b = <div class="bg-red-500"></div>;
      const c = <span className="text-xl"></span>;
      /* maple-enable */
      const d = <span className="flex"></span>;
    `;
    const classes = extractAllClasses(text);
    expect(classes.length).toBe(2);
    expect(classes[0].value).toBe('btn');
    expect(classes[1].value).toBe('flex');
  });
});
