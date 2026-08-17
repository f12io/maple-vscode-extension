import { describe, expect, it } from 'vitest';
import {
  computeSemanticTokens,
  MAPLE_TOKEN_COLORS_DARK_PLUS,
  MAPLE_TOKEN_SCOPES,
  MAPLE_TOKEN_TYPES,
  type IntelligenceContext,
  type MapleSemanticToken,
} from '../src/index';

const ALIASES = new Map<string, string>([
  ['btn', 'bgc-red-500;p-2'],
  ['card', 'p-{space,4}'],
]);

function tokenize(
  text: string,
  ctx: Partial<IntelligenceContext> = {},
): Array<MapleSemanticToken> {
  return computeSemanticTokens(text, {
    languageId: 'html',
    localAliases: ALIASES,
    ...ctx,
  });
}

/** Tokens as `[text, type]` pairs, which is what the taxonomy tests assert. */
function tokenize2(
  text: string,
  ctx: Partial<IntelligenceContext> = {},
): Array<[string, string]> {
  return tokenize(text, ctx).map((token) => [
    text.slice(token.start, token.start + token.length),
    token.type,
  ]);
}

/** Wraps a class list in a class attribute so it sits inside a maple region. */
function html(classes: string): string {
  return `<div class="${classes}"></div>`;
}

describe('computeSemanticTokens', () => {
  describe('token taxonomy', () => {
    it('splits a utility into key, separator and value', () => {
      expect(tokenize2(html('p-4'))).toEqual([
        ['p', 'utility'],
        ['-', 'separator'],
        ['4', 'value'],
      ]);
    });

    it('tokenizes a media query prefix chain', () => {
      expect(tokenize2(html('md:hover:bgc-red-500'))).toEqual([
        ['md:hover', 'mediaQuery'],
        [':', 'separator'],
        ['bgc', 'utility'],
        ['-', 'separator'],
        ['red-500', 'value'],
      ]);
    });

    it('marks a leading `!` as important', () => {
      expect(tokenize2(html('!p-4'))).toEqual([
        ['!', 'important'],
        ['p', 'utility'],
        ['-', 'separator'],
        ['4', 'value'],
      ]);
    });

    it('tokenizes a variable as key, separator and value', () => {
      expect(tokenize2(html('--spacer=0.5'))).toEqual([
        ['--spacer', 'variable'],
        ['=', 'separator'],
        ['0.5', 'value'],
      ]);
    });

    it('tokenizes a parent selector and its underscores', () => {
      expect(tokenize2(html('^parent_p:d-flex'))).toEqual([
        ['^', 'selectorOperator'],
        ['parent', 'parentSelector'],
        ['_', 'underscore'],
        ['p', 'parentSelector'],
        [':', 'separator'],
        ['d', 'utility'],
        ['-', 'separator'],
        ['flex', 'value'],
      ]);
    });

    it('tokenizes a self selector', () => {
      expect(tokenize2(html('&:hover:c-blue-500'))).toEqual([
        ['&', 'selectorOperator'],
        [':hover', 'selfSelector'],
        [':', 'separator'],
        ['c', 'utility'],
        ['-', 'separator'],
        ['blue-500', 'value'],
      ]);
    });

    it('tokenizes a child selector', () => {
      expect(tokenize2(html('/li:m-2'))).toEqual([
        ['/', 'selectorOperator'],
        ['li', 'childSelector'],
        [':', 'separator'],
        ['m', 'utility'],
        ['-', 'separator'],
        ['2', 'value'],
      ]);
    });

    it('tokenizes a `{param,fallback}` placeholder', () => {
      expect(tokenize2(html('p-{space,4}'))).toEqual([
        ['p', 'utility'],
        ['-', 'separator'],
        ['{', 'separator'],
        ['space', 'aliasParamKey'],
        [',', 'separator'],
        ['4', 'value'],
        ['}', 'separator'],
      ]);
    });
  });

  describe('aliases', () => {
    it('highlights a usage of a host-supplied alias', () => {
      expect(tokenize2(html('@btn'))).toEqual([['@btn', 'alias']]);
    });

    it('ignores an alias usage nobody defined', () => {
      expect(tokenize2(html('@nope'), { localAliases: undefined })).toEqual([]);
    });

    it('picks up aliases defined in the document itself', () => {
      const text = html('--alias-hero=p-8 @hero');
      expect(tokenize2(text, { localAliases: undefined })).toContainEqual([
        '@hero',
        'alias',
      ]);
    });

    it('tokenizes alias parameters as key/value pairs', () => {
      expect(tokenize2(html('@card(space:8)'))).toEqual([
        ['@card', 'alias'],
        ['(', 'separator'],
        ['space', 'aliasParamKey'],
        [':', 'separator'],
        ['8', 'value'],
        [')', 'separator'],
      ]);
    });

    it('tokenizes an alias definition body as a class of its own', () => {
      expect(tokenize2(html('--alias-btn=bgc-red-500'))).toEqual([
        ['--alias-btn', 'alias'],
        ['=', 'separator'],
        ['bgc', 'utility'],
        ['-', 'separator'],
        ['red-500', 'value'],
      ]);
    });

    it('tokenizes an alias definition whose body carries selectors', () => {
      // The engine folds `--alias-x=` into the prefix chain here, so the
      // definition is emitted separately from its body.
      expect(tokenize2(html('--alias-prose=^:is(p,li)>:{utility}'))).toEqual([
        ['--alias-prose', 'alias'],
        ['=', 'separator'],
        ['^', 'selectorOperator'],
        [':is', 'parentSelector'],
        ['(', 'separator'],
        ['p', 'value'],
        [',', 'separator'],
        ['li', 'value'],
        [')', 'separator'],
        ['>', 'parentSelector'],
        [':', 'separator'],
        ['{', 'separator'],
        ['utility', 'aliasParamKey'],
        ['}', 'separator'],
      ]);
    });
  });

  describe('gating', () => {
    it('emits nothing for classes the engine cannot convert', () => {
      expect(tokenize2(html('not-a-class'))).toEqual([]);
    });

    it('emits nothing outside a maple region', () => {
      expect(tokenize2('<div>p-4 md:hover:bgc-red-500</div>')).toEqual([]);
    });

    it('emits nothing for an unsupported language', () => {
      expect(tokenize(html('p-4'), { languageId: 'rust' })).toEqual([]);
    });

    it('reads regions of other host languages', () => {
      expect(
        tokenize2('<span className="p-4" />', {
          languageId: 'javascriptreact',
        }),
      ).toEqual([
        ['p', 'utility'],
        ['-', 'separator'],
        ['4', 'value'],
      ]);
    });
  });

  describe('invariants', () => {
    const text = [
      '<div class="--alias-btn=bgc-red-500;p-2 md:hover:!p-{space,4}">',
      '  <span class="@card(space:8) ^parent_p:d-flex /li:m-2">',
      '    <b class="--spacer=0.5 &:hover:c-blue-500">x</b>',
      '  </span>',
      '</div>',
    ].join('\n');

    it('returns tokens sorted by start offset', () => {
      const tokens = tokenize(text);
      expect(tokens.length).toBeGreaterThan(0);
      for (let i = 1; i < tokens.length; i++) {
        expect(tokens[i].start).toBeGreaterThanOrEqual(tokens[i - 1].start);
      }
    });

    it('never emits a token spanning a line break', () => {
      for (const token of tokenize(text)) {
        const slice = text.slice(token.start, token.start + token.length);
        expect(slice).not.toContain('\n');
        expect(slice.length).toBe(token.length);
      }
    });
  });

  describe('reference tables', () => {
    it('covers every token type', () => {
      for (const type of MAPLE_TOKEN_TYPES) {
        expect(MAPLE_TOKEN_SCOPES[type].length).toBeGreaterThan(0);
        expect(MAPLE_TOKEN_COLORS_DARK_PLUS[type]).toMatch(/^[0-9A-F]{6}$/);
      }
      expect(Object.keys(MAPLE_TOKEN_SCOPES)).toHaveLength(
        MAPLE_TOKEN_TYPES.length,
      );
    });
  });
});
