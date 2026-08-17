import { describe, expect, it } from 'vitest';
import {
  getCompletions,
  type IntelligenceContext,
  type MapleCompletion,
} from '../src/index';

const ALIASES = new Map<string, string>([
  ['btn', 'bgc-red-500;p-2'],
  ['card', 'p-{space,4}'],
]);

/** `|` marks the cursor. */
function complete(
  fixture: string,
  ctx: Partial<IntelligenceContext> = {},
): Array<MapleCompletion> {
  const offset = fixture.indexOf('|');
  const items = getCompletions(fixture.replace('|', ''), offset, {
    languageId: 'html',
    localAliases: ALIASES,
    ...ctx,
  });
  if (!items) throw new Error('expected to be inside a maple region');
  return items;
}

function labels(items: Array<MapleCompletion>): Array<string> {
  return items.map((item) => item.label);
}

function find(
  items: Array<MapleCompletion>,
  label: string,
): MapleCompletion | undefined {
  return items.find((item) => item.label === label);
}

describe('getCompletions', () => {
  describe('region gating', () => {
    it('returns null outside a maple region', () => {
      const fixture = '<div>hello bgc-|</div>';
      expect(
        getCompletions(fixture.replace('|', ''), fixture.indexOf('|'), {
          languageId: 'html',
        }),
      ).toBeNull();
    });

    it('returns suggestions inside a class attribute', () => {
      expect(complete('<div class="bgc-|"></div>').length).toBeGreaterThan(0);
    });

    it('returns null for an unsupported language', () => {
      const fixture = '<div class="bgc-|"></div>';
      expect(
        getCompletions(fixture.replace('|', ''), fixture.indexOf('|'), {
          languageId: 'rust',
        }),
      ).toBeNull();
    });

    it('reads regions of other host languages', () => {
      expect(
        labels(
          complete('<span className="bgc-|" />', {
            languageId: 'javascriptreact',
          }),
        ),
      ).toContain('bgc-red');
    });
  });

  describe('key context', () => {
    const items = complete('<div class="|"></div>');

    it('suggests abbreviations with their full keys', () => {
      expect(labels(items)).toEqual(
        expect.arrayContaining([
          'p-',
          'padding-',
          'bgc-',
          'backgroundColor-',
          'background-color-',
        ]),
      );
    });

    it('marks abbreviations as properties and ranks popular ones first', () => {
      // `d-` is also the full key of `vecd`, so match on the abbreviation.
      const display = items.find((item) => item.detail === 'Maple: display');
      expect(display?.label).toBe('d-');
      expect(display?.kind).toBe('property');
      expect(display?.sortText).toBe('2-000-d');
    });

    it('suggests pseudo classes', () => {
      const hover = find(items, 'hover:');
      expect(hover?.kind).toBe('pseudo');
      expect(hover?.insertText).toBe('hover:');
      expect(hover?.sortText).toBe('8-hover');
    });

    it('suggests container and media query prefixes', () => {
      expect(find(items, 'md:')?.kind).toBe('mediaQuery');
      expect(find(items, '@md:')?.kind).toBe('mediaQuery');
      expect(find(items, '@md:')?.sortText).toBe('0-@md');
    });

    it('suggests predefined variables', () => {
      const shift = find(items, '--l-shift=');
      expect(shift?.kind).toBe('variable');
      expect(shift?.insertText).toBe('--l-shift=');
    });

    it('suggests builtin aliases and host aliases', () => {
      expect(find(items, 'fx')?.kind).toBe('alias');
      const btn = find(items, '@btn');
      expect(btn?.kind).toBe('localAlias');
      expect(btn?.documentation).toContain('bgc-red-500;p-2');
    });

    it('does not suggest values', () => {
      expect(labels(items)).not.toContain('bgc-red');
    });
  });

  describe('alias definition keyword', () => {
    it('is offered on the html element', () => {
      expect(labels(complete('<html class="|"></html>'))).toContain('--alias-');
    });

    it('is not offered on other elements', () => {
      expect(labels(complete('<div class="|"></div>'))).not.toContain(
        '--alias-',
      );
    });
  });

  describe('media query context', () => {
    const items = complete('<div class="@|"></div>');

    it('suggests breakpoints and aliases only', () => {
      expect(labels(items)).toEqual(
        expect.arrayContaining(['@md:', '@dark:', '@btn']),
      );
      expect(labels(items)).not.toContain('hover:');
      expect(labels(items)).not.toContain('p-');
    });
  });

  describe('color values', () => {
    it('suggests named colors and the CSS-wide color keywords', () => {
      const items = complete('<div class="bgc-|"></div>');
      expect(labels(items)).toEqual(
        expect.arrayContaining([
          'bgc-red',
          'bgc-transparent',
          'bgc-current',
          'bgc-inherit',
        ]),
      );
      expect(find(items, 'bgc-red')?.kind).toBe('color');
    });

    it('suggests tones once a color is typed', () => {
      const items = complete('<div class="bgc-red-|"></div>');
      expect(labels(items)).toContain('bgc-red-500');
      expect(find(items, 'bgc-red-500')?.detail).toContain('tone 500');
    });

    it('suggests opacities after a slash', () => {
      const items = complete('<div class="bgc-red/|"></div>');
      expect(labels(items)).toContain('bgc-red/50');
      expect(find(items, 'bgc-red/50')?.detail).toBe('Opacity 50%');
    });
  });

  describe('sizing values', () => {
    it('suggests spacing steps for space properties', () => {
      const items = complete('<div class="p-|"></div>');
      expect(labels(items)).toEqual(
        expect.arrayContaining(['p-0', 'p-0.25', 'p-4', 'p-auto']),
      );
      expect(find(items, 'p-4')?.kind).toBe('value');
    });

    it('suggests fractions for dimension properties only', () => {
      expect(labels(complete('<div class="w-1|"></div>'))).toContain('w-1/2');
      expect(labels(complete('<div class="p-1|"></div>'))).not.toContain(
        'p-1/2',
      );
    });

    it('suggests the enumerated values of a keyword property', () => {
      const items = complete('<div class="d-|"></div>');
      expect(labels(items)).toEqual(
        expect.arrayContaining(['d-flex', 'd-block', 'd-none']),
      );
      expect(labels(items)).not.toContain('d-4');
    });

    it('suggests CSS-wide keywords for any property', () => {
      expect(labels(complete('<div class="p-in|"></div>'))).toEqual(
        expect.arrayContaining(['p-inherit', 'p-initial']),
      );
    });

    it('completes the last segment of a multi-value property', () => {
      expect(labels(complete('<div class="m-4_|"></div>'))).toContain('m-4_2');
    });

    it('handles negative values', () => {
      expect(labels(complete('<div class="-m-|"></div>'))).toContain('-m-4');
    });
  });

  describe('gradients', () => {
    it('suggests gradient functions', () => {
      expect(labels(complete('<div class="bgimg-|"></div>'))).toContain(
        'bgimg-linear',
      );
    });

    it('suggests directions after the gradient function', () => {
      expect(labels(complete('<div class="bgimg-linear||"></div>'))).toContain(
        'bgimg-linear|to_right',
      );
    });
  });

  describe('prefixes', () => {
    it('carries a typed pseudo prefix into value suggestions', () => {
      expect(labels(complete('<div class="hover:p-|"></div>'))).toContain(
        'hover:p-4',
      );
    });

    it('carries a typed prefix into key suggestions', () => {
      const items = complete('<div class="hover:|"></div>');
      const padding = find(items, 'p-');
      expect(padding?.insertText).toBe('hover:p-');
    });

    // Svelte's `class:x` and Angular's `[class.x]` bindings mostly resolve to
    // their own regions rather than reaching here; these pin the prefix
    // stripping itself.
    it('keeps a framework binding prefix in key suggestions', () => {
      expect(
        find(complete('<div class="class:|"></div>'), 'p-')?.insertText,
      ).toBe('class:p-');
      expect(
        find(complete('<div class="[class.|"></div>'), 'p-')?.insertText,
      ).toBe('[class.p-');
    });

    it('keeps an alias definition prefix in key suggestions', () => {
      const items = complete('<html class="--alias-btn=|"></html>');
      expect(find(items, 'p-')?.insertText).toBe('--alias-btn=p-');
    });

    it('keeps an alias definition prefix in value suggestions', () => {
      // The replace span covers `--alias-btn=bgc-`, so an item that inserts a
      // bare `bgc-red` would drop the definition it belongs to — and never
      // match the host's filter in the first place.
      const red = find(
        complete('<html class="--alias-btn=bgc-|"></html>'),
        'bgc-red',
      );
      expect(red?.insertText).toBe('--alias-btn=bgc-red');
      expect(red?.filterText).toBe('--alias-btn=bgc-red');
    });

    it('leaves values untouched when there is no prefix to keep', () => {
      const item = find(complete('<div class="hover:p-|"></div>'), 'hover:p-4');
      expect(item?.insertText).toBe('hover:p-4');
    });
  });

  describe('replace range', () => {
    it('covers the token under the cursor', () => {
      const items = complete('<div class="bgc-|"></div>');
      for (const item of items) {
        expect(item.replaceStart).toBe(12);
        expect(item.replaceEnd).toBe(16);
      }
    });

    it('is empty when there is no token to replace', () => {
      const items = complete('<div class="|"></div>');
      for (const item of items) {
        expect(item.replaceStart).toBe(12);
        expect(item.replaceEnd).toBe(12);
      }
    });

    it('is empty when the cursor sits between tokens', () => {
      // Nothing to replace after a space — in particular not the closing
      // quote and the markup that follows it.
      for (const item of complete('<div class="p-4 |"></div>')) {
        expect(item.replaceStart).toBe(16);
        expect(item.replaceEnd).toBe(16);
      }
    });

    it('covers the whole token when the cursor is mid-token', () => {
      for (const item of complete('<div class="p-|4"></div>')) {
        expect(item.replaceStart).toBe(12);
        expect(item.replaceEnd).toBe(15);
      }
    });
  });

  describe('shape', () => {
    it('gives every item a label, insert text and sort text', () => {
      for (const item of complete('<div class="p-|"></div>')) {
        expect(item.label.length).toBeGreaterThan(0);
        expect(item.insertText.length).toBeGreaterThan(0);
        expect(item.sortText.length).toBeGreaterThan(0);
      }
    });
  });
});
