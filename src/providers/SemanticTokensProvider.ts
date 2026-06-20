import { BUILTIN_ALIASES, convert, parseClass } from "@f12io/maple";
import * as vscode from "vscode";
import { AliasCache } from "../helpers/alias-cache";
import {
  extractAllClasses,
  MAPLE_CLASS_REGEX,
} from "../helpers/class-extractor";
import { isExtensionEnabled } from "../helpers/config";
import { getUtilKey } from "../helpers/get-util-key";

export const tokenTypes = [
  "maple-mediaQuery",
  "maple-utility",
  "maple-value",
  "maple-parent-selector",
  "maple-self-selector",
  "maple-child-selector",
  "maple-selector-operator",
  "maple-separator",
  "maple-underscore",
  "maple-alias",
  "maple-variable",
  "maple-important",
];

export const tokenModifiers: string[] = [];
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
};

// Cache to prevent re-compiling unmodified classes on every keystroke
const convertCache = new Map<string, boolean>();

export class MapleSemanticTokensProvider
  implements vscode.DocumentSemanticTokensProvider
{
  provideDocumentSemanticTokens(
    document: vscode.TextDocument,
    token: vscode.CancellationToken,
  ): vscode.ProviderResult<vscode.SemanticTokens> {
    if (!isExtensionEnabled())
      return new vscode.SemanticTokensBuilder(semanticTokensLegend).build();

    const builder = new vscode.SemanticTokensBuilder(semanticTokensLegend);
    const text = document.getText();
    const matches = extractAllClasses(text);

    const tokens: {
      line: number;
      character: number;
      length: number;
      tokenType: number;
      tokenModifiers: number;
    }[] = [];

    for (const instance of matches) {
      let classStr = instance.value;
      let match;
      // Need to import MAPLE_CLASS_REGEX from class-extractor! Let's make sure it's imported at the top.
      while ((match = MAPLE_CLASS_REGEX.exec(classStr)) !== null) {
        let className = match[0];
        let currentClassNameOffset = instance.start + match.index;
        const startPos = document.positionAt(currentClassNameOffset);

        if (className.startsWith("--alias-")) {
          const equalsIndex = className.indexOf("=");
          if (equalsIndex !== -1) {
            tokens.push({
              line: startPos.line,
              character: startPos.character,
              length: equalsIndex,
              tokenType: semanticTokenIndexes.mapleAlias,
              tokenModifiers: 0,
            });

            // let's highlight the '=' as mapleSeparator
            const eqPos = document.positionAt(
              currentClassNameOffset + equalsIndex,
            );
            tokens.push({
              line: eqPos.line,
              character: eqPos.character,
              length: 1,
              tokenType: semanticTokenIndexes.mapleSeparator,
              tokenModifiers: 0,
            });

            className = className.substring(equalsIndex + 1);
            currentClassNameOffset += equalsIndex + 1;
            if (className.length === 0) continue;
          } else {
            tokens.push({
              line: startPos.line,
              character: startPos.character,
              length: className.length,
              tokenType: semanticTokenIndexes.mapleAlias,
              tokenModifiers: 0,
            });
            continue;
          }
        } else if (className.startsWith("--")) {
          const equalsIndex = className.indexOf("=");
          if (equalsIndex !== -1) {
            tokens.push({
              line: startPos.line,
              character: startPos.character,
              length: equalsIndex,
              tokenType: semanticTokenIndexes.mapleVariable,
              tokenModifiers: 0,
            });

            const eqPos = document.positionAt(
              currentClassNameOffset + equalsIndex,
            );
            tokens.push({
              line: eqPos.line,
              character: eqPos.character,
              length: 1,
              tokenType: semanticTokenIndexes.mapleSeparator,
              tokenModifiers: 0,
            });

            const valuePart = className.substring(equalsIndex + 1);
            if (valuePart.length > 0) {
              const valuePos = document.positionAt(
                currentClassNameOffset + equalsIndex + 1,
              );
              tokens.push({
                line: valuePos.line,
                character: valuePos.character,
                length: valuePart.length,
                tokenType: semanticTokenIndexes.mapleValue,
                tokenModifiers: 0,
              });
            }
          } else {
            tokens.push({
              line: startPos.line,
              character: startPos.character,
              length: className.length,
              tokenType: semanticTokenIndexes.mapleVariable,
              tokenModifiers: 0,
            });
          }
          continue;
        }

        const parsedClass = parseClass(className);
        if (!parsedClass) continue;

        const srcClass = parsedClass.srcClass || className;
        let mediaQuery = "";
        let parentSel = "";
        let selfSel = "";
        let childSel = "";
        let utilKey = "";

        if (parsedClass.mediaQuery) mediaQuery = `${parsedClass.mediaQuery}:`;
        if (parsedClass.parentSel) parentSel = `^${parsedClass.parentSel.replace(/ /g, "_")}`;
        if (parsedClass.selfSel) selfSel = `&${parsedClass.selfSel.replace(/ /g, "_")}`;
        if (parsedClass.childSel) childSel = `/${parsedClass.childSel.replace(/ /g, "_")}`;

        const importantOffset = parsedClass.isImportant ? 1 : 0;
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
        const rawUtilString = className.substring(rawUtilStart);
        const rawAliasBase = rawUtilString.replace(/\(.*\)$/, "");
        const fullAliasName = rawAliasBase.startsWith("@") ? rawAliasBase.substring(1) : rawAliasBase;

        let isAlias = false;
        
        if (
          rawAliasBase.startsWith("@") &&
          AliasCache.getAliases(document.uri).has(fullAliasName)
        ) {
          isAlias = true;
          parsedClass.utilKey = rawUtilString;
          parsedClass.utilOp = undefined as any;
          parsedClass.utilVal = "";
        } else if (BUILTIN_ALIASES[fullAliasName]) {
          isAlias = true;
          parsedClass.utilKey = rawUtilString;
          parsedClass.utilOp = undefined as any;
          parsedClass.utilVal = "";
        } else {
          let coreUtil = parsedClass.utilKey || "";
          const aliasName = coreUtil.startsWith("@")
            ? coreUtil.substring(1)
            : coreUtil;

          if (
            coreUtil.startsWith("@") &&
            AliasCache.getAliases(document.uri).has(aliasName) &&
            !parsedClass.utilVal
          ) {
            isAlias = true;
          } else if (BUILTIN_ALIASES[aliasName] && !parsedClass.utilVal) {
            isAlias = true;
          }
        }

        if (parsedClass.utilOp === "-" && !parsedClass.utilVal?.startsWith("[") && parsedClass.utilVal?.includes("_!important")) {
          continue;
        }

        let isConverted = convertCache.get(className);
        if (isConverted === undefined) {
          isConverted = !!convert(className);
          if (convertCache.size > 5000) {
            const firstKey = convertCache.keys().next().value;
            if (firstKey !== undefined) convertCache.delete(firstKey);
          }
          convertCache.set(className, isConverted);
        }

        if (!isConverted && !isAlias) {
          continue;
        }

        if (parsedClass.isImportant) {
          tokens.push({
            line: startPos.line,
            character: startPos.character,
            length: 1,
            tokenType: semanticTokenIndexes.mapleImportant,
            tokenModifiers: 0,
          });
        }

        if (parsedClass.mediaQuery) {
          mediaQuery = `${parsedClass.mediaQuery}:`;
          const relativeOffset = srcClass.indexOf(mediaQuery);
          if (relativeOffset !== -1) {
            const wordOffset = currentClassNameOffset + relativeOffset;
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
          let currentOffset = startOffset;
          const parts = str.split(/(_)/);
          for (const part of parts) {
            if (part.length === 0) continue;
            const pos = document.positionAt(currentOffset);
            if (part === "_") {
              tokens.push({
                line: pos.line,
                character: pos.character,
                length: 1,
                tokenType: semanticTokenIndexes.mapleUnderscore,
                tokenModifiers: 0,
              });
            } else if (part === "!important") {
              tokens.push({
                line: pos.line,
                character: pos.character,
                length: part.length,
                tokenType: semanticTokenIndexes.mapleImportant,
                tokenModifiers: 0,
              });
            } else if (part === "!important]") {
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
            currentOffset += part.length;
          }
        };

        if (parsedClass.parentSel) {
          parentSel = `^${parsedClass.parentSel.replace(/ /g, "_")}`;
          const relativeOffset = srcClass.indexOf(parentSel);
          if (relativeOffset !== -1) {
            const wordOffset = currentClassNameOffset + relativeOffset;
            const pos = document.positionAt(wordOffset);

            tokens.push({
              line: pos.line,
              character: pos.character,
              length: 1,
              tokenType: semanticTokenIndexes.mapleSelectorOperator,
              tokenModifiers: 0,
            });

            pushTokensWithUnderscores(
              parsedClass.parentSel.replace(/ /g, "_"),
              wordOffset + 1,
              semanticTokenIndexes.mapleParentSelector,
            );
          }
        }

        if (parsedClass.selfSel) {
          selfSel = `&${parsedClass.selfSel.replace(/ /g, "_")}`;
          const relativeOffset = srcClass.indexOf(selfSel);
          if (relativeOffset !== -1) {
            const wordOffset = currentClassNameOffset + relativeOffset;
            const pos = document.positionAt(wordOffset);

            tokens.push({
              line: pos.line,
              character: pos.character,
              length: 1,
              tokenType: semanticTokenIndexes.mapleSelectorOperator,
              tokenModifiers: 0,
            });

            pushTokensWithUnderscores(
              parsedClass.selfSel.replace(/ /g, "_"),
              wordOffset + 1,
              semanticTokenIndexes.mapleSelfSelector,
            );
          }
        }

        if (parsedClass.childSel) {
          childSel = `/${parsedClass.childSel.replace(/ /g, "_")}`;
          const relativeOffset = srcClass.indexOf(childSel);
          if (relativeOffset !== -1) {
            const wordOffset = currentClassNameOffset + relativeOffset;
            const pos = document.positionAt(wordOffset);

            tokens.push({
              line: pos.line,
              character: pos.character,
              length: 1,
              tokenType: semanticTokenIndexes.mapleSelectorOperator,
              tokenModifiers: 0,
            });

            pushTokensWithUnderscores(
              parsedClass.childSel.replace(/ /g, "_"),
              wordOffset + 1,
              semanticTokenIndexes.mapleChildSelector,
            );
          }
        }

        if (parsedClass.utilKey) {
          const util = getUtilKey(parsedClass);
          if (util) {
            const importantOffset = parsedClass.isImportant ? 1 : 0;
            const othersLength =
              mediaQuery.length +
              parentSel.length +
              selfSel.length +
              childSel.length +
              importantOffset;

            const expectsSeparator =
              othersLength > 0 &&
              othersLength !== mediaQuery.length + importantOffset;

            utilKey = `${expectsSeparator ? ":" : ""}${util}`;
            const wordOffset = currentClassNameOffset + othersLength;

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
              util,
              expectsSeparator ? wordOffset + 1 : wordOffset,
              isAlias
                ? semanticTokenIndexes.mapleAlias
                : semanticTokenIndexes.mapleUtility,
            );
          }
        }

        if (parsedClass.utilVal) {
          const othersLength =
            mediaQuery.length +
            parentSel.length +
            selfSel.length +
            childSel.length +
            utilKey.length +
            (parsedClass.isImportant ? 1 : 0);
          const wordOffset = currentClassNameOffset + othersLength;

          const sepPos = document.positionAt(wordOffset);
          tokens.push({
            line: sepPos.line,
            character: sepPos.character,
            length: 1,
            tokenType: semanticTokenIndexes.mapleSeparator,
            tokenModifiers: 0,
          });

          const rawUtilVal = className.substring(othersLength + 1);
          pushTokensWithUnderscores(
            rawUtilVal,
            wordOffset + 1,
            semanticTokenIndexes.mapleValue,
          );
        }
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
