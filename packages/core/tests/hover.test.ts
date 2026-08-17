import { describe, expect, it } from 'vitest';
import {
  getHoverInfo,
  type IntelligenceContext,
  type MapleHover,
} from '../src/index';

const ALIASES = new Map<string, string>([
  ['btn', 'bgc-red-500;p-2'],
  ['card', 'p-{space,4}'],
  ['broken', 'notaclass'],
]);

/** `|` marks the cursor. */
function hover(
  fixture: string,
  ctx: Partial<IntelligenceContext> = {},
): MapleHover | null {
  const offset = fixture.indexOf('|');
  return getHoverInfo(fixture.replace('|', ''), offset, {
    languageId: 'html',
    localAliases: ALIASES,
    ...ctx,
  });
}

describe('getHoverInfo', () => {
  describe('utilities', () => {
    it('returns the generated CSS for a class', () => {
      const info = hover('<div class="p-|2"></div>');
      expect(info?.className).toBe('p-2');
      expect(info?.css).toContain('padding');
      expect(info?.alias).toBeUndefined();
    });

    it('reports the span of the class under the cursor', () => {
      const info = hover('<div class="d-flex p-|2"></div>');
      expect(info?.start).toBe(19);
      expect(info?.end).toBe(22);
    });

    it('resolves the class at either edge of the word', () => {
      expect(hover('<div class="|p-2"></div>')?.className).toBe('p-2');
      expect(hover('<div class="p-2|"></div>')?.className).toBe('p-2');
    });

    it('keeps prefixes in the generated CSS', () => {
      const info = hover('<div class="md:hover:bgc-red-|500"></div>');
      expect(info?.css).toContain('min-width: 768px');
      expect(info?.css).toContain(':hover');
    });
  });

  describe('nothing to show', () => {
    it('returns null for a word the engine cannot convert', () => {
      expect(hover('<div class="notaclass|"></div>')).toBeNull();
    });

    it('returns null outside a maple region', () => {
      expect(hover('<div>p-|2</div>')).toBeNull();
    });

    it('returns null for an unsupported language', () => {
      expect(hover('<div class="p-|2"></div>', { languageId: 'rust' })).toBe(
        null,
      );
    });

    it('returns null between classes', () => {
      expect(hover('<div class="p-2 | d-flex"></div>')).toBeNull();
    });
  });

  describe('host languages', () => {
    it('hovers the class the framework renders, not the source escape', () => {
      // Razor renders `@@md:p-2` as `@md:p-2`
      const info = hover('<div class="bgc-green-500 @@md:p-|2"></div>', {
        languageId: 'razor',
      });
      expect(info?.className).toBe('@md:p-2');
      expect(info?.css).toContain('min-width: 768px');
      expect(info?.css).not.toContain('@@md');
    });

    it('does not drag newlines out of a multi-line class attribute', () => {
      const info = hover('<div class="\n  d-flex p-|2\n"></div>');
      // A word carrying a trailing newline gets CSS-escaped as `\a`
      expect(info?.className).toBe('p-2');
      expect(info?.css).not.toContain('\\a');
    });

    it('reads regions of other host languages', () => {
      expect(
        hover('<span className="p-|2" />', { languageId: 'javascriptreact' })
          ?.css,
      ).toContain('padding');
    });
  });

  describe('aliases', () => {
    it('expands a host-supplied alias', () => {
      const info = hover('<div class="@bt|n"></div>');
      expect(info?.className).toBe('@btn');
      expect(info?.alias?.name).toBe('btn');
      expect(info?.alias?.utilities).toEqual(['bgc-red-500', 'p-2']);
      expect(info?.css).toContain('background-color');
      expect(info?.css).toContain('padding');
    });

    it('re-attaches the prefixes of the usage to every utility', () => {
      const info = hover('<div class="@md:@bt|n"></div>');
      expect(info?.alias?.utilities).toEqual(['@md:bgc-red-500', '@md:p-2']);
      expect(info?.css).toContain('min-width: 768px');
    });

    it('substitutes named parameters', () => {
      const info = hover('<div class="@card(space:8|)"></div>');
      expect(info?.alias?.utilities).toEqual(['p-8']);
    });

    it('falls back to the parameter default when none is passed', () => {
      const info = hover('<div class="@car|d"></div>');
      expect(info?.alias?.utilities).toEqual(['p-4']);
    });

    it('expands an alias defined in the document itself', () => {
      const info = hover(
        '<html class="--alias-hero=p-8"><div class="@he|ro"></div></html>',
        { localAliases: undefined },
      );
      expect(info?.alias?.name).toBe('hero');
      expect(info?.css).toContain('padding');
    });

    it('still reports the expansion when it generates no CSS', () => {
      const info = hover('<div class="@broke|n"></div>');
      expect(info?.alias?.utilities).toEqual(['notaclass']);
      expect(info?.css).toBe('');
    });

    it('returns null for an alias nobody defined', () => {
      expect(hover('<div class="@nope|"></div>')).toBeNull();
    });
  });
});
