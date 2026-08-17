import { describe, expect, it } from 'vitest';
import { getExactWordAtOffset } from '../src/index';

/** `|` marks the cursor. */
function at(fixture: string): { text: string; offset: number } {
  const offset = fixture.indexOf('|');
  return { text: fixture.replace('|', ''), offset };
}

function wordAt(fixture: string) {
  const { text, offset } = at(fixture);
  return getExactWordAtOffset(text, offset);
}

describe('getExactWordAtOffset', () => {
  it('returns the class token the cursor sits at the end of', () => {
    expect(wordAt('<div class="bgc-|"></div>')).toEqual({
      word: 'bgc-',
      start: 12,
      end: 16,
    });
  });

  it('returns the whole token when the cursor is in the middle', () => {
    expect(wordAt('<div class="bgc-r|ed"></div>')).toEqual({
      word: 'bgc-red',
      start: 12,
      end: 19,
    });
  });

  it('returns no word right after the opening quote', () => {
    expect(wordAt('<div class="|"></div>')).toEqual({
      word: '',
      start: 12,
      end: 12,
    });
  });

  it('returns no word right after a space', () => {
    expect(wordAt('<div class="p-4 |"></div>')).toEqual({
      word: '',
      start: 16,
      end: 16,
    });
  });

  it('picks the token the cursor is in, not its neighbours', () => {
    expect(wordAt('<div class="p-4 m-2| d-flex"></div>')).toEqual({
      word: 'm-2',
      start: 16,
      end: 19,
    });
  });

  it('keeps a whole prefixed class together', () => {
    expect(wordAt('<div class="md:hover:bgc-red-500|"></div>')).toEqual({
      word: 'md:hover:bgc-red-500',
      start: 12,
      end: 32,
    });
  });

  it('keeps an alias definition together', () => {
    expect(wordAt('<html class="--alias-btn=bgc-|"></html>')).toEqual({
      word: '--alias-btn=bgc-',
      start: 13,
      end: 29,
    });
  });

  it('strips trailing markup that bled into the token', () => {
    // The class pattern swallows `>`, which is never part of a class.
    const { text, offset } = at('<div class=bgc-red>|');
    expect(getExactWordAtOffset(text, offset)).toEqual({
      word: 'class=bgc-red',
      start: 5,
      end: 18,
    });
  });

  it('is confined to the cursor line', () => {
    expect(wordAt('<div\n  class="p-4|"\n></div>')).toEqual({
      word: 'p-4',
      start: 14,
      end: 17,
    });
  });
});
