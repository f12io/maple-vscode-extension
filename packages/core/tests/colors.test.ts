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

  it('reports the value of a variable definition', () => {
    const text = '<div class="--brand=oklch(0.560_0.025_260)">';
    const colors = html(text);

    expect(spans(text, colors)).toEqual(['oklch(0.560_0.025_260)']);
    expect(rgb(colors[0].color)).toBe('108,117,132,1');
  });

  it('reports a named color and a hex in a variable definition', () => {
    expect(
      spans(
        '<div class="--brand=red-500">',
        html('<div class="--brand=red-500">'),
      ),
    ).toEqual(['red-500']);
    expect(
      spans(
        '<div class="--brand=#f97316">',
        html('<div class="--brand=#f97316">'),
      ),
    ).toEqual(['#f97316']);
  });

  it('reports every color of a multi-part variable value', () => {
    const text = '<div class="--shadow=0_0_4px_black">';

    expect(spans(text, html(text))).toEqual(['black']);
  });

  it('ignores a variable that holds no color', () => {
    expect(html('<div class="--gap=16px">')).toEqual([]);
    expect(html('<div class="--fallback=var(--y)">')).toEqual([]);
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

  it('writes a variable body bare, with no brackets', () => {
    // A variable holds a raw CSS value, so no notation needs bracketing.
    const text = '<div class="--brand=oklch(0.560_0.025_260)">';
    const presentations = getColorPresentations(
      text,
      spanOf(text, 'oklch(0.560_0.025_260)'),
      orange,
    );

    for (const presentation of presentations) {
      expect(presentation.insertText).toBe(presentation.label);
    }
  });

  it('withholds the tone notation in a variable body', () => {
    // A variable holds raw CSS, so `orange-500` would be written through as
    // `--brand: orange-500` and dropped by the browser.
    const text = '<div class="--brand=oklch(0.560_0.025_260)">';
    const presentations = getColorPresentations(
      text,
      spanOf(text, 'oklch(0.560_0.025_260)'),
      orange,
    );

    // oklch leads, since that is what the document already says.
    expect(presentations[0].label.startsWith('oklch')).toBe(true);
    expect(presentations.map((p) => p.label)).toHaveLength(3);
    expect(presentations.some((p) => /^[a-z]+-\d+$/.test(p.label))).toBe(false);
  });

  it('keeps the tone notation a variable body already writes', () => {
    // Not the picker's call to change a notation the user chose, even one
    // this loose: it only refuses to convert a variable *into* the notation.
    const text = '<div class="--brand=blue-300">';
    const presentations = getColorPresentations(
      text,
      spanOf(text, 'blue-300'),
      orange,
    );

    expect(presentations[0].label).toMatch(/^[a-z]+-\d+$/);
  });

  it('does not convert a bare CSS name in a variable body into a tone', () => {
    // `white` is legal raw CSS; `orange-500` in its place would not be.
    const text = '<div class="--brand=white">';
    const presentations = getColorPresentations(
      text,
      spanOf(text, 'white'),
      orange,
    );

    expect(presentations[0].label.startsWith('oklch')).toBe(true);
    expect(presentations.some((p) => /^[a-z]+-\d+$/.test(p.label))).toBe(false);
  });

  it('reads a notation coco knows but the picker cannot write', () => {
    // `hsl(...)` has no presentation of its own, and it is not the picker's
    // cue to fall back on a tone notation a variable body cannot hold.
    const text = '<div class="--brand=hsl(10,20%,30%)">';
    const presentations = getColorPresentations(
      text,
      spanOf(text, 'hsl(10,20%,30%)'),
      orange,
    );

    expect(presentations[0].label.startsWith('oklch')).toBe(true);
    expect(presentations.some((p) => /^[a-z]+-\d+$/.test(p.label))).toBe(false);
  });

  it('keeps a six-digit hex six digits', () => {
    // An opaque `ff` the document never had is a notation change of its own.
    const text = '<div class="c=[#112233]">';
    const presentations = getColorPresentations(
      text,
      spanOf(text, '#112233'),
      orange,
    );

    expect(presentations[0].label).toBe('#f97316');
  });

  it('keeps eight digits when the document already writes them', () => {
    const text = '<div class="c=[#11223380]">';
    const presentations = getColorPresentations(
      text,
      spanOf(text, '#11223380'),
      orange,
    );

    expect(presentations[0].label).toBe('#f97316ff');
  });

  it('writes eight digits when the color carries alpha', () => {
    const text = '<div class="c=[#112233]">';
    const presentations = getColorPresentations(text, spanOf(text, '#112233'), {
      ...orange,
      alpha: 0.5,
    });

    expect(presentations[0].label).toBe('#f9731680');
  });

  it('still offers a bare CSS color name in a variable body', () => {
    // `white` needs no tone, so it is legal raw CSS.
    const text = '<div class="--brand=oklch(0.560_0.025_260)">';
    const presentations = getColorPresentations(
      text,
      spanOf(text, 'oklch(0.560_0.025_260)'),
      { red: 1, green: 1, blue: 1, alpha: 1 },
    );

    expect(presentations.map((p) => p.label)).toContain('white');
  });

  it('keeps bracketing a color inside an alias body', () => {
    const text = '<html class="--alias-btn=bgc-[#112233]">';
    const presentations = getColorPresentations(
      text,
      spanOf(text, '#112233'),
      orange,
    );

    const named = presentations.find((p) => /^[a-z]+-\d+$/.test(p.label));
    expect(named?.insertText).toBe(named?.label);
    for (const presentation of presentations.filter((p) => p !== named)) {
      expect(presentation.insertText).toBe(`[${presentation.label}]`);
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
