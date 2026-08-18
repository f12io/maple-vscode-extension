import { describe, expect, it } from 'vitest';
import {
  getColorPresentations,
  getDocumentColors,
  type MapleColor,
} from '../src/index';

const html = (text: string) => getDocumentColors(text, { languageId: 'html' });

/** The document text each color span covers. */
const spans = (text: string, colors: ReturnType<typeof html>) =>
  colors.map((c) => text.substring(c.start, c.end));

const rgb = (color: MapleColor) =>
  [
    Math.round(color.red * 255),
    Math.round(color.green * 255),
    Math.round(color.blue * 255),
    color.alpha,
  ].join(',');

describe('getDocumentColors', () => {
  it('returns nothing for a language core does not handle', () => {
    expect(
      getDocumentColors('<div class="bgc-red-500">', {
        languageId: 'rust',
      }),
    ).toEqual([]);
  });

  it('only looks inside maple regions', () => {
    expect(html('<p>bgc-red-500</p>')).toEqual([]);
  });

  it('reports the value of a color utility, not the whole class', () => {
    const text = '<div class="bgc-red-500 p-4">';
    const colors = html(text);

    expect(spans(text, colors)).toEqual(['red-500']);
    expect(rgb(colors[0].color)).toBe('255,0,0,1');
  });

  it('ignores utilities that take no color', () => {
    expect(html('<div class="p-4 d-flex">')).toEqual([]);
  });

  it('resolves a tone to the shade the engine renders', () => {
    const light = html('<div class="bgc-red-100">')[0];
    const dark = html('<div class="bgc-red-900">')[0];

    expect(light.color.red).toBeGreaterThan(0);
    expect(rgb(light.color)).not.toBe(rgb(dark.color));
  });

  it('skips a tone outside the palette', () => {
    expect(html('<div class="bgc-red-9999">')).toEqual([]);
  });

  it('reports a bracketed literal without its brackets', () => {
    const text = '<div class="c=[#f97316]">';
    const colors = html(text);

    expect(spans(text, colors)).toEqual(['#f97316']);
    expect(rgb(colors[0].color)).toBe('249,115,22,1');
  });

  it('reports every color of a multi-value utility', () => {
    const text = '<div class="bshadow-0_0_4px_black,0_0_8px_white">';

    expect(spans(text, html(text))).toEqual(['black', 'white']);
  });

  it('reports the colors inside an alias body', () => {
    const text = '<html class="--alias-btn=p-2;bgc-blue-500;c-white">';

    expect(spans(text, html(text))).toEqual(['blue-500', 'white']);
  });

  it('finds colors in every host language', () => {
    const jsx = '<div className="bgc-red-500">';

    expect(
      getDocumentColors(jsx, { languageId: 'javascriptreact' }),
    ).toHaveLength(1);
  });
});

describe('getColorPresentations', () => {
  const orange: MapleColor = {
    red: 249 / 255,
    green: 115 / 255,
    blue: 22 / 255,
    alpha: 1,
  };

  /** The span the picker was opened on, located by its text. */
  const spanOf = (text: string, literal: string) => {
    const start = text.indexOf(literal);
    return { start, end: start + literal.length };
  };

  it('offers the named form first after a value operator', () => {
    const text = '<div class="bgc-red-500">';
    const presentations = getColorPresentations(
      text,
      spanOf(text, 'red-500'),
      orange,
    );

    expect(presentations[0].insertText).toBe(presentations[0].label);
    expect(presentations[0].label).toMatch(/^[a-z]+-\d+$/);
    expect(presentations.map((p) => p.label)).toHaveLength(4);
  });

  it('brackets every notation but the named one', () => {
    const text = '<div class="bgc-red-500">';
    const presentations = getColorPresentations(
      text,
      spanOf(text, 'red-500'),
      orange,
    );

    for (const presentation of presentations.slice(1)) {
      expect(presentation.insertText).toBe(`[${presentation.label}]`);
    }
  });

  it('replaces the brackets too when they are there', () => {
    const text = '<div class="c=[#112233]">';
    const span = spanOf(text, '#112233');
    const presentations = getColorPresentations(text, span, orange);

    // The edit covers `[#112233]`, so a named color can take its place.
    expect(text.substring(presentations[0].start, presentations[0].end)).toBe(
      '[#112233]',
    );
  });

  it('keeps the notation already in the document', () => {
    const text = '<div class="c=[#112233]">';
    const presentations = getColorPresentations(
      text,
      spanOf(text, '#112233'),
      orange,
    );

    expect(presentations[0].label.startsWith('#')).toBe(true);
    expect(presentations[0].insertText).toBe(`[${presentations[0].label}]`);
  });

  it('withholds the named form where the syntax cannot take it', () => {
    // After `=` a bare `red-500` would not parse; only bracketed forms fit.
    const text = '<div class="c=[#112233]">';
    const presentations = getColorPresentations(
      text,
      spanOf(text, '#112233'),
      orange,
    );

    for (const presentation of presentations) {
      expect(presentation.insertText.startsWith('[')).toBe(true);
    }
  });

  it('writes the alpha into the named form', () => {
    const text = '<div class="bgc-red-500">';
    const presentations = getColorPresentations(text, spanOf(text, 'red-500'), {
      ...orange,
      alpha: 0.5,
    });

    expect(presentations[0].label).toMatch(/\/50$/);
  });
});
