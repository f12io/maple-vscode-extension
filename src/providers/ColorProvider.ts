import { coco } from "@f12io/coco";
import { buildRule } from "@f12io/maple";
import * as vscode from "vscode";
import {
  extractAllClasses,
  MAPLE_CLASS_REGEX,
} from "../helpers/class-extractor";
import {
  cocoWithResolver,
  colorPrefixes,
  findNamedColorAndTone,
} from "../helpers/color-helpers";
import { isExtensionEnabled } from "../helpers/config";

export class MapleColorProvider implements vscode.DocumentColorProvider {
  public provideDocumentColors(
    document: vscode.TextDocument,
    token: vscode.CancellationToken,
  ): vscode.ProviderResult<vscode.ColorInformation[]> {
    if (!isExtensionEnabled()) return [];

    const colors: vscode.ColorInformation[] = [];
    const text = document.getText();
    const classInstances = extractAllClasses(text);

    for (const instance of classInstances) {
      const classValue = instance.value;
      // find all words in classValue
      MAPLE_CLASS_REGEX.lastIndex = 0;
      let wordMatch;
      while ((wordMatch = MAPLE_CLASS_REGEX.exec(classValue))) {
        const word = wordMatch[0];
        const wordOffset = instance.start + wordMatch.index;

        if (word.startsWith("--") && word.includes("=")) {
          const equalsIdx = word.indexOf("=");
          const rightSide = word.substring(equalsIdx + 1);
          const utilities = rightSide.split(";");
          
          let currentOffset = wordOffset + equalsIdx + 1;
          for (const util of utilities) {
            extractColorFromUtility(util, currentOffset, document, colors);
            currentOffset += util.length + 1; // +1 for the ';' character
          }
        } else {
          extractColorFromUtility(word, wordOffset, document, colors);
        }
      }
    }

    return colors;
  }

  public provideColorPresentations(
    color: vscode.Color,
    context: { document: vscode.TextDocument; range: vscode.Range },
    token: vscode.CancellationToken,
  ): vscode.ProviderResult<vscode.ColorPresentation[]> {
    const r = Math.round(color.red * 255);
    const g = Math.round(color.green * 255);
    const b = Math.round(color.blue * 255);
    const a = Math.round(color.alpha * 100);

    // Remove spaces inside rgb/rgba to prevent creating invalid space-separated maple classes
    const rgbaStr =
      color.alpha < 1
        ? `rgba(${r},${g},${b},${color.alpha})`
        : `rgb(${r},${g},${b})`;
    const hex6 = coco(rgbaStr, "hex6") || "";

    const namedResult = findNamedColorAndTone(hex6);
    let namedStr = "";
    if (namedResult) {
      namedStr = namedResult.id;
      if (a < 100) {
        namedStr += `/${a}`;
      }
    }

    const hexStr = coco(rgbaStr, "hex8") || rgbaStr;
    const formats: string[] = [];

    const startOffset = context.document.offsetAt(context.range.start);
    const endOffset = context.document.offsetAt(context.range.end);

    let isSurroundedByBrackets = false;
    if (startOffset > 0 && endOffset < context.document.getText().length) {
      const charBefore = context.document.getText(
        new vscode.Range(
          context.document.positionAt(startOffset - 1),
          context.document.positionAt(startOffset),
        ),
      );
      const charAfter = context.document.getText(
        new vscode.Range(
          context.document.positionAt(endOffset),
          context.document.positionAt(endOffset + 1),
        ),
      );
      if (charBefore === "[" && charAfter === "]") {
        isSurroundedByBrackets = true;
      }
    }

    const editRange = isSurroundedByBrackets
      ? new vscode.Range(
          context.document.positionAt(startOffset - 1),
          context.document.positionAt(endOffset + 1),
        )
      : context.range;

    if (namedStr) {
      formats.push(namedStr);
    }
    formats.push(`[${hexStr}]`);
    formats.push(`[${rgbaStr}]`);

    return formats.map((f) => {
      const presentation = new vscode.ColorPresentation(f);
      presentation.textEdit = new vscode.TextEdit(editRange, f);
      return presentation;
    });
  }
}

function extractColorFromUtility(
  utilStr: string,
  absoluteIndex: number,
  document: vscode.TextDocument,
  colors: vscode.ColorInformation[],
) {
  const rule = buildRule(utilStr);
  if (!rule || !rule.parsed) return;

  const prefix = rule.parsed.utilKey;
  const value = rule.parsed.utilVal;

  if (prefix && value) {
    if (colorPrefixes.includes(prefix)) {
      if ((prefix === "bgimg" || prefix === "bg") && value.includes("|")) {
        let argsString = value;
        const doubleUnderscoreIdx = value.indexOf("__");
        if (doubleUnderscoreIdx !== -1) {
          argsString = value.substring(0, doubleUnderscoreIdx);
        }

        const args = argsString.split("|");
        let currentOffset = absoluteIndex + utilStr.lastIndexOf(value);

        for (const arg of args) {
          const argParts = arg.split("_");
          let colorPart = argParts[0];

          let bracketOffset = 0;
          if (colorPart.startsWith("[") && colorPart.endsWith("]")) {
            colorPart = colorPart.substring(1, colorPart.length - 1);
            bracketOffset = 1;
          }

          let rgbString = cocoWithResolver(colorPart, "rgb");
          if (rgbString) {
            const rgbMatch = rgbString.match(
              /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/,
            );
            if (rgbMatch) {
              const r = parseFloat(rgbMatch[1]) / 255;
              const g = parseFloat(rgbMatch[2]) / 255;
              const b = parseFloat(rgbMatch[3]) / 255;
              const a = rgbMatch[4] ? parseFloat(rgbMatch[4]) : 1;

              const startPos = document.positionAt(
                currentOffset + bracketOffset,
              );
              const endPos = document.positionAt(
                currentOffset + bracketOffset + colorPart.length,
              );

              colors.push(
                new vscode.ColorInformation(
                  new vscode.Range(startPos, endPos),
                  new vscode.Color(r, g, b, a),
                ),
              );
            }
          }
          // Advance offset by arg length + 1 (for the | character)
          currentOffset += arg.length + 1;
        }
      } else {
        let colorStr = value;
        let bracketOffset = 0;
        if (colorStr.startsWith("[") && colorStr.endsWith("]")) {
          colorStr = colorStr.substring(1, colorStr.length - 1);
          bracketOffset = 1;
        }

        // Parse with coco
        let rgbString = cocoWithResolver(colorStr, "rgb");
        if (rgbString) {
          const rgbMatch = rgbString.match(
            /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/,
          );
          if (rgbMatch) {
            const r = parseFloat(rgbMatch[1]) / 255;
            const g = parseFloat(rgbMatch[2]) / 255;
            const b = parseFloat(rgbMatch[3]) / 255;
            const a = rgbMatch[4] ? parseFloat(rgbMatch[4]) : 1;

            // calculate exact range of the color value within the document
            const absIndex = absoluteIndex + utilStr.lastIndexOf(value);

            const startPos = document.positionAt(absIndex + bracketOffset);
            const endPos = document.positionAt(
              absIndex + bracketOffset + colorStr.length,
            );

            colors.push(
              new vscode.ColorInformation(
                new vscode.Range(startPos, endPos),
                new vscode.Color(r, g, b, a),
              ),
            );
          }
        }
      }
    }
  }
}
