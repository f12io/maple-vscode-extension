import { coco, createCoco, namedColors, parse } from '@f12io/coco';
import {
  COLOR_MAX_TONE,
  COLOR_MIN_TONE,
  PROP_TYPE_COLOR,
  PropertyHelper,
  REF_CHAR_FUNCTION_COMMA,
  REF_CHAR_SPACE,
  REF_CHAR_VALUE_PARTS,
  StringHelper,
} from '@f12io/maple';

const COLOR_MID_TONE = COLOR_MIN_TONE + (COLOR_MAX_TONE - COLOR_MIN_TONE) / 2;

/** Below this chroma a color reads as gray and its hue is meaningless. */
const ACHROMATIC_CHROMA = 0.005;

/** `red-700`, `red-700/50` → the hex the engine renders for that tone. */
function calculateNamedColorAndToneToHex(input: string): string | undefined {
  const [nt, opacity] = input.split('/');
  const [name, t] = nt.split('-');

  const alpha = (opacity ? parseInt(opacity) : 100) / 100;
  const tone = t ? parseInt(t) : 500;

  if (!namedColors[name]) {
    return undefined;
  }
  const hex = `#${namedColors[name]}`;
  const oklch = coco(hex, 'oklch');
  if (!oklch) return undefined;
  const converted = parse(oklch);
  if (!converted) {
    return undefined;
  }
  const amount = (COLOR_MID_TONE - tone) / COLOR_MID_TONE;
  const [l, c, h] = converted.coords;
  const lCalc = l + (amount > 0 ? 1 - l : l) * amount;
  const target = `oklch(${lCalc} ${c} ${h} / ${alpha})`;
  return coco(target, 'hex') || undefined;
}

interface OklchCoords {
  l: number;
  c: number;
  h: number;
}

let baseColorOklch: Record<string, OklchCoords> | undefined;

/**
 * Every named color in OKLCH, so a picked color can be matched back to a
 * name and tone.
 *
 * Built on first use rather than at import: it runs two color conversions per
 * named color, which a host that never opens a color picker should not pay
 * for.
 */
function getBaseColorOklch(): Record<string, OklchCoords> {
  if (baseColorOklch) return baseColorOklch;

  const table: Record<string, OklchCoords> = {};
  for (const [name, hex] of Object.entries(namedColors)) {
    const oklchStr = coco(`#${hex}`, 'oklch');
    if (oklchStr) {
      const parsed = parse(oklchStr);
      if (parsed) {
        table[name] = {
          l: parsed.coords[0],
          c: parsed.coords[1],
          h: parsed.coords[2],
        };
      }
    }
  }

  baseColorOklch = table;
  return table;
}

/**
 * The closest `name-tone` to `hex`: the nearest named color by hue and
 * chroma, then the tone whose lightness lands on it.
 */
export function findNamedColorAndTone(hex: string): { id: string } | undefined {
  const targetOklchStr = coco(hex, 'oklch');
  if (!targetOklchStr) return undefined;
  const parsedTarget = parse(targetOklchStr);
  if (!parsedTarget) return undefined;
  const [l_t, c_t, h_t] = parsedTarget.coords;

  const palette = getBaseColorOklch();

  let bestName = undefined;
  let minDistance = Infinity;

  for (const [name, base] of Object.entries(palette)) {
    let dh = 0;
    if (
      c_t >= ACHROMATIC_CHROMA &&
      base.c >= ACHROMATIC_CHROMA &&
      !isNaN(h_t) &&
      !isNaN(base.h)
    ) {
      dh = Math.min(Math.abs(h_t - base.h), 360 - Math.abs(h_t - base.h));
    } else if (
      (c_t < ACHROMATIC_CHROMA && base.c >= ACHROMATIC_CHROMA) ||
      (c_t >= ACHROMATIC_CHROMA && base.c < ACHROMATIC_CHROMA)
    ) {
      dh = 180;
    }

    const dc = Math.abs(c_t - base.c);
    const dist = Math.sqrt(dh * dh + dc * dc * 10000);
    if (dist < minDistance) {
      minDistance = dist;
      bestName = name;
    }
  }

  if (!bestName) return undefined;

  const L = palette[bestName].l;
  let amount = 0;
  if (l_t > L && L < 1) {
    amount = (l_t - L) / (1 - L);
  } else if (l_t < L && L > 0) {
    amount = (l_t - L) / L;
  }

  let tone = Math.round(500 - amount * 500);
  if (tone < 0) tone = 0;
  if (tone > 999) tone = 999;

  // Smooth out floating point rounding errors to nearest 10 if very close
  const nearest10 = Math.round(tone / 10) * 10;
  if (Math.abs(tone - nearest10) <= 2) {
    tone = nearest10;
  }

  if (l_t >= 0.999) return { id: `white` };
  if (l_t <= 0.001) return { id: `black` };

  return { id: `${bestName}-${tone}` };
}

/** coco, taught maple's `name-tone` notation in both directions. */
export const cocoWithResolver = createCoco({
  nameResolver: (name) => calculateNamedColorAndToneToHex(name),
  valueResolver: (color) => {
    const source = color.meta?.originalInput ?? (color as { rgb?: string }).rgb;
    const hex6 = coco(source, 'hex6');
    return findNamedColorAndTone(hex6 || '')?.id || undefined;
  },
});

/** Whether a browser resolves `value` to a color on its own (`white`). */
export function isPlainCssColorName(value: string): boolean {
  return namedColors[value] !== undefined;
}

/**
 * Whether `value` is maple's own name notation (`red-700`, `red-700/50`) —
 * a name only the resolver above reads, which CSS does not.
 */
export function isToneNotation(value: string): boolean {
  return (
    cocoWithResolver.getType(value) === 'name' && !isPlainCssColorName(value)
  );
}

/**
 * Splits a maple value into the individual colors it holds, with their
 * offsets: `red-500,blue-500` (multiple values), `0_0_4px_black` (shadows),
 * `red|blue` (fallback chains).
 */
export function splitColorTokens(
  valueStr: string,
): Array<{ part: string; offset: number }> {
  const tokens: Array<{ part: string; offset: number }> = [];

  const commaParts = StringHelper.split(valueStr, REF_CHAR_VALUE_PARTS);
  let currentCommaOffset = 0;

  for (const cPart of commaParts) {
    const cIdx = valueStr.indexOf(cPart, currentCommaOffset);
    currentCommaOffset = cIdx + cPart.length;

    const pipeParts = StringHelper.split(cPart, REF_CHAR_FUNCTION_COMMA);
    let currentPipeOffset = 0;

    for (const pPart of pipeParts) {
      const pIdx = cPart.indexOf(pPart, currentPipeOffset);
      currentPipeOffset = pIdx + pPart.length;

      const spaceParts = StringHelper.split(pPart, REF_CHAR_SPACE);
      let currentSpaceOffset = 0;

      for (const sPart of spaceParts) {
        if (!sPart) continue;
        const sIdx = pPart.indexOf(sPart, currentSpaceOffset);
        currentSpaceOffset = sIdx + sPart.length;

        tokens.push({
          part: sPart,
          offset: cIdx + pIdx + sIdx,
        });
      }
    }
  }
  return tokens;
}

/**
 * Properties that hold a color without being color-typed: a shadow or a
 * gradient is a list whose parts happen to include one.
 */
const SOFT_COLOR_PROPERTIES = new Set([
  'background-image',
  'box-shadow',
  'text-shadow',
]);

/**
 * Whether a property's value can hold a color.
 */
export function isColorProperty(
  propKeyKebab: string,
  propKeyCamel: string,
): boolean {
  return (
    SOFT_COLOR_PROPERTIES.has(propKeyKebab) ||
    PropertyHelper.resolveType(propKeyKebab, propKeyCamel) === PROP_TYPE_COLOR
  );
}
