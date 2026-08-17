import { namedColors } from '@f12io/coco';
import {
  COLOR_MAX_TONE,
  COLOR_MIN_TONE,
  DEFAULT_ANGLE_UNIT,
  DEFAULT_TIME_UNIT,
  FUNCTION_KEYS,
  OPTIONS,
  PROP_TYPE_COLOR,
  PROP_TYPE_SPACE,
  PROP_UNIT_MAP,
  PropertyHelper,
} from '@f12io/maple';
import { getExactWordAtOffset } from '../extractor.helper';
import { LanguageServiceRegistry } from '../registry';
import {
  ABBREVIATIONS,
  BUILTIN_ALIASES,
  CSS_OPTIONS,
  DEFAULT_CSS_VALUES,
  GRADIENT_DIRECTIONS,
  MULTI_VALUE_REGEX,
  POPULAR_ABBREVIATIONS,
  PREDEFINED_VARIABLES,
  PSEUDO_CLASSES,
} from './data';
import type { IntelligenceContext } from './types';

/**
 * What a suggestion is, semantically. Hosts map these onto their own item
 * kinds (VS Code's `CompletionItemKind`, Monaco's, …).
 */
export type MapleCompletionKind =
  | 'property'
  | 'value'
  | 'color'
  | 'variable'
  | 'alias'
  | 'localAlias'
  | 'pseudo'
  | 'mediaQuery'
  | 'aliasDefinition';

export interface MapleCompletion {
  label: string;
  insertText: string;
  /** Set when the text the fuzzy matcher should see differs from the insert. */
  filterText?: string;
  detail?: string;
  /** Markdown source; hosts wrap it in whatever their API expects. */
  documentation?: string;
  kind: MapleCompletionKind;
  /**
   * Ordering key, leading digit first (`0-` media queries … `8-` pseudo
   * classes). Kept as an opaque string rather than a group number because the
   * suffix carries the intra-group order too — abbreviation popularity, color
   * tone, numeric value.
   */
  sortText: string;
  /**
   * Document span the item replaces — the whole class token under the cursor.
   * Empty (start === end) inserts at the cursor.
   */
  replaceStart: number;
  replaceEnd: number;
}

/** Breakpoint and scheme prefixes usable as `@md:` / `md:`. */
const MEDIA_QUERIES = [
  ...Object.keys(OPTIONS.breakpoints),
  'dark',
  'light',
  'portrait',
  'landscape',
];

const FRACTION_PROPS = ['w', 'h', 'mnw', 'mnh', 'mxw', 'mxh'];

const GRADIENT_STOP_SUFFIXES = [
  '0',
  '%',
  '50%',
  '100%',
  '0.25turn',
  '0.5turn',
  '0.75turn',
  '1turn',
  '45deg',
  '90deg',
  '180deg',
];

function matchesPrefix(val: string, prefix: string): boolean {
  return val.startsWith(prefix);
}

function toKebab(prop: string): string {
  return prop.replace(/([A-Z])/g, '-$1').toLowerCase();
}

export function generateSpacingValues(prefix: string): Array<string> {
  const values: Array<string> = [];

  // Base values with decimals
  const baseValues = new Array(40).fill(1).map((_, i) => (i * 0.25).toString());
  if (prefix) {
    const baseVal = Math.ceil(parseFloat(prefix));
    if (!isNaN(baseVal) && baseVal >= 10) {
      for (let i = 0; i < 4; i++) {
        baseValues.push(`${baseVal + i * 0.25}`);
      }
    }
    if (!isNaN(baseVal)) {
      for (let i = 0; i < 40; i++) {
        baseValues.push(`${baseVal * 10 + i * 0.25}`);
      }
    }
  }

  // Add auto
  baseValues.push('auto');
  // Filter by prefix
  for (const val of baseValues) {
    if (matchesPrefix(val, prefix) && !values.includes(val)) {
      values.push(val);
    }
  }

  return values;
}

export function generateFractionValues(base = 12) {
  const items = [];
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

  for (let i = 1; i <= base; i++) {
    const common = gcd(i, base);
    const reducedNum = i / common;
    const reducedDen = base / common;
    const reduced = `${reducedNum}/${reducedDen}`;

    const percentage = (i / base) * 100;

    items.push({
      value: reduced,
      sortIndex: `${i}/${base}`.padStart(5, '0'),
      percentage: `${percentage.toFixed(2)}%`,
    });
  }

  // De-duplicate fractions
  return items.filter(
    (item, index, self) =>
      index === self.findIndex((t) => t.value === item.value),
  );
}

/** Whether the cursor sits inside the opening tag of the root `<html>` element. */
function isInHtmlTag(text: string, offset: number): boolean {
  const before = text.substring(0, offset);
  const lastOpeningTagIndex = before.lastIndexOf('<');
  if (lastOpeningTagIndex === -1) return false;

  const tagMatch = /^<\s*([a-zA-Z0-9\-]+)/.exec(
    before.substring(lastOpeningTagIndex),
  );
  return tagMatch?.[1].toLowerCase() === 'html';
}

/**
 * Suggestions for the maple class being typed at `offset`.
 *
 * Returns `null` when the offset is not inside a maple region at all — hosts
 * use that to stand down entirely, as opposed to an empty array, which means
 * "inside a region, nothing to suggest".
 */
export function getCompletions(
  text: string,
  offset: number,
  ctx: IntelligenceContext,
): Array<MapleCompletion> | null {
  const languageService = LanguageServiceRegistry.getService(ctx.languageId);
  if (!languageService) return null;

  const instances = languageService.extractClasses(text);
  const currentInstance = instances.find(
    (inst) => offset >= inst.start && offset <= inst.end,
  );
  if (!currentInstance) return null;

  const items: Array<MapleCompletion> = [];
  const customAliases = ctx.localAliases ?? new Map<string, string>();

  const {
    word,
    start: replaceStart,
    end: replaceEnd,
  } = getExactWordAtOffset(text, offset);

  if (isInHtmlTag(text, offset)) {
    items.push({
      label: '--alias-',
      insertText: '--alias-',
      kind: 'aliasDefinition',
      detail: 'Define Custom Maple Alias',
      documentation: `Defines a custom alias on the root HTML element.\n\nExample: \`--alias-truncate=of=hidden;tof=ellipsis;ws=nowrap\``,
      sortText: '1---alias',
      replaceStart,
      replaceEnd,
    });
  }

  let currentWord = word;

  // Strip framework prefixes for specific class bindings (e.g., [class.bg-red-500] or class:bg-red-500)
  let frameworkPrefix = '';
  if (currentWord.startsWith('[class.')) {
    frameworkPrefix = '[class.';
    currentWord = currentWord.substring(7);
  } else if (currentWord.startsWith('class:')) {
    frameworkPrefix = 'class:';
    currentWord = currentWord.substring(6);
  }

  // Strip custom alias prefix (e.g. --alias-btn=bgc-red)
  if (currentWord.startsWith('--alias-')) {
    const eqIndex = currentWord.indexOf('=');
    if (eqIndex !== -1) {
      frameworkPrefix += currentWord.substring(0, eqIndex + 1);
      currentWord = currentWord.substring(eqIndex + 1);
    }
  }

  const isMedia = currentWord.startsWith('@');
  const hasPseudo = currentWord.includes(':');

  // Split by ':' to see prefix (e.g. "hover:" or "@md:")
  const parts = currentWord.split(':');
  const prefixParts = parts.slice(0, parts.length - 1);
  const activeWord = parts[parts.length - 1]; // what follows the last colon
  const typedPrefix = prefixParts.length > 0 ? prefixParts.join(':') + ':' : '';

  /** A suggestion that replaces the typed word, framework prefix included. */
  const push = (
    label: string,
    insertText: string,
    kind: MapleCompletionKind,
    sortText: string,
    extras: Pick<
      MapleCompletion,
      'detail' | 'documentation' | 'filterText'
    > = {},
  ) => {
    items.push({
      label,
      insertText: frameworkPrefix + insertText,
      filterText: frameworkPrefix + (extras.filterText ?? insertText),
      detail: extras.detail,
      documentation: extras.documentation,
      kind,
      sortText,
      replaceStart,
      replaceEnd,
    });
  };

  /**
   * A value suggestion. Unlike keys these carry the fully composed class as
   * their label; the framework prefix stays out of the label but has to go
   * back into the text, because the replace span covers it — an item that
   * inserted a bare `bgc-red` inside `--alias-btn=bgc-` would drop the
   * definition, and would not match the host's filter to begin with.
   */
  const pushValue = (
    label: string,
    kind: MapleCompletionKind,
    sortText: string,
    detail?: string,
  ) => {
    items.push({
      label,
      insertText: frameworkPrefix + label,
      filterText: frameworkPrefix + label,
      detail,
      kind,
      sortText,
      replaceStart,
      replaceEnd,
    });
  };

  if (isMedia && !hasPseudo) {
    for (const mq of MEDIA_QUERIES) {
      push(`@${mq}:`, `@${mq}:`, 'mediaQuery', `0-@${mq}`, {
        detail: 'Maple Media Query',
        documentation: `Applies rules for \`@${mq}\` breakpoints.`,
      });
    }

    for (const [alias, expansion] of customAliases.entries()) {
      push(`@${alias}`, `@${alias}`, 'localAlias', `1-custom-${alias}`, {
        detail: 'Custom Maple Alias',
        documentation: `Expands to: \`${expansion}\``,
      });
    }

    for (const [alias, expansion] of Object.entries(BUILTIN_ALIASES)) {
      push(`@${alias}`, `@${alias}`, 'alias', `2-${alias}`, {
        detail: 'Maple Built-in Alias',
        documentation: `Expands to: \`${expansion}\``,
      });
    }

    return items;
  }

  // If we haven't typed a hyphen in the active part, we can suggest pseudo-classes with colon
  if (!activeWord.includes('-') && !isMedia) {
    for (const pc of PSEUDO_CLASSES) {
      push(`${pc}:`, `${typedPrefix}${pc}:`, 'pseudo', `8-${pc}`, {
        // help fuzzy matcher
        filterText: `${typedPrefix}${pc}`,
        detail: 'Maple Pseudo Class',
        documentation: `Applies rules for \`:${pc}\` pseudo-class.`,
      });
    }
    for (const mq of MEDIA_QUERIES) {
      push(`${mq}:`, `${typedPrefix}${mq}:`, 'mediaQuery', `0-${mq}`, {
        filterText: `${typedPrefix}${mq}`,
        detail: 'Maple Container Query',
        documentation: `Applies rules for \`${mq}\` container breakpoints.`,
      });

      push(`@${mq}:`, `${typedPrefix}@${mq}:`, 'mediaQuery', `0-@${mq}`, {
        filterText: `${typedPrefix}@${mq}`,
        detail: 'Maple Media Query',
        documentation: `Applies rules for \`@${mq}\` breakpoints.`,
      });
    }
  }

  // Predefined Variables (e.g. --l-shift)
  // Show if empty, or starts with -
  if (activeWord === '' || activeWord.startsWith('-')) {
    for (const variable of PREDEFINED_VARIABLES) {
      push(
        `${variable.name}=`,
        `${typedPrefix}${variable.name}=`,
        'variable',
        `1-${variable.name}`,
        {
          detail: 'Maple Predefined Variable',
          documentation: variable.description,
        },
      );
    }
  }

  // If the user hasn't typed a hyphen in the activeWord, suggest prefixes and aliases
  if (!activeWord.includes('-')) {
    for (const [abbr, prop] of Object.entries(ABBREVIATIONS)) {
      const documentation = `Sets the \`${toKebab(prop)}\` CSS property.`;
      const popIndex = POPULAR_ABBREVIATIONS.indexOf(abbr);
      const sortPriority =
        popIndex > -1 ? String(popIndex).padStart(3, '0') : '999';

      push(
        `${abbr}-`,
        `${typedPrefix}${abbr}-`,
        'property',
        `2-${sortPriority}-${abbr}`,
        { detail: `Maple: ${prop}`, documentation },
      );

      // Add full key (camelCase)
      push(
        `${prop}-`,
        `${typedPrefix}${prop}-`,
        'property',
        `2-${sortPriority}-${prop}`,
        { detail: `Maple (Full Key): ${prop}`, documentation },
      );

      // Add full key (kebab-case)
      const kebabProp = toKebab(prop);
      if (kebabProp !== prop) {
        push(
          `${kebabProp}-`,
          `${typedPrefix}${kebabProp}-`,
          'property',
          `2-${sortPriority}-${kebabProp}`,
          { detail: `Maple (Full Key): ${kebabProp}`, documentation },
        );
      }
    }

    for (const [alias, expansion] of Object.entries(BUILTIN_ALIASES)) {
      push(alias, `${typedPrefix}${alias}`, 'alias', `3-${alias}`, {
        detail: 'Maple Alias',
        documentation: `Expands to: \`${expansion}\``,
      });
    }

    for (const [alias, expansion] of customAliases.entries()) {
      push(
        `@${alias}`,
        `${typedPrefix}@${alias}`,
        'localAlias',
        `3-custom-${alias}`,
        {
          detail: 'Custom Maple Alias',
          documentation: `Expands to: \`${expansion}\``,
        },
      );
    }

    return items;
  }

  // User typed a prefix and a hyphen, e.g. "bgc-" or "-m-"
  const isNegative = activeWord.startsWith('-') && !activeWord.startsWith('--');
  const checkWord = isNegative ? activeWord.substring(1) : activeWord;
  const activePrefix = checkWord.split('-')[0];
  const negPrefix = isNegative ? '-' : '';

  let mappedPrefix = activePrefix;
  if (!ABBREVIATIONS[activePrefix]) {
    for (const [abbr, propValue] of Object.entries(ABBREVIATIONS)) {
      if (propValue === activePrefix || toKebab(propValue) === activePrefix) {
        mappedPrefix = abbr;
        break;
      }
    }
  }

  if (!ABBREVIATIONS[mappedPrefix]) return items;

  const prop = ABBREVIATIONS[mappedPrefix];
  const kebabProp = toKebab(prop);
  const propType = PropertyHelper.resolveType(kebabProp, prop);
  const isColorProp = propType === PROP_TYPE_COLOR;
  const typedValue = checkWord.substring(activePrefix.length + 1);
  /** `hover:-m-`, the part every value suggestion is appended to. */
  const utilPrefix = `${typedPrefix}${negPrefix}${activePrefix}-`;

  /**
   * Named colors and their tones. Gradient stops carry no per-item detail,
   * unlike color properties, hence `withDetail`.
   */
  const pushColors = (
    basePrefix: string,
    colorTyped: string,
    withDetail: boolean,
  ) => {
    for (const colorName of Object.keys(namedColors)) {
      if (
        !colorTyped ||
        matchesPrefix(colorName, colorTyped) ||
        matchesPrefix(colorTyped, colorName)
      ) {
        if (!colorTyped || matchesPrefix(colorName, colorTyped)) {
          pushValue(
            `${basePrefix}${colorName}`,
            'color',
            `5-${colorName}-000`,
            withDetail ? namedColors[colorName] : undefined,
          );
        }

        if (
          colorName !== 'white' &&
          colorName !== 'black' &&
          colorTyped.length > 0
        ) {
          for (
            let i = COLOR_MIN_TONE;
            i <= COLOR_MAX_TONE;
            i += i >= 100 ? 100 : 50
          ) {
            const tone = i.toString();
            const fullColor = `${colorName}-${tone}`;
            if (matchesPrefix(fullColor, colorTyped)) {
              pushValue(
                `${basePrefix}${fullColor}`,
                'color',
                `5-${colorName}-${tone.padStart(3, '0')}`,
                withDetail
                  ? `${namedColors[colorName]} tone ${tone}`
                  : undefined,
              );
            }
          }
        }
      }
    }
  };

  /** `bgc-red/5|` — the opacity half of a color value. */
  const pushOpacities = (basePrefix: string, opacityTyped: string) => {
    for (let i = 0; i <= 100; i++) {
      const opStr = i.toString();
      if (matchesPrefix(opStr, opacityTyped)) {
        pushValue(
          `${basePrefix}${opStr}`,
          'value',
          `7-${opStr.padStart(3, '0')}`,
          `Opacity ${opStr}%`,
        );
      }
    }
  };

  if (activePrefix === 'bgimg' || activePrefix === 'bg') {
    let argsString = typedValue;
    const doubleUnderscoreIdx = typedValue.indexOf('__');
    if (doubleUnderscoreIdx !== -1) {
      argsString = typedValue.substring(0, doubleUnderscoreIdx);
    }

    const args = argsString.split('|');
    const lastArg = args[args.length - 1];
    const baseClass =
      utilPrefix +
      (args.length > 1 ? args.slice(0, args.length - 1).join('|') + '|' : '');

    if (doubleUnderscoreIdx !== -1) return items;

    if (args.length === 1) {
      for (const [gKey, gProp] of Object.entries(FUNCTION_KEYS)) {
        if (gProp.includes('gradient') && matchesPrefix(gKey, lastArg)) {
          pushValue(
            `${baseClass}${gKey}`,
            'value',
            `4-${gKey}`,
            `Gradient: ${gProp}`,
          );
        }
      }
    } else {
      for (const dir of GRADIENT_DIRECTIONS) {
        if (matchesPrefix(dir, lastArg)) {
          pushValue(
            `${baseClass}${dir}`,
            'value',
            `4-dir-${dir}`,
            `Direction: ${dir.replace(/_/g, ' ')}`,
          );
        }
      }
    }

    const colorArgs = lastArg.split('_');
    const colorTypedFull = colorArgs[0];
    const hasOpacity = colorTypedFull.includes('/');
    const colorTyped = hasOpacity
      ? colorTypedFull.split('/')[0]
      : colorTypedFull;

    if (colorArgs.length === 1) {
      if (hasOpacity) {
        pushOpacities(
          `${baseClass}${colorTyped}/`,
          colorTypedFull.split('/')[1] || '',
        );
      } else {
        pushColors(baseClass, colorTyped, false);
        pushValue(`${baseClass}transparent`, 'color', '5-transparent');
      }
    } else {
      const colorPrefix = `${baseClass}${colorArgs.slice(0, colorArgs.length - 1).join('_')}_`;
      const suffixTyped = colorArgs[colorArgs.length - 1];
      for (const suf of GRADIENT_STOP_SUFFIXES) {
        if (matchesPrefix(suf, suffixTyped)) {
          pushValue(`${colorPrefix}${suf}`, 'value', `6-${suf}`);
        }
      }
    }

    return items;
  }

  if (isColorProp) {
    const hasOpacity = typedValue.includes('/');
    const colorTyped = hasOpacity ? typedValue.split('/')[0] : typedValue;

    if (hasOpacity) {
      pushOpacities(
        `${utilPrefix}${colorTyped}/`,
        typedValue.split('/')[1] || '',
      );
      return items;
    }

    pushColors(utilPrefix, colorTyped, true);
    pushValue(`${utilPrefix}transparent`, 'color', '5-transparent');
    pushValue(`${utilPrefix}current`, 'color', '5-current');
    pushValue(`${utilPrefix}inherit`, 'color', '5-inherit');

    return items;
  }

  const predefinedOptions = CSS_OPTIONS[prop] || [];

  if (predefinedOptions.length > 0) {
    for (const opt of predefinedOptions) {
      if (matchesPrefix(opt, typedValue)) {
        pushValue(`${utilPrefix}${opt}`, 'value', `4-${opt}`, `Value: ${opt}`);
      }
    }
  } else {
    let sizes: Array<string> = [];
    let isFractionAllowed = false;

    let currentTypedValue = typedValue;
    let multiPrefix = '';
    const isMultiValue = MULTI_VALUE_REGEX.test(prop);

    if (isMultiValue && typedValue.includes('_')) {
      const valueParts = typedValue.split('_');
      currentTypedValue = valueParts[valueParts.length - 1];
      multiPrefix = valueParts.slice(0, valueParts.length - 1).join('_') + '_';
    }

    if (PROP_UNIT_MAP[prop] === DEFAULT_TIME_UNIT) {
      sizes = ['75', '100', '150', '200', '300', '500', '700', '1000'];
    } else if (PROP_UNIT_MAP[prop] === DEFAULT_ANGLE_UNIT) {
      sizes = ['0', '15', '30', '45', '60', '90', '180', '360'];
    } else if (propType !== PROP_TYPE_SPACE) {
      const lowerProp = prop.toLowerCase();
      if (lowerProp.includes('opacity')) {
        sizes = [
          '0',
          '5',
          '10',
          '20',
          '25',
          '30',
          '40',
          '50',
          '60',
          '70',
          '75',
          '80',
          '90',
          '95',
          '100',
        ];
      } else if (lowerProp.includes('weight')) {
        sizes = ['100', '200', '300', '400', '500', '600', '700', '800', '900'];
      } else if (lowerProp.includes('index')) {
        sizes = [
          '0',
          '1',
          '2',
          '3',
          '4',
          '5',
          '10',
          '20',
          '30',
          '40',
          '50',
          '100',
        ];
      } else {
        sizes = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
      }
    } else {
      sizes = generateSpacingValues(currentTypedValue);
      isFractionAllowed = true;
    }

    for (const size of sizes) {
      if (!currentTypedValue || matchesPrefix(size, currentTypedValue)) {
        const numVal = isNaN(parseFloat(size)) ? 999 : parseFloat(size);
        pushValue(
          `${utilPrefix}${multiPrefix}${size}`,
          'value',
          `4-${String(numVal * 100).padStart(6, '0')}`,
          `Value ${size}`,
        );
      }
    }

    // Add fraction values for generic numeric props (like width, height)
    if (isFractionAllowed && FRACTION_PROPS.includes(activePrefix)) {
      for (const frac of generateFractionValues()) {
        if (
          !currentTypedValue ||
          matchesPrefix(frac.value, currentTypedValue)
        ) {
          pushValue(
            `${utilPrefix}${multiPrefix}${frac.value}`,
            'value',
            `4-frac-${frac.sortIndex}`,
            `Size ${frac.percentage}`,
          );
        }
      }
    }
  }

  // Also add default CSS values (inherit, initial, etc)
  for (const defVal of DEFAULT_CSS_VALUES) {
    if (matchesPrefix(defVal, typedValue)) {
      pushValue(
        `${utilPrefix}${defVal}`,
        'value',
        `5-${defVal}`,
        `CSS Default: ${defVal}`,
      );
    }
  }

  return items;
}
