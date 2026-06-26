import { BUILTIN_ALIASES, parseClass, StringHelper } from '@f12io/maple';
import * as vscode from 'vscode';
import {
  getAliasRegex,
  getMapleClassRegex,
  MAPLE_COMMA_SPLIT_REGEX,
  MAPLE_PARAMS_SPLIT_REGEX,
  MAPLE_UNDERSCORE_SPLIT_REGEX,
} from '../constants/regex';
import { AliasCache } from '../helpers/alias-cache';
import { extractAllClasses } from '../helpers/class-extractor';
import { getHighlightingMode, isExtensionEnabled } from '../helpers/config';
import { isFileExcluded } from '../helpers/exclude';
import { getUtilKey } from '../helpers/get-util-key';
import {
  checkConverted,
  getAliasName,
  isAliasMarker,
  isVariable,
  stripQuotes,
} from '../helpers/maple-parser';

export const tokenTypes = [
  'maple-mediaQuery',
  'maple-utility',
  'maple-value',
  'maple-parent-selector',
  'maple-self-selector',
  'maple-child-selector',
  'maple-selector-operator',
  'maple-separator',
  'maple-underscore',
  'maple-alias',
  'maple-variable',
  'maple-important',
  'maple-alias-param-key',
];

export const tokenModifiers: Array<string> = [];
export const semanticTokensLegend = new vscode.SemanticTokensLegend(
  tokenTypes,
  tokenModifiers,
);

const semanticTokenIndexes = {
  mapleMediaQuery: 0,
  mapleUtility: 1,
  mapleValue: 2,
  mapleParentSelector: 3,
  mapleSelfSelector: 4,
  mapleChildSelector: 5,
  mapleSelectorOperator: 6,
  mapleSeparator: 7,
  mapleUnderscore: 8,
  mapleAlias: 9,
  mapleVariable: 10,
  mapleImportant: 11,
  mapleAliasParamKey: 12,
};

export class MapleSemanticTokensProvider
  implements vscode.DocumentSemanticTokensProvider
{
  provideDocumentSemanticTokens(
    document: vscode.TextDocument,
    token: vscode.CancellationToken,
  ): vscode.ProviderResult<vscode.SemanticTokens> {
    if (
      !isExtensionEnabled(document) ||
      isFileExcluded(document.uri) ||
      getHighlightingMode() === 'off'
    )
      return new vscode.SemanticTokens(new Uint32Array(0));

    const builder = new vscode.SemanticTokensBuilder(semanticTokensLegend);
    const text = document.getText();
    const matches = extractAllClasses(text);

    // Local alias fallback
    const localAliases = new Map<string, string>();
    const aliasRegex = getAliasRegex();
    let aliasMatch;
    while ((aliasMatch = aliasRegex.exec(text)) !== null) {
      localAliases.set(aliasMatch[1], aliasMatch[2]);
    }
    const globalAliases = AliasCache.getAliases(document.uri);

    const tokens: Array<{
      line: number;
      character: number;
      length: number;
      tokenType: number;
      tokenModifiers: number;
    }> = [];

    const pushKeyValueTokens = (
      tokenType: number,
      className: string,
      currentOffset: number,
      startPos: vscode.Position,
      pushValue: boolean,
    ) => {
      const equalsIndex = className.indexOf('=');
      if (equalsIndex !== -1) {
        tokens.push({
          line: startPos.line,
          character: startPos.character,
          length: equalsIndex,
          tokenType,
          tokenModifiers: 0,
        });

        const eqPos = document.positionAt(currentOffset + equalsIndex);
        tokens.push({
          line: eqPos.line,
          character: eqPos.character,
          length: 1,
          tokenType: semanticTokenIndexes.mapleSeparator,
          tokenModifiers: 0,
        });

        if (pushValue) {
          const valuePart = className.substring(equalsIndex + 1);
          if (valuePart.length > 0) {
            const valuePos = document.positionAt(
              currentOffset + equalsIndex + 1,
            );
            tokens.push({
              line: valuePos.line,
              character: valuePos.character,
              length: valuePart.length,
              tokenType: semanticTokenIndexes.mapleValue,
              tokenModifiers: 0,
            });
          }
        }
        return equalsIndex;
      } else {
        tokens.push({
          line: startPos.line,
          character: startPos.character,
          length: className.length,
          tokenType,
          tokenModifiers: 0,
        });
        return -1;
      }
    };

    for (const instance of matches) {
      const classStr = instance.value;
      const mapleClassRegex = getMapleClassRegex();
      let match;
      while ((match = mapleClassRegex.exec(classStr)) !== null) {
        let className = match[0];
        let currentClassNameOffset = instance.start + match.index;

        const stripped = stripQuotes(className);
        className = stripped.word;
        currentClassNameOffset += stripped.offset;

        if (className.length === 0) continue;

        const startPos = document.positionAt(currentClassNameOffset);

        if (isVariable(className)) {
          pushKeyValueTokens(
            semanticTokenIndexes.mapleVariable,
            className,
            currentClassNameOffset,
            startPos,
            true,
          );
          continue;
        }

        const parsedClass = parseClass(className);
        if (!parsedClass) continue;

        const processClassTokens = (
          currentClassName: string,
          currentOffset: number,
          parsed: any,
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

          const rawUtilStart = expectsSeparator
            ? othersLength + 1
            : othersLength;
          const rawUtilString = currentClassName.substring(rawUtilStart);
          const rawAliasBase = rawUtilString.replace(/\(.*\)$/, '');
          const aliasName = getAliasName(rawAliasBase);

          let isAlias = false;

          if (
            isAliasMarker(rawAliasBase) &&
            (localAliases.has(aliasName) || globalAliases.has(aliasName))
          ) {
            isAlias = true;
            parsed.utilKey = rawUtilString;
            parsed.utilOp = undefined as any;
            parsed.utilVal = '';
          } else if (BUILTIN_ALIASES[aliasName]) {
            isAlias = true;
            parsed.utilKey = rawUtilString;
            parsed.utilOp = undefined as any;
            parsed.utilVal = '';
          } else if (parsed.utilKey?.startsWith('--alias-')) {
            isAlias = true;
          }

          const isConverted = checkConverted(currentClassName);

          if (!isConverted && !isAlias) {
            return;
          }

          if (parsed.isImportant) {
            tokens.push({
              line: document.positionAt(currentOffset).line,
              character: document.positionAt(currentOffset).character,
              length: 1,
              tokenType: semanticTokenIndexes.mapleImportant,
              tokenModifiers: 0,
            });
          }

          if (parsed.mediaQuery) {
            mediaQuery = `${parsed.mediaQuery}:`;
            const relativeOffset = srcClass.indexOf(mediaQuery);
            if (relativeOffset !== -1) {
              const wordOffset = currentOffset + relativeOffset;
              const pos = document.positionAt(wordOffset);

              tokens.push({
                line: pos.line,
                character: pos.character,
                length: mediaQuery.length - 1,
                tokenType: semanticTokenIndexes.mapleMediaQuery,
                tokenModifiers: 0,
              });

              const sepPos = document.positionAt(
                wordOffset + mediaQuery.length - 1,
              );
              tokens.push({
                line: sepPos.line,
                character: sepPos.character,
                length: 1,
                tokenType: semanticTokenIndexes.mapleSeparator,
                tokenModifiers: 0,
              });
            }
          }

          const pushTokensWithUnderscores = (
            str: string,
            startOffset: number,
            defaultTokenType: number,
          ) => {
            let currentStrOffset = startOffset;
            const outerParts = str.split(MAPLE_PARAMS_SPLIT_REGEX);

            for (const outerPart of outerParts) {
              if (outerPart.length === 0) continue;

              if (outerPart.startsWith('{') && outerPart.endsWith('}')) {
                const pos1 = document.positionAt(currentStrOffset);
                tokens.push({
                  line: pos1.line,
                  character: pos1.character,
                  length: 1,
                  tokenType: semanticTokenIndexes.mapleSeparator,
                  tokenModifiers: 0,
                });

                const innerStr = outerPart.substring(1, outerPart.length - 1);
                const innerParts = innerStr.split(MAPLE_COMMA_SPLIT_REGEX);
                let innerOffset = currentStrOffset + 1;

                for (const innerPart of innerParts) {
                  if (innerPart.length === 0) continue;
                  const posInner = document.positionAt(innerOffset);
                  if (innerPart === ',') {
                    tokens.push({
                      line: posInner.line,
                      character: posInner.character,
                      length: 1,
                      tokenType: semanticTokenIndexes.mapleSeparator,
                      tokenModifiers: 0,
                    });
                  } else {
                    const isFirst = innerOffset === currentStrOffset + 1;
                    tokens.push({
                      line: posInner.line,
                      character: posInner.character,
                      length: innerPart.length,
                      tokenType: isFirst
                        ? semanticTokenIndexes.mapleAliasParamKey
                        : semanticTokenIndexes.mapleValue,
                      tokenModifiers: 0,
                    });
                  }
                  innerOffset += innerPart.length;
                }

                const pos2 = document.positionAt(
                  currentStrOffset + outerPart.length - 1,
                );
                tokens.push({
                  line: pos2.line,
                  character: pos2.character,
                  length: 1,
                  tokenType: semanticTokenIndexes.mapleSeparator,
                  tokenModifiers: 0,
                });
                currentStrOffset += outerPart.length;
              } else if (outerPart.startsWith('(') && outerPart.endsWith(')')) {
                const pos1 = document.positionAt(currentStrOffset);
                tokens.push({
                  line: pos1.line,
                  character: pos1.character,
                  length: 1,
                  tokenType: semanticTokenIndexes.mapleSeparator,
                  tokenModifiers: 0,
                });

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
                      tokens.push({
                        line: document.positionAt(innerOffset).line,
                        character: document.positionAt(innerOffset).character,
                        length: keyStr.length,
                        tokenType: semanticTokenIndexes.mapleAliasParamKey,
                        tokenModifiers: 0,
                      });
                    }
                    innerOffset += keyStr.length;

                    // Push colon
                    tokens.push({
                      line: document.positionAt(innerOffset).line,
                      character: document.positionAt(innerOffset).character,
                      length: 1,
                      tokenType: semanticTokenIndexes.mapleSeparator,
                      tokenModifiers: 0,
                    });
                    innerOffset += 1;

                    // Push value
                    const valStr = paramStr.substring(colonIndex + 1);
                    if (valStr.length > 0) {
                      tokens.push({
                        line: document.positionAt(innerOffset).line,
                        character: document.positionAt(innerOffset).character,
                        length: valStr.length,
                        tokenType: semanticTokenIndexes.mapleValue,
                        tokenModifiers: 0,
                      });
                      innerOffset += valStr.length;
                    }
                  } else {
                    // No key, just a value
                    tokens.push({
                      line: document.positionAt(innerOffset).line,
                      character: document.positionAt(innerOffset).character,
                      length: paramStr.length,
                      tokenType: semanticTokenIndexes.mapleValue,
                      tokenModifiers: 0,
                    });
                    innerOffset += paramStr.length;
                  }

                  // Push comma if not the last param
                  if (pIdx < params.length - 1) {
                    tokens.push({
                      line: document.positionAt(innerOffset).line,
                      character: document.positionAt(innerOffset).character,
                      length: 1,
                      tokenType: semanticTokenIndexes.mapleSeparator,
                      tokenModifiers: 0,
                    });
                    innerOffset += 1;
                  }
                }

                const pos2 = document.positionAt(
                  currentStrOffset + outerPart.length - 1,
                );
                tokens.push({
                  line: pos2.line,
                  character: pos2.character,
                  length: 1,
                  tokenType: semanticTokenIndexes.mapleSeparator,
                  tokenModifiers: 0,
                });
                currentStrOffset += outerPart.length;
              } else {
                const parts = outerPart.split(MAPLE_UNDERSCORE_SPLIT_REGEX);
                for (const part of parts) {
                  if (part.length === 0) continue;
                  const pos = document.positionAt(currentStrOffset);
                  if (part === '_') {
                    tokens.push({
                      line: pos.line,
                      character: pos.character,
                      length: 1,
                      tokenType: semanticTokenIndexes.mapleUnderscore,
                      tokenModifiers: 0,
                    });
                  } else if (part === '!important') {
                    tokens.push({
                      line: pos.line,
                      character: pos.character,
                      length: part.length,
                      tokenType: semanticTokenIndexes.mapleImportant,
                      tokenModifiers: 0,
                    });
                  } else if (part === '!important]') {
                    tokens.push({
                      line: pos.line,
                      character: pos.character,
                      length: part.length - 1,
                      tokenType: semanticTokenIndexes.mapleImportant,
                      tokenModifiers: 0,
                    });
                    tokens.push({
                      line: pos.line,
                      character: pos.character + part.length - 1,
                      length: 1,
                      tokenType: defaultTokenType,
                      tokenModifiers: 0,
                    });
                  } else {
                    tokens.push({
                      line: pos.line,
                      character: pos.character,
                      length: part.length,
                      tokenType: defaultTokenType,
                      tokenModifiers: 0,
                    });
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
              const pos = document.positionAt(wordOffset);

              tokens.push({
                line: pos.line,
                character: pos.character,
                length: 1,
                tokenType: semanticTokenIndexes.mapleSelectorOperator,
                tokenModifiers: 0,
              });

              if (parsed.parentSel) {
                pushTokensWithUnderscores(
                  parsed.parentSel.replace(/ /g, '_'),
                  wordOffset + 1,
                  semanticTokenIndexes.mapleParentSelector,
                );
              }
            }
          }

          if (parsed.selfSel) {
            selfSel = `&${parsed.selfSel.replace(/ /g, '_')}`;
            const relativeOffset = srcClass.indexOf(selfSel);
            if (relativeOffset !== -1) {
              const wordOffset = currentOffset + relativeOffset;
              const pos = document.positionAt(wordOffset);

              tokens.push({
                line: pos.line,
                character: pos.character,
                length: 1,
                tokenType: semanticTokenIndexes.mapleSelectorOperator,
                tokenModifiers: 0,
              });

              pushTokensWithUnderscores(
                parsed.selfSel.replace(/ /g, '_'),
                wordOffset + 1,
                semanticTokenIndexes.mapleSelfSelector,
              );
            }
          }

          if (parsed.childSel) {
            childSel = `/${parsed.childSel.replace(/ /g, '_')}`;
            const relativeOffset = srcClass.indexOf(childSel);
            if (relativeOffset !== -1) {
              const wordOffset = currentOffset + relativeOffset;
              const pos = document.positionAt(wordOffset);

              tokens.push({
                line: pos.line,
                character: pos.character,
                length: 1,
                tokenType: semanticTokenIndexes.mapleSelectorOperator,
                tokenModifiers: 0,
              });

              pushTokensWithUnderscores(
                parsed.childSel.replace(/ /g, '_'),
                wordOffset + 1,
                semanticTokenIndexes.mapleChildSelector,
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
                const sepPos = document.positionAt(wordOffset);
                tokens.push({
                  line: sepPos.line,
                  character: sepPos.character,
                  length: 1,
                  tokenType: semanticTokenIndexes.mapleSeparator,
                  tokenModifiers: 0,
                });
              }

              pushTokensWithUnderscores(
                fullUtil,
                expectsSeparator ? wordOffset + 1 : wordOffset,
                isAlias
                  ? semanticTokenIndexes.mapleAlias
                  : semanticTokenIndexes.mapleUtility,
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

            const sepPos = document.positionAt(wordOffset);
            tokens.push({
              line: sepPos.line,
              character: sepPos.character,
              length: 1,
              tokenType: semanticTokenIndexes.mapleSeparator,
              tokenModifiers: 0,
            });

            const rawUtilVal = currentClassName.substring(othersLength + 1);
            if (parsed.utilKey?.startsWith('--alias-')) {
              const subParsed = parseClass(rawUtilVal);
              if (subParsed) {
                processClassTokens(rawUtilVal, wordOffset + 1, subParsed);
              } else {
                pushTokensWithUnderscores(
                  rawUtilVal,
                  wordOffset + 1,
                  semanticTokenIndexes.mapleValue,
                );
              }
            } else {
              pushTokensWithUnderscores(
                rawUtilVal,
                wordOffset + 1,
                semanticTokenIndexes.mapleValue,
              );
            }
          }
        };

        processClassTokens(className, currentClassNameOffset, parsedClass);
      }
    }

    // SemanticTokensBuilder strictly requires tokens to be pushed in sorted order (line, character)
    tokens.sort((a, b) => {
      if (a.line === b.line) {
        return a.character - b.character;
      }
      return a.line - b.line;
    });

    for (const t of tokens) {
      builder.push(
        t.line,
        t.character,
        t.length,
        t.tokenType,
        t.tokenModifiers,
      );
    }

    return builder.build();
  }
}
