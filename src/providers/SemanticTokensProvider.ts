import * as vscode from "vscode";
import { parseClass, convert } from "@f12io/maple";
import {
  extractAllClasses,
  MAPLE_CLASS_REGEX,
} from "../helpers/class-extractor";
import { getUtilKey } from "../helpers/get-util-key";
import { isExtensionEnabled } from "../helpers/config";

export const tokenTypes = [
  "maple-mediaQuery",
  "maple-utility",
  "maple-value",
  "maple-parent-selector",
  "maple-self-selector",
  "maple-child-selector",
  "maple-separator",
  "maple-alias",
  "maple-variable",
  "maple-selector-operator",
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
  mapleSeparator: 6,
  mapleAlias: 7,
  mapleVariable: 8,
  mapleSelectorOperator: 9,
};

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

        const converted = convert(className);
        if (!converted) {
          continue;
        }

        const parsedClass = parseClass(className);
        const srcClass = parsedClass.srcClass || className;
        let mediaQuery = "";
        let parentSel = "";
        let selfSel = "";
        let childSel = "";
        let utilKey = "";

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

        if (parsedClass.parentSel) {
          parentSel = `^${parsedClass.parentSel}`;
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

            const selPos = document.positionAt(wordOffset + 1);
            tokens.push({
              line: selPos.line,
              character: selPos.character,
              length: parsedClass.parentSel.length,
              tokenType: semanticTokenIndexes.mapleParentSelector,
              tokenModifiers: 0,
            });
          }
        }

        if (parsedClass.selfSel) {
          selfSel = `&${parsedClass.selfSel}`;
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

            const selPos = document.positionAt(wordOffset + 1);
            tokens.push({
              line: selPos.line,
              character: selPos.character,
              length: parsedClass.selfSel.length,
              tokenType: semanticTokenIndexes.mapleSelfSelector,
              tokenModifiers: 0,
            });
          }
        }

        if (parsedClass.childSel) {
          childSel = `/${parsedClass.childSel}`;
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

            const selPos = document.positionAt(wordOffset + 1);
            tokens.push({
              line: selPos.line,
              character: selPos.character,
              length: parsedClass.childSel.length,
              tokenType: semanticTokenIndexes.mapleChildSelector,
              tokenModifiers: 0,
            });
          }
        }

        if (parsedClass.utilKey) {
          const util = getUtilKey(parsedClass);
          if (util) {
            // Estimate the start of the util key by adding the lengths of previous parts
            const othersLength =
              mediaQuery.length +
              parentSel.length +
              selfSel.length +
              childSel.length;
            utilKey = `${othersLength && othersLength !== mediaQuery.length ? ":" : ""}${util}`;
            const wordOffset = currentClassNameOffset + othersLength;

            if (othersLength && othersLength !== mediaQuery.length) {
              const sepPos = document.positionAt(wordOffset);
              tokens.push({
                line: sepPos.line,
                character: sepPos.character,
                length: 1,
                tokenType: semanticTokenIndexes.mapleSeparator,
                tokenModifiers: 0,
              });
            }

            const utilPos = document.positionAt(
              othersLength && othersLength !== mediaQuery.length
                ? wordOffset + 1
                : wordOffset,
            );
            tokens.push({
              line: utilPos.line,
              character: utilPos.character,
              length: util.length,
              tokenType: semanticTokenIndexes.mapleUtility,
              tokenModifiers: 0,
            });
          }
        }

        if (parsedClass.utilVal) {
          const othersLength =
            mediaQuery.length +
            parentSel.length +
            selfSel.length +
            childSel.length +
            utilKey.length;
          const wordOffset = currentClassNameOffset + othersLength;

          const sepPos = document.positionAt(wordOffset);
          tokens.push({
            line: sepPos.line,
            character: sepPos.character,
            length: 1,
            tokenType: semanticTokenIndexes.mapleSeparator,
            tokenModifiers: 0,
          });

          const valPos = document.positionAt(wordOffset + 1);
          tokens.push({
            line: valPos.line,
            character: valPos.character,
            length: parsedClass.utilVal.length,
            tokenType: semanticTokenIndexes.mapleValue,
            tokenModifiers: 0,
          });
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
