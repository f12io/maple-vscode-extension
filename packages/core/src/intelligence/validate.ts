import {
  buildRule,
  BUILTIN_ALIASES,
  COLOR_MAX_TONE,
  COLOR_MIN_TONE,
  PROP_TYPE_COLOR,
} from '@f12io/maple';
import {
  checkConverted,
  getAliasName,
  isAliasDefinition,
  isAliasMarker,
  parseMapleToken,
} from './maple-parser';

/** Why a class is invalid. Stable across message wording changes. */
export type MapleValidationCode =
  /** A color tone outside the palette range (`bgc-red-951`). */
  | 'invalid-shade'
  /** The important marker sits anywhere but the front (`p-4!`, `@md:!p-4`). */
  | 'important-not-leading'
  /** `!important` written into a `-` value, where it is read as a literal. */
  | 'important-literal'
  /** An alias definition on an element other than `html`. */
  | 'alias-definition-scope'
  /** The engine cannot turn the class into CSS and it is not a known alias. */
  | 'unknown-class';

export interface MapleValidationIssue {
  code: MapleValidationCode;
  /** Ready to show as-is; includes `fix` when there is one. */
  message: string;
  /**
   * The class rewritten the way it was meant, when that is unambiguous —
   * suitable for a quick fix. Absent when the input gives nothing to correct
   * towards.
   */
  fix?: string;
}

export interface ValidateClassOptions {
  /**
   * The element carrying the class. Alias definitions (`--alias-x=...`) are
   * only legal on `html`, so the scope rule is skipped when the host cannot
   * report a tag.
   */
  tagName?: string;
  /**
   * Alias definitions the host knows about beyond the builtins (e.g. the
   * VS Code workspace scan). Usages of aliases missing here are reported as
   * unknown classes.
   */
  localAliases?: ReadonlyMap<string, string>;
}

const IMPORTANT_PLACEMENT_HINT =
  "Invalid usage of '!'. To mark a utility as important, the exclamation mark must be placed at the beginning";

function importantPlacementIssue(fix: string): MapleValidationIssue {
  return {
    code: 'important-not-leading',
    message: `${IMPORTANT_PLACEMENT_HINT} (e.g., '${fix}').`,
    fix,
  };
}

/**
 * Maple's important marker leads the whole class (`!&:hover:o-100`); once a
 * prefix chain precedes it (`&:hover:!o-100`) the engine cannot parse the
 * utility at all. Returns the corrected class when moving the `!` to the front
 * makes it valid, so the issue can point at the fix instead of reporting a
 * generic unknown class.
 */
function getMisplacedImportantFix(
  cls: string,
  prefixes: Array<string>,
  activeWord: string,
): string | undefined {
  if (prefixes.length === 0) return undefined;
  if (!activeWord.replace(/\\/g, '').startsWith('!')) return undefined;

  const markerIdx = cls.indexOf('!');
  if (markerIdx <= 0) return undefined;

  const fixed = `!${cls.slice(0, markerIdx).replace(/\\$/, '')}${cls.slice(
    markerIdx + 1,
  )}`;

  return checkConverted(fixed) ? fixed : undefined;
}

/** The tone of `bgc-red-951` is out of range; the one of `bgc-red` is absent. */
function getShadeIssue(
  rule: ReturnType<typeof buildRule>,
): MapleValidationIssue | null {
  if (rule?.parsed?.propType !== PROP_TYPE_COLOR) return null;

  const parts = rule.parsed.utilVal.split('-');
  if (parts.length <= 1) return null;

  const tone = parseInt(parts[parts.length - 1].split('/')[0]);
  if (isNaN(tone) || (tone >= COLOR_MIN_TONE && tone <= COLOR_MAX_TONE)) {
    return null;
  }

  return {
    code: 'invalid-shade',
    message: `Invalid shade: '${tone}'. Must be between ${COLOR_MIN_TONE} and ${COLOR_MAX_TONE}.`,
  };
}

/** Whether `activeWord` is a usage of an alias the host or engine defines. */
function isKnownAlias(
  activeWord: string,
  localAliases: ReadonlyMap<string, string> | undefined,
): boolean {
  // Unescape in case `parseClass` fell back to `propKeyKebab`.
  const rawAliasBase = activeWord
    .replace(/\\/g, '')
    .replace(/=$/, '')
    .replace(/\(.*\)$/, '');
  const aliasName = getAliasName(rawAliasBase);

  if (isAliasMarker(rawAliasBase) && localAliases?.has(aliasName)) return true;

  return !!BUILTIN_ALIASES[aliasName];
}

/**
 * The single validation rule set behind editor diagnostics: what is wrong with
 * `cls`, or `null` when it is valid — or not maple at all, so hosts can run it
 * over every word in a class attribute.
 *
 * Only the first problem is reported; the checks are ordered so the most
 * specific, most actionable one wins over the generic unknown-class fallback.
 * Host-specific noise (a templating language's own expressions, say) is the
 * caller's to filter, using `code`.
 */
export function validateClass(
  cls: string,
  options: ValidateClassOptions = {},
): MapleValidationIssue | null {
  if (cls.length === 0) return null;

  const { activeWord, prefixes, isMapleIntent } = parseMapleToken(cls);
  if (!isMapleIntent) return null;

  const converted = checkConverted(cls);
  const rule = buildRule(cls);

  const shadeIssue = getShadeIssue(rule);
  if (shadeIssue) return shadeIssue;

  if (cls.endsWith('!')) return importantPlacementIssue(`!${cls.slice(0, -1)}`);

  if (!converted) {
    const fix = getMisplacedImportantFix(cls, prefixes, activeWord);
    if (fix) return importantPlacementIssue(fix);
  }

  if (
    rule?.parsed?.utilOp === '-' &&
    !rule.parsed.utilVal.startsWith('[') &&
    rule.parsed.utilVal.includes('_!important')
  ) {
    return {
      code: 'important-literal',
      message: `Invalid usage of '!important'. Use '=' operator or '[]' brackets for string literals.`,
    };
  }

  // `activeWord` covers prefixed definitions (`@md:--alias-card=...`), the raw
  // class covers bodies that carry selectors
  // (`--alias-x=^:is(p,.\@p1)>:{utility}`), where the engine folds the
  // `--alias-x=` part into the prefix chain and it disappears from `activeWord`.
  if (
    (isAliasDefinition(activeWord) && activeWord.includes('=')) ||
    (isAliasDefinition(cls) && cls.includes('='))
  ) {
    if (options.tagName && options.tagName !== 'html') {
      return {
        code: 'alias-definition-scope',
        message: `Maple aliases can only be defined on the 'html' element. Found on '${options.tagName}'.`,
      };
    }
    // The body of a definition is validated where it is expanded, not here.
    return null;
  }

  if (converted || isKnownAlias(activeWord, options.localAliases)) return null;

  return { code: 'unknown-class', message: `Invalid maple class: '${cls}'` };
}
