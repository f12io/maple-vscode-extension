import { coco } from '@f12io/coco';
import {
  buildRule,
  COLOR_MAX_TONE,
  COLOR_MIN_TONE,
  REGEX_COLOR_TOKEN,
  REGEX_RESERVED_KEYWORDS,
  StringHelper,
} from '@f12io/maple';
import { MAPLE_CLASS_REGEX } from '../regex';
import { LanguageServiceRegistry } from '../registry';
import {
  cocoWithResolver,
  findNamedColorAndTone,
  isColorUtilKey,
} from './color-palette';
import type { IntelligenceContext } from './types';

/** sRGB with each channel in 0-1, the shape both editors expect. */
export interface MapleColor {
  red: number;
  green: number;
  blue: number;
  alpha: number;
}

/** A color literal inside a class, and where it sits in the document. */
export interface MapleColorSpan {
  start: number;
  end: number;
  color: MapleColor;
}

/** One way to write a picked color, and the edit that writes it. */
export interface MapleColorPresentation {
  /** The color as the user reads it in the picker (`red-500`, `#f97316ff`). */
  label: string;
  /** What to write, which may differ from the label (`[#f97316ff]`). */
  insertText: string;
  /**
   * The span to replace. Not always the span that was picked: switching a
   * bracketed literal to a named color drops the brackets, so this can extend
   * one character past each side.
   */
  start: number;
  end: number;
}

const RGB_REGEX = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/;

/** Operators a `name-tone` color may follow; elsewhere it needs brackets. */
const NAMED_COLOR_OPERATORS = new Set(['-', '_', '|', '(']);

/**
 * Splits a color value into the individual colors it holds, with their
 * offsets: `red-500,blue-500` (multiple values), `0_0_4px_black` (shadows),
 * `red|blue` (fallback chains).
 */
function getTokens(valueStr: string): Array<{ part: string; offset: number }> {
  const tokens: Array<{ part: string; offset: number }> = [];

  const commaParts = StringHelper.split(valueStr, ',');
  let currentCommaOffset = 0;

  for (const cPart of commaParts) {
    const cIdx = valueStr.indexOf(cPart, currentCommaOffset);
    currentCommaOffset = cIdx + cPart.length;

    const pipeParts = StringHelper.split(cPart, '|');
    let currentPipeOffset = 0;

    for (const pPart of pipeParts) {
      const pIdx = cPart.indexOf(pPart, currentPipeOffset);
      currentPipeOffset = pIdx + pPart.length;

      const spaceParts = StringHelper.split(pPart, '_');
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

/** A tone outside the palette is a mistake, not a color to preview. */
function isValidColorTone(colorStr: string): boolean {
  if (colorStr.startsWith('[') && colorStr.endsWith(']')) return true;

  const colorMatch = REGEX_COLOR_TOKEN.exec(colorStr);
  if (colorMatch) {
    const colorName = colorMatch[1];
    const tonePart = colorMatch[2];

    if (colorName && !REGEX_RESERVED_KEYWORDS.test(colorName) && tonePart) {
      const numTone = Number(tonePart);
      if (numTone < COLOR_MIN_TONE || numTone > COLOR_MAX_TONE) {
        return false;
      }
    }
  }
  return true;
}

/** Every color inside one utility, pushed onto `out` with document offsets. */
function collectUtilityColors(
  utilStr: string,
  absoluteIndex: number,
  out: Array<MapleColorSpan>,
): void {
  const rule = buildRule(utilStr);
  if (!rule?.parsed) return;

  const utilKey = rule.parsed.utilKey;
  const value = rule.parsed.utilVal;
  if (!utilKey || !value || !isColorUtilKey(utilKey)) return;

  const processTokens = (valueStr: string, absoluteOffset: number) => {
    for (const token of getTokens(valueStr)) {
      const colorPart = token.part;
      const tokenAbsoluteOffset = absoluteOffset + token.offset;

      if (colorPart.startsWith('[') && colorPart.endsWith(']')) {
        processTokens(
          colorPart.substring(1, colorPart.length - 1),
          tokenAbsoluteOffset + 1,
        );
        continue;
      }

      if (!isValidColorTone(colorPart)) continue;

      const rgbString = cocoWithResolver(colorPart.replace(/_/g, ' '), 'rgb');
      if (!rgbString) continue;

      const rgbMatch = RGB_REGEX.exec(rgbString);
      if (!rgbMatch) continue;

      out.push({
        start: tokenAbsoluteOffset,
        end: tokenAbsoluteOffset + colorPart.length,
        color: {
          red: parseFloat(rgbMatch[1]) / 255,
          green: parseFloat(rgbMatch[2]) / 255,
          blue: parseFloat(rgbMatch[3]) / 255,
          alpha: rgbMatch[4] ? parseFloat(rgbMatch[4]) : 1,
        },
      });
    }
  };

  processTokens(value, absoluteIndex + utilStr.lastIndexOf(value));
}

/**
 * Every color literal in `text`, so a host can render a swatch next to it.
 *
 * Region discovery is handled here, like everywhere else: only classes inside
 * maple regions are considered. Both the value of a color utility
 * (`bgc-accent-500`, `c=[#f97316]`) and the utilities in an alias body are
 * reported.
 */
export function getDocumentColors(
  text: string,
  ctx: IntelligenceContext,
): Array<MapleColorSpan> {
  const colors: Array<MapleColorSpan> = [];

  const languageService = LanguageServiceRegistry.getService(ctx.languageId);
  if (!languageService) return colors;

  for (const instance of languageService.extractClasses(text)) {
    for (const wordMatch of instance.value.matchAll(MAPLE_CLASS_REGEX)) {
      let word = wordMatch[0];
      let wordOffset = instance.start + wordMatch.index;

      if (word.startsWith('"') || word.startsWith("'")) {
        word = word.substring(1);
        wordOffset += 1;
      }
      if (word.endsWith('"') || word.endsWith("'")) {
        word = word.substring(0, word.length - 1);
      }

      if (word.length === 0) continue;

      // An alias body holds utilities of its own, each with its own colors.
      if (word.startsWith('--') && word.includes('=')) {
        const equalsIdx = word.indexOf('=');
        const utilities = word.substring(equalsIdx + 1).split(';');

        let currentOffset = wordOffset + equalsIdx + 1;
        for (const util of utilities) {
          collectUtilityColors(util, currentOffset, colors);
          currentOffset += util.length + 1; // +1 for the ';' character
        }
      } else {
        collectUtilityColors(word, wordOffset, colors);
      }
    }
  }

  return colors;
}

/**
 * The ways `color` can be written in place of the literal at `span`, best
 * first, for a host's color picker.
 *
 * The notation already in the document leads: a `#hex` stays hex, an
 * `oklch(...)` stays oklch. `name-tone` is only offered where the syntax
 * accepts it — after `-`, `_`, `|` or `(` — since it cannot be bracketed, and
 * every other notation is bracketed so the result stays a legal class.
 */
export function getColorPresentations(
  text: string,
  span: { start: number; end: number },
  color: MapleColor,
): Array<MapleColorPresentation> {
  const r = Math.round(color.red * 255);
  const g = Math.round(color.green * 255);
  const b = Math.round(color.blue * 255);
  const a = Math.round(color.alpha * 100);

  // Remove spaces inside rgb/rgba to prevent creating invalid space-separated
  // maple classes
  const rgbaStr =
    color.alpha < 1
      ? `rgba(${r},${g},${b},${color.alpha})`
      : `rgb(${r},${g},${b})`;

  const hex6 = coco(rgbaStr, 'hex6') || '';
  const namedResult = findNamedColorAndTone(hex6);
  let namedStr = '';
  if (namedResult) {
    namedStr = namedResult.id;
    if (a < 100) {
      namedStr += `/${a}`;
    }
  }

  const hexStr = coco(rgbaStr, 'hex8') || rgbaStr;
  const oklchStrRaw = coco(rgbaStr, 'oklch');
  const oklchStr = oklchStrRaw ? oklchStrRaw.replace(/ /g, '_') : '';

  const { start, end } = span;

  const isSurroundedByBrackets =
    start > 0 &&
    end < text.length &&
    text[start - 1] === '[' &&
    text[end] === ']';

  // Replacing a bracketed literal with a named color has to take the brackets
  // with it, so the edit covers them.
  const editStart = isSurroundedByBrackets ? start - 1 : start;
  const editEnd = isSurroundedByBrackets ? end + 1 : end;

  let operatorChar = '';
  if (isSurroundedByBrackets && start > 1) {
    operatorChar = text[start - 2];
  } else if (!isSurroundedByBrackets && start > 0) {
    operatorChar = text[start - 1];
  }
  const canUseNamedColor = NAMED_COLOR_OPERATORS.has(operatorChar);

  const originalText = text.substring(start, end);
  const innerText =
    originalText.startsWith('[') && originalText.endsWith(']')
      ? originalText.substring(1, originalText.length - 1)
      : originalText;

  let preferredFormat = 'named';
  if (innerText.startsWith('oklch')) preferredFormat = 'oklch';
  else if (innerText.startsWith('rgb') || innerText.startsWith('rgba'))
    preferredFormat = 'rgb';
  else if (innerText.startsWith('#')) preferredFormat = 'hex';

  const colorLabels = {
    named: namedStr,
    oklch: oklchStr,
    rgb: rgbaStr,
    hex: hexStr,
  };

  const orderedFormats: Array<keyof typeof colorLabels> = [];

  // Push the preferred format first
  if (preferredFormat === 'named' && namedStr && canUseNamedColor) {
    orderedFormats.push('named');
  } else if (preferredFormat === 'oklch' && oklchStr) {
    orderedFormats.push('oklch');
  } else if (preferredFormat === 'rgb') {
    orderedFormats.push('rgb');
  } else if (preferredFormat === 'hex') {
    orderedFormats.push('hex');
  }

  // Then push the rest
  if (preferredFormat !== 'named' && namedStr && canUseNamedColor) {
    orderedFormats.push('named');
  }
  if (preferredFormat !== 'oklch' && oklchStr) {
    orderedFormats.push('oklch');
  }
  if (preferredFormat !== 'rgb') {
    orderedFormats.push('rgb');
  }
  if (preferredFormat !== 'hex') {
    orderedFormats.push('hex');
  }

  return orderedFormats.map((formatName) => {
    const label = colorLabels[formatName];

    return {
      label,
      // Every notation but the named one has to be bracketed to stay a legal
      // maple value.
      insertText: formatName === 'named' ? label : `[${label}]`,
      start: editStart,
      end: editEnd,
    };
  });
}
