import { describe, expect, it } from 'vitest';
import { validateClass } from '../src/index';

describe('validateClass', () => {
  it('accepts a class the engine can convert', () => {
    expect(validateClass('p-4')).toBeNull();
    expect(validateClass('@md:&:hover:bgc-red-500')).toBeNull();
  });

  it('ignores words that are not maple at all', () => {
    expect(validateClass('container')).toBeNull();
    expect(validateClass('')).toBeNull();
  });

  describe('important placement', () => {
    it('reports a trailing marker and points at the leading form', () => {
      expect(validateClass('p-4!')).toEqual({
        code: 'important-not-leading',
        fix: '!p-4',
        message: expect.stringContaining("'!p-4'"),
      });
    });

    it('reports a marker stranded after the prefix chain', () => {
      expect(validateClass('&:hover:!o-100')).toMatchObject({
        code: 'important-not-leading',
        fix: '!&:hover:o-100',
      });
      expect(validateClass('@md:!p-4')).toMatchObject({
        code: 'important-not-leading',
        fix: '!@md:p-4',
      });
    });

    it('accepts the marker at the front of a prefixed class', () => {
      expect(validateClass('!&:hover:o-100')).toBeNull();
      expect(validateClass('!@md:p-4')).toBeNull();
    });

    it('falls back to unknown-class when moving the marker would not help', () => {
      expect(validateClass('@md:!zz-100')?.code).toBe('unknown-class');
    });

    it('reports !important written into a `-` value', () => {
      expect(validateClass('bgc-#00f_!important')?.code).toBe(
        'important-literal',
      );
    });
  });

  describe('shades', () => {
    it('reports a tone outside the palette range', () => {
      expect(validateClass('bgc-red-951')).toEqual({
        code: 'invalid-shade',
        message: expect.stringContaining("'951'"),
      });
      expect(validateClass('bgc-red-49')?.code).toBe('invalid-shade');
    });

    it('accepts a tone inside it', () => {
      expect(validateClass('bgc-red-500')).toBeNull();
    });
  });

  describe('aliases', () => {
    it('reports a usage of an alias nothing defines', () => {
      expect(validateClass('@nope')).toEqual({
        code: 'unknown-class',
        message: "Invalid maple class: '@nope'",
      });
    });

    it('accepts a usage the host knows about', () => {
      expect(
        validateClass('@btn', {
          localAliases: new Map([['btn', 'bgc-red-500;p-2']]),
        }),
      ).toBeNull();
    });

    it('accepts a definition on html and rejects it elsewhere', () => {
      expect(validateClass('--alias-card=p-4', { tagName: 'html' })).toBeNull();
      expect(validateClass('--alias-card=p-4', { tagName: 'div' })).toEqual({
        code: 'alias-definition-scope',
        message: expect.stringContaining("'div'"),
      });
    });

    it('skips the scope rule when the host cannot report a tag', () => {
      expect(validateClass('--alias-card=p-4')).toBeNull();
    });
  });

  it('reports the most specific problem when several apply', () => {
    // Out-of-range tone *and* a trailing marker: the tone is the real defect.
    expect(validateClass('bgc-red-951!')?.code).toBe('invalid-shade');
  });
});
