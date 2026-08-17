import { convert, parseClass, StringHelper } from '@f12io/maple';
import {
  ALIAS_REGEX,
  getParamSubstituteRegex,
  PARAM_FALLBACK_REGEX,
  PARAM_REMOVE_REGEX,
} from '../regex';
import { LanguageServiceRegistry } from '../registry';
import { getAliasName, isAliasMarker, parseMapleToken } from './maple-parser';
import type { IntelligenceContext } from './types';

/** What an alias usage under the cursor expands to. */
export interface MapleAliasExpansion {
  name: string;
  /** Fully prefixed, parameter-substituted utilities. */
  utilities: Array<string>;
}

export interface MapleHover {
  /** The class the hover is about, as the framework renders it. */
  className: string;
  /** Document span of the class, in offsets. */
  start: number;
  end: number;
  /**
   * Generated CSS. Empty only for an alias whose utilities produce none —
   * a plain class with no CSS has nothing to say and yields `null` instead.
   */
  css: string;
  /** Set when the class is a usage of a known alias. */
  alias?: MapleAliasExpansion;
}

/** Alias definitions usable in `text`: in-document, then host-supplied. */
function collectAliases(
  text: string,
  hostAliases: ReadonlyMap<string, string> | undefined,
): Map<string, string> {
  const aliases = new Map<string, string>();

  for (const match of text.matchAll(ALIAS_REGEX)) {
    aliases.set(match[1], match[2]);
  }
  // The host's own source (a workspace scan) wins: it sees definitions the
  // document cannot, and is what the editor resolves against elsewhere.
  if (hostAliases) {
    for (const [name, body] of hostAliases) aliases.set(name, body);
  }

  return aliases;
}

/** `@card(space:8,4)` → `{ space: '8', '1': '4' }`, positional keys by index. */
function parseAliasParams(word: string): Map<string, string> {
  const params = new Map<string, string>();
  const paramsMatch = /\((.*)\)$/.exec(word);
  if (!paramsMatch) return params;

  StringHelper.split(paramsMatch[1], ',').forEach((pStr, idx) => {
    const colonIdx = pStr.indexOf(':');
    if (colonIdx !== -1) {
      params.set(pStr.substring(0, colonIdx), pStr.substring(colonIdx + 1));
    } else {
      params.set(idx.toString(), pStr);
    }
  });

  return params;
}

/**
 * The class under `offset` and the CSS it generates, or `null` when there is
 * nothing to show — outside a maple region, between classes, or a word the
 * engine cannot convert.
 *
 * Pretty-printing is left to hosts: `css` is exactly what the engine emitted,
 * so a host can run it through prettier, highlight it, or show it as-is.
 */
export function getHoverInfo(
  text: string,
  offset: number,
  ctx: IntelligenceContext,
): MapleHover | null {
  const languageService = LanguageServiceRegistry.getService(ctx.languageId);
  if (!languageService) return null;

  const instances = languageService.extractClasses(text);
  const currentInstance = instances.find(
    (inst) => offset >= inst.start && offset <= inst.end,
  );
  if (!currentInstance) return null;

  // Token-based lookup splits on all whitespace (not just spaces), so words
  // in multi-line class attributes don't drag newlines into the maple engine
  let word = '';
  let start = 0;
  let end = 0;
  for (const token of languageService.tokenizeClassesWithIndices(
    currentInstance.value,
  )) {
    const wStart = currentInstance.start + token.start;
    const wEnd = currentInstance.start + token.end;
    if (offset >= wStart && offset <= wEnd) {
      word = token.value;
      start = wStart;
      end = wEnd;
      break;
    }
  }

  if (!word) return null;

  // Show the CSS for what the framework renders, not the source escape
  // (e.g. Razor renders @@md:p-2 as @md:p-2)
  word = languageService.getRenderedClassText(word);

  const aliasHover = getAliasHover(word, start, end, text, ctx);
  if (aliasHover) return aliasHover;

  const css = convert(word);
  if (!css) return null;

  return { className: word, start, end, css };
}

/** The alias branch: resolves `@name(params)` against the known definitions. */
function getAliasHover(
  word: string,
  start: number,
  end: number,
  text: string,
  ctx: IntelligenceContext,
): MapleHover | null {
  const { activeWord, isMapleIntent, prefixes } = parseMapleToken(word);
  if (!isMapleIntent) return null;

  const unescapedWord = activeWord.replace(/\\/g, '');
  const rawAliasBase = unescapedWord.replace(/=$/, '').replace(/\(.*\)$/, '');
  if (!isAliasMarker(rawAliasBase)) return null;

  const name = getAliasName(rawAliasBase);
  const aliasBody = collectAliases(text, ctx.localAliases).get(name);
  if (aliasBody === undefined) return null;

  // parseMapleToken may append '=' to activeWord, so strip it before params
  const params = parseAliasParams(unescapedWord.replace(/=$/, ''));
  // Re-attach original prefixes (e.g. "@dark:^hover:")
  const prefix = prefixes.length > 0 ? prefixes.join(':') + ':' : '';

  const utilities: Array<string> = [];
  let css = '';

  for (const util of aliasBody.split(';')) {
    if (!util) continue;

    let substituted = util;
    for (const [key, val] of params) {
      substituted = substituted.replace(
        getParamSubstituteRegex(key),
        () => val,
      );
    }
    // Fallback for missing parameters that have a default value
    substituted = substituted.replace(PARAM_FALLBACK_REGEX, '$1');
    // Remove remaining missing parameters
    substituted = substituted.replace(PARAM_REMOVE_REGEX, '');

    const fullUtil = prefix + substituted;
    utilities.push(fullUtil);

    let utilCss = convert(fullUtil);
    if (!utilCss) continue;

    // The expansion generates its own selector; show it under the class the
    // user actually wrote.
    const targetSelector = parseClass(fullUtil)?.srcSel;
    const originalSelector = parseClass(word)?.srcSel;
    if (targetSelector && originalSelector) {
      utilCss = utilCss.split(targetSelector).join(originalSelector);
    }
    css += utilCss + '\n';
  }

  return { className: word, start, end, css, alias: { name, utilities } };
}
