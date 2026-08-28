import { coco } from '@f12io/coco';
import {
  buildRule,
  CHAR_CLOSE_BRACKET,
  CHAR_OPEN_BRACKET,
  CHAR_OPEN_PAREN,
  COLOR_MAX_TONE,
  COLOR_MIN_TONE,
  REF_CHAR_ALIAS_PARTS,
  REF_CHAR_COLOR_SHADE,
  REF_CHAR_CUSTOM,
  REF_CHAR_FUNCTION_COMMA,
  REF_CHAR_SPACE,
  REF_CHAR_VALUE_PARTS,
  REGEX_COLOR_TOKEN,
  REGEX_RESERVED_KEYWORDS,
  StringHelper,
} from '@f12io/maple';
import { getExactWordAtOffset } from '../extractor.helper';
import { MAPLE_CLASS_REGEX } from '../regex';
import { LanguageServiceRegistry } from '../registry';
import {
  cocoWithResolver,
  findNamedColorAndTone,
  isColorProperty,
  isPlainCssColorName,
  isToneNotation,
} from './color-palette';
import { isAliasDefinition, isVariable } from './maple-parser';
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
const NAMED_COLOR_OPERATORS = new Set([
  REF_CHAR_COLOR_SHADE,
  REF_CHAR_SPACE,
  REF_CHAR_FUNCTION_COMMA,
  String.fromCharCode(CHAR_OPEN_PAREN),
]);

/** Whether `value` is a bracketed literal (`[#f97316]`). */
function isBracketed(value: string): boolean {
  return (
    value.length > 1 &&
    value.charCodeAt(0) === CHAR_OPEN_BRACKET &&
    value.charCodeAt(value.length - 1) === CHAR_CLOSE_BRACKET
  );
}

/**
 * Splits a color value into the individual colors it holds, with their
 * offsets: `red-500,blue-500` (multiple values), `0_0_4px_black` (shadows),
 * `red|blue` (fallback chains).
 */
function getTokens(valueStr: string): Array<{ part: string; offset: number }> {
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

/** A tone outside the palette is a mistake, not a color to preview. */
function isValidColorTone(colorStr: string): boolean {
  if (isBracketed(colorStr)) return true;

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

function collectValueColors(
  valueStr: string,
  absoluteOffset: number,
  out: Array<MapleColorSpan>,
): void {
  for (const token of getTokens(valueStr)) {
    const colorPart = token.part;
    const tokenAbsoluteOffset = absoluteOffset + token.offset;

    if (isBracketed(colorPart)) {
      // One character stripped from the front, so the offset moves by one.
      collectValueColors(
        StringHelper.removeBrackets(colorPart),
        tokenAbsoluteOffset + 1,
        out,
      );
      continue;
    }

    if (!isValidColorTone(colorPart)) continue;

    const rgbString = cocoWithResolver(
      colorPart.replaceAll(REF_CHAR_SPACE, ' '),
      'rgb',
    );
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
}

/** Every color inside one utility, pushed onto `out` with document offsets. */
function collectUtilityColors(
  utilStr: string,
  absoluteIndex: number,
  out: Array<MapleColorSpan>,
): void {
  const rule = buildRule(utilStr);
  if (!rule?.parsed) return;

  const { utilKey, utilVal: value, propKeyKebab, propKeyCamel } = rule.parsed;
  if (!utilKey || !value || !isColorProperty(propKeyKebab, propKeyCamel))
    return;

  collectValueColors(value, absoluteIndex + utilStr.lastIndexOf(value), out);
}

/**
 * Every color literal in `text`, so a host can render a swatch next to it.
 *
 * Region discovery is handled here, like everywhere else: only classes inside
 * maple regions are considered. The value of a color utility
 * (`bgc-accent-500`, `c=[#f97316]`), the utilities in an alias body, and the
 * value of a variable definition (`--brand=oklch(0.56_0.02_260)`) are all
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

      const equalsIdx = word.indexOf(REF_CHAR_CUSTOM);

      if (isAliasDefinition(word) && equalsIdx !== -1) {
        // An alias body holds utilities of its own, each with its own colors.
        const utilities = word
          .substring(equalsIdx + 1)
          .split(REF_CHAR_ALIAS_PARTS);

        let currentOffset = wordOffset + equalsIdx + 1;
        for (const util of utilities) {
          collectUtilityColors(util, currentOffset, colors);
          currentOffset += util.length + REF_CHAR_ALIAS_PARTS.length;
        }
      } else if (isVariable(word) && equalsIdx !== -1) {
        // A variable body is a raw CSS value, not a utility: there is no key
        // to tell us it holds a color, so the resolver decides token by token.
        collectValueColors(
          word.substring(equalsIdx + 1),
          wordOffset + equalsIdx + 1,
          colors,
        );
      } else {
        collectUtilityColors(word, wordOffset, colors);
      }
    }
  }

  return colors;
}

/**
 * Whether the literal at `offset` is the body of a variable definition
 * (`--brand=oklch(...)`) rather than a utility value.
 *
 * A variable body is a raw CSS value, so it takes neither the brackets nor
 * the operator rules a utility value does.
 */
function isVariableBody(text: string, offset: number): boolean {
  const { word } = getExactWordAtOffset(text, offset);
  return isVariable(word) && word.includes(REF_CHAR_CUSTOM);
}

/**
 * The ways `color` can be written in place of the literal at `span`, best
 * first, for a host's color picker.
 *
 * The notation already in the document leads and is what a host writes back
 * when the user only moves the picker: a `#hex` stays hex, an `oklch(...)`
 * stays oklch, a `red-500` stays `name-tone`. The other notations follow, for
 * a user who asks for one by name in the picker.
 *
 * `name-tone` is only offered where the syntax accepts it — after `-`, `_`,
 * `|` or `(` — since it cannot be bracketed, and every other notation is
 * bracketed so the result stays a legal class. In a variable body every
 * notation is written bare, and the picker will not convert a value *into*
 * `name-tone` there: a variable holds raw CSS, which the tone notation is not.
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

  const oklchStrRaw = coco(rgbaStr, 'oklch');
  const oklchStr = oklchStrRaw
    ? oklchStrRaw.replaceAll(' ', REF_CHAR_SPACE)
    : '';

  const { start, end } = span;

  const inVariableBody = isVariableBody(text, start);

  const isSurroundedByBrackets =
    start > 0 &&
    end < text.length &&
    text.charCodeAt(start - 1) === CHAR_OPEN_BRACKET &&
    text.charCodeAt(end) === CHAR_CLOSE_BRACKET;

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

  const originalText = text.substring(start, end);
  const innerText = isBracketed(originalText)
    ? StringHelper.removeBrackets(originalText)
    : originalText;
  // maple writes the spaces of a CSS value as `_`; coco reads plain CSS.
  const innerValue = innerText.replaceAll(REF_CHAR_SPACE, ' ');

  const sourceType = cocoWithResolver.getType(innerValue);

  let preferredFormat = 'named';
  if (sourceType === 'oklch') preferredFormat = 'oklch';
  else if (sourceType === 'rgb') preferredFormat = 'rgb';
  else if (sourceType === 'hex') preferredFormat = 'hex';

  // coco reads every hex width as the one `hex` type, so the literal itself
  // is the only place its alpha channel shows.
  const sourceHexCarriesAlpha =
    sourceType === 'hex' &&
    (innerValue.length === 5 || innerValue.length === 9);

  // An `#rrggbb` in the document stays six digits while it can: adding an
  // opaque `ff` is a notation change the user did not ask for.
  const hexStr =
    color.alpha === 1 && sourceType === 'hex' && !sourceHexCarriesAlpha
      ? hex6 || rgbaStr
      : coco(rgbaStr, 'hex8') || rgbaStr;

  // A variable body is raw CSS, and maple writes it through verbatim:
  // `--brand=blue-300` lands in the stylesheet as `--brand: blue-300`, which
  // no browser understands. So the picker should never convert a variable *into*
  // the tone notation.
  const canUseNamedColor = inVariableBody
    ? isPlainCssColorName(namedStr) || isToneNotation(innerValue)
    : NAMED_COLOR_OPERATORS.has(operatorChar);

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
      // maple value — except in a variable body, which holds a raw CSS value.
      insertText:
        inVariableBody || formatName === 'named' ? label : `[${label}]`,
      start: editStart,
      end: editEnd,
    };
  });
}
