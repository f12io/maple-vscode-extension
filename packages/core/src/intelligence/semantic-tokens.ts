import { BUILTIN_ALIASES, parseClass, StringHelper } from '@f12io/maple';
import {
  ALIAS_REGEX,
  MAPLE_CLASS_REGEX,
  MAPLE_COMMA_SPLIT_REGEX,
  MAPLE_PARAMS_SPLIT_REGEX,
  MAPLE_UNDERSCORE_SPLIT_REGEX,
} from '../regex';
import { LanguageServiceRegistry } from '../registry';
import { getUtilKey } from './get-util-key';
import {
  checkConverted,
  getAliasName,
  isAliasDefinition,
  isAliasMarker,
  isVariable,
  stripQuotes,
} from './maple-parser';
import type { IntelligenceContext } from './types';

type ParsedClass = ReturnType<typeof parseClass>;

/** The token taxonomy shared by every Maple editor host. */
export type MapleTokenType =
  | 'mediaQuery'
  | 'utility'
  | 'value'
  | 'parentSelector'
  | 'selfSelector'
  | 'childSelector'
  | 'selectorOperator'
  | 'separator'
  | 'underscore'
  | 'alias'
  | 'variable'
  | 'important'
  | 'aliasParamKey';

/** A highlighting span, in document offsets. Never spans a line break. */
export interface MapleSemanticToken {
  start: number;
  length: number;
  type: MapleTokenType;
}

export const MAPLE_TOKEN_TYPES: Array<MapleTokenType> = [
  'mediaQuery',
  'utility',
  'value',
  'parentSelector',
  'selfSelector',
  'childSelector',
  'selectorOperator',
  'separator',
  'underscore',
  'alias',
  'variable',
  'important',
  'aliasParamKey',
];

/**
 * TextMate scopes each token type falls back to, so hosts that theme by scope
 * (VS Code's `semanticTokenScopes`) render the same colors.
 */
export const MAPLE_TOKEN_SCOPES: Record<MapleTokenType, Array<string>> = {
  mediaQuery: [
    'keyword.control.at-rule.media.css',
    'keyword.control',
    'keyword',
  ],
  utility: ['support.type.property-name.css'],
  value: [
    'string.quoted.single.css',
    'string.quoted.double.html',
    'meta.attribute.class.html',
  ],
  parentSelector: ['entity.other.attribute-name.class.css'],
  selfSelector: ['entity.other.attribute-name.class.css'],
  childSelector: ['entity.other.attribute-name.class.css'],
  selectorOperator: ['keyword.operator.css'],
  separator: ['meta.embedded'],
  underscore: [
    'punctuation.definition.tag',
    'punctuation.separator',
    'punctuation',
    'meta.embedded',
  ],
  alias: ['entity.name.function'],
  variable: ['variable.css', 'variable.other.customproperty.css'],
  important: [
    'keyword.other.important.css',
    'keyword.other.important',
    'keyword',
  ],
  aliasParamKey: ['variable.parameter'],
};

/**
 * Dark-plus colors for the scopes above, for hosts that theme by explicit
 * color instead of scope (Monaco).
 */
export const MAPLE_TOKEN_COLORS_DARK_PLUS: Record<MapleTokenType, string> = {
  mediaQuery: 'C586C0',
  utility: '9CDCFE',
  value: 'CE9178',
  parentSelector: 'D7BA7D',
  selfSelector: 'D7BA7D',
  childSelector: 'D7BA7D',
  selectorOperator: 'D4D4D4',
  separator: 'D4D4D4',
  underscore: '808080',
  alias: 'DCDCAA',
  variable: '4FC1FF',
  important: '569CD6',
  aliasParamKey: '9CDCFE',
};

/** Collects the alias names usable in `text`: in-document plus host-supplied. */
function collectAliasNames(
  text: string,
  hostAliases: ReadonlyMap<string, string> | undefined,
): Set<string> {
  const names = new Set<string>();

  for (const match of text.matchAll(ALIAS_REGEX)) {
    names.add(match[1]);
  }
  if (hostAliases) {
    for (const name of hostAliases.keys()) names.add(name);
  }

  return names;
}

/**
 * Tokenizes every maple class in `text` into offset-based semantic tokens,
 * sorted by start offset.
 *
 * Region discovery is handled here: only classes inside maple regions of the
 * document (class attributes, `className={...}`, opt-in expressions, …) are
 * considered, so hosts need no gating logic of their own. A class only emits
 * tokens when the engine can convert it or it resolves to an alias, so valid
 * classes light up and typos stay plain.
 */
export function computeSemanticTokens(
  text: string,
  ctx: IntelligenceContext,
): Array<MapleSemanticToken> {
  const tokens: Array<MapleSemanticToken> = [];

  const languageService = LanguageServiceRegistry.getService(ctx.languageId);
  if (!languageService) return tokens;

  const matches = languageService.extractClasses(text);
  const aliases = collectAliasNames(text, ctx.localAliases);

  const push = (start: number, length: number, type: MapleTokenType) => {
    tokens.push({ start, length, type });
  };

  const pushKeyValueTokens = (
    type: MapleTokenType,
    className: string,
    currentOffset: number,
    pushValue: boolean,
  ) => {
    const equalsIndex = className.indexOf('=');
    if (equalsIndex === -1) {
      push(currentOffset, className.length, type);
      return -1;
    }

    push(currentOffset, equalsIndex, type);
    push(currentOffset + equalsIndex, 1, 'separator');

    if (pushValue) {
      const valuePart = className.substring(equalsIndex + 1);
      if (valuePart.length > 0) {
        push(currentOffset + equalsIndex + 1, valuePart.length, 'value');
      }
    }
    return equalsIndex;
  };

  for (const instance of matches) {
    const classStr = instance.value;
    for (const match of classStr.matchAll(MAPLE_CLASS_REGEX)) {
      let className = match[0];
      let currentClassNameOffset = instance.start + match.index;

      const stripped = stripQuotes(className);
      className = stripped.word;
      currentClassNameOffset += stripped.offset;

      if (className.length === 0) continue;

      if (isVariable(className)) {
        pushKeyValueTokens('variable', className, currentClassNameOffset, true);
        continue;
      }

      const parsedClass = parseClass(className);
      if (!parsedClass) continue;

      const processClassTokens = (
        currentClassName: string,
        currentOffset: number,
        parsed: ParsedClass,
        // An alias body is a template, not a class: `{utility}` placeholders
        // keep it from converting, so the convertibility gate is skipped.
        forceHighlight = false,
      ) => {
        const srcClass = parsed.srcClass || currentClassName;
        let mediaQuery = '';
        let parentSel = '';
        let selfSel = '';
        let childSel = '';
        let utilKey = '';

        if (parsed.mediaQuery) mediaQuery = `${parsed.mediaQuery}:`;
        if (parsed.parentSel || parsed.isMultiSelector)
          parentSel = parsed.parentSel
            ? `^${parsed.parentSel.replace(/ /g, '_')}`
            : `^`;
        if (parsed.selfSel) selfSel = `&${parsed.selfSel.replace(/ /g, '_')}`;
        if (parsed.childSel)
          childSel = `/${parsed.childSel.replace(/ /g, '_')}`;

        const importantOffset = parsed.isImportant ? 1 : 0;
        const othersLength =
          mediaQuery.length +
          parentSel.length +
          selfSel.length +
          childSel.length +
          importantOffset;

        const expectsSeparator =
          othersLength > 0 &&
          othersLength !== mediaQuery.length + importantOffset;

        const rawUtilStart = expectsSeparator ? othersLength + 1 : othersLength;
        const rawUtilString = currentClassName.substring(rawUtilStart);
        const rawAliasBase = rawUtilString.replace(/\(.*\)$/, '');
        const aliasName = getAliasName(rawAliasBase);

        let isAlias = false;

        if (isAliasMarker(rawAliasBase) && aliases.has(aliasName)) {
          isAlias = true;
          parsed.utilKey = rawUtilString;
          parsed.utilOp = undefined as unknown as ParsedClass['utilOp'];
          parsed.utilVal = '';
        } else if (BUILTIN_ALIASES[aliasName]) {
          isAlias = true;
          parsed.utilKey = rawUtilString;
          parsed.utilOp = undefined as unknown as ParsedClass['utilOp'];
          parsed.utilVal = '';
        } else if (parsed.utilKey?.startsWith('--alias-')) {
          isAlias = true;
        }

        const isConverted = checkConverted(currentClassName);

        if (!isConverted && !isAlias && !forceHighlight) {
          return;
        }

        if (parsed.isImportant) {
          push(currentOffset, 1, 'important');
        }

        if (parsed.mediaQuery) {
          mediaQuery = `${parsed.mediaQuery}:`;
          const relativeOffset = srcClass.indexOf(mediaQuery);
          if (relativeOffset !== -1) {
            const wordOffset = currentOffset + relativeOffset;
            push(wordOffset, mediaQuery.length - 1, 'mediaQuery');
            push(wordOffset + mediaQuery.length - 1, 1, 'separator');
          }
        }

        const pushTokensWithUnderscores = (
          str: string,
          startOffset: number,
          defaultTokenType: MapleTokenType,
        ) => {
          let currentStrOffset = startOffset;
          const outerParts = str.split(MAPLE_PARAMS_SPLIT_REGEX);

          for (const outerPart of outerParts) {
            if (outerPart.length === 0) continue;

            if (outerPart.startsWith('{') && outerPart.endsWith('}')) {
              push(currentStrOffset, 1, 'separator');

              const innerStr = outerPart.substring(1, outerPart.length - 1);
              const innerParts = innerStr.split(MAPLE_COMMA_SPLIT_REGEX);
              let innerOffset = currentStrOffset + 1;

              for (const innerPart of innerParts) {
                if (innerPart.length === 0) continue;
                if (innerPart === ',') {
                  push(innerOffset, 1, 'separator');
                } else {
                  const isFirst = innerOffset === currentStrOffset + 1;
                  push(
                    innerOffset,
                    innerPart.length,
                    isFirst ? 'aliasParamKey' : 'value',
                  );
                }
                innerOffset += innerPart.length;
              }

              push(currentStrOffset + outerPart.length - 1, 1, 'separator');
              currentStrOffset += outerPart.length;
            } else if (outerPart.startsWith('(') && outerPart.endsWith(')')) {
              push(currentStrOffset, 1, 'separator');

              const innerStr = outerPart.substring(1, outerPart.length - 1);
              let innerOffset = currentStrOffset + 1;

              const params = StringHelper.split(innerStr, ',');
              for (let pIdx = 0; pIdx < params.length; pIdx++) {
                const paramStr = params[pIdx];
                if (paramStr.length === 0) continue;

                const colonIndex = paramStr.indexOf(':');

                if (colonIndex !== -1) {
                  // It has a key
                  const keyStr = paramStr.substring(0, colonIndex);
                  if (keyStr.length > 0) {
                    push(innerOffset, keyStr.length, 'aliasParamKey');
                  }
                  innerOffset += keyStr.length;

                  // Push colon
                  push(innerOffset, 1, 'separator');
                  innerOffset += 1;

                  // Push value
                  const valStr = paramStr.substring(colonIndex + 1);
                  if (valStr.length > 0) {
                    push(innerOffset, valStr.length, 'value');
                    innerOffset += valStr.length;
                  }
                } else {
                  // No key, just a value
                  push(innerOffset, paramStr.length, 'value');
                  innerOffset += paramStr.length;
                }

                // Push comma if not the last param
                if (pIdx < params.length - 1) {
                  push(innerOffset, 1, 'separator');
                  innerOffset += 1;
                }
              }

              push(currentStrOffset + outerPart.length - 1, 1, 'separator');
              currentStrOffset += outerPart.length;
            } else {
              const parts = outerPart.split(MAPLE_UNDERSCORE_SPLIT_REGEX);
              for (const part of parts) {
                if (part.length === 0) continue;
                if (part === '_') {
                  push(currentStrOffset, 1, 'underscore');
                } else if (part === '!important') {
                  push(currentStrOffset, part.length, 'important');
                } else if (part === '!important]') {
                  push(currentStrOffset, part.length - 1, 'important');
                  push(currentStrOffset + part.length - 1, 1, defaultTokenType);
                } else {
                  push(currentStrOffset, part.length, defaultTokenType);
                }
                currentStrOffset += part.length;
              }
            }
          }
        };

        if (parsed.parentSel || parsed.isMultiSelector) {
          parentSel = parsed.parentSel
            ? `^${parsed.parentSel.replace(/ /g, '_')}`
            : `^`;
          const relativeOffset = srcClass.indexOf(parentSel);
          if (relativeOffset !== -1) {
            const wordOffset = currentOffset + relativeOffset;
            push(wordOffset, 1, 'selectorOperator');

            if (parsed.parentSel) {
              pushTokensWithUnderscores(
                parsed.parentSel.replace(/ /g, '_'),
                wordOffset + 1,
                'parentSelector',
              );
            }
          }
        }

        if (parsed.selfSel) {
          selfSel = `&${parsed.selfSel.replace(/ /g, '_')}`;
          const relativeOffset = srcClass.indexOf(selfSel);
          if (relativeOffset !== -1) {
            const wordOffset = currentOffset + relativeOffset;
            push(wordOffset, 1, 'selectorOperator');

            pushTokensWithUnderscores(
              parsed.selfSel.replace(/ /g, '_'),
              wordOffset + 1,
              'selfSelector',
            );
          }
        }

        if (parsed.childSel) {
          childSel = `/${parsed.childSel.replace(/ /g, '_')}`;
          const relativeOffset = srcClass.indexOf(childSel);
          if (relativeOffset !== -1) {
            const wordOffset = currentOffset + relativeOffset;
            push(wordOffset, 1, 'selectorOperator');

            pushTokensWithUnderscores(
              parsed.childSel.replace(/ /g, '_'),
              wordOffset + 1,
              'childSelector',
            );
          }
        }

        if (parsed.utilKey) {
          const util = getUtilKey(parsed);
          if (util) {
            const importantOffset = parsed.isImportant ? 1 : 0;
            const othersLength =
              mediaQuery.length +
              parentSel.length +
              selfSel.length +
              childSel.length +
              importantOffset;

            const expectsSeparator =
              othersLength > 0 &&
              othersLength !== mediaQuery.length + importantOffset;

            const isNegative = parsed.isUtilNegative ? '-' : '';
            const fullUtil = isNegative + util;

            utilKey = `${expectsSeparator ? ':' : ''}${fullUtil}`;
            const wordOffset = currentOffset + othersLength;

            if (expectsSeparator) {
              push(wordOffset, 1, 'separator');
            }

            pushTokensWithUnderscores(
              fullUtil,
              expectsSeparator ? wordOffset + 1 : wordOffset,
              isAlias ? 'alias' : 'utility',
            );
          }
        }

        if (parsed.utilVal) {
          const othersLength =
            mediaQuery.length +
            parentSel.length +
            selfSel.length +
            childSel.length +
            utilKey.length +
            (parsed.isImportant ? 1 : 0);
          const wordOffset = currentOffset + othersLength;

          push(wordOffset, 1, 'separator');

          const rawUtilVal = currentClassName.substring(othersLength + 1);
          if (parsed.utilKey?.startsWith('--alias-')) {
            const subParsed = parseClass(rawUtilVal);
            if (subParsed) {
              processClassTokens(rawUtilVal, wordOffset + 1, subParsed);
            } else {
              pushTokensWithUnderscores(rawUtilVal, wordOffset + 1, 'value');
            }
          } else {
            pushTokensWithUnderscores(rawUtilVal, wordOffset + 1, 'value');
          }
        }
      };

      // `--alias-x=^:is(p,.\@p1)>:{utility}`: when the alias body carries
      // selectors the engine folds `--alias-x=` into the prefix chain, so the
      // definition is no longer the parsed utility. Emit the alias name and
      // `=` here, then highlight the body as a class of its own.
      const equalsIndex = className.indexOf('=');
      if (
        isAliasDefinition(className) &&
        equalsIndex !== -1 &&
        !parsedClass.utilKey?.startsWith('--alias-')
      ) {
        pushKeyValueTokens('alias', className, currentClassNameOffset, false);

        const body = className.substring(equalsIndex + 1);
        const bodyOffset = currentClassNameOffset + equalsIndex + 1;
        const parsedBody = parseClass(body);

        if (parsedBody) {
          processClassTokens(body, bodyOffset, parsedBody, true);
        }
        continue;
      }

      processClassTokens(className, currentClassNameOffset, parsedClass);
    }
  }

  // Hosts feed these to builders that require ascending document order.
  tokens.sort((a, b) => a.start - b.start);

  return tokens;
}
