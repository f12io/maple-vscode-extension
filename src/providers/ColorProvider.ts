import { coco } from "@f12io/coco";
import {
  buildRule,
  COLOR_MAX_TONE,
  COLOR_MIN_TONE,
  REGEX_COLOR_TOKEN,
  REGEX_RESERVED_KEYWORDS,
} from "@f12io/maple";
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
    const oklchStrRaw = coco(rgbaStr, "oklch");
    const oklchStr = oklchStrRaw ? oklchStrRaw.replace(/ /g, "_") : "";

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

    let canUseNamedColor = false;
    let operatorChar = "";

    if (isSurroundedByBrackets && startOffset > 1) {
      operatorChar = context.document.getText(
        new vscode.Range(
          context.document.positionAt(startOffset - 2),
          context.document.positionAt(startOffset - 1),
        ),
      );
    } else if (!isSurroundedByBrackets && startOffset > 0) {
      operatorChar = context.document.getText(
        new vscode.Range(
          context.document.positionAt(startOffset - 1),
          context.document.positionAt(startOffset),
        ),
      );
    }

    if (
      operatorChar === "-" ||
      operatorChar === "_" ||
      operatorChar === "|" ||
      operatorChar === "("
    ) {
      canUseNamedColor = true;
    }

    const originalText = context.document.getText(context.range);
    const innerText =
      originalText.startsWith("[") && originalText.endsWith("]")
        ? originalText.substring(1, originalText.length - 1)
        : originalText;

    let preferredFormat = "named";
    if (innerText.startsWith("oklch")) preferredFormat = "oklch";
    else if (innerText.startsWith("rgb") || innerText.startsWith("rgba"))
      preferredFormat = "rgb";
    else if (innerText.startsWith("#")) preferredFormat = "hex";

    const colorLabels = {
      named: namedStr,
      oklch: oklchStr,
      rgb: rgbaStr,
      hex: hexStr,
    };

    const orderedFormats: (keyof typeof colorLabels)[] = [];

    // Push the preferred format first
    if (preferredFormat === "named" && namedStr && canUseNamedColor) {
      orderedFormats.push("named");
    } else if (preferredFormat === "oklch" && oklchStr) {
      orderedFormats.push("oklch");
    } else if (preferredFormat === "rgb") {
      orderedFormats.push("rgb");
    } else if (preferredFormat === "hex") {
      orderedFormats.push("hex");
    }

    // Then push the rest
    if (preferredFormat !== "named" && namedStr && canUseNamedColor) {
      orderedFormats.push("named");
    }
    if (preferredFormat !== "oklch" && oklchStr) {
      orderedFormats.push("oklch");
    }
    if (preferredFormat !== "rgb") {
      orderedFormats.push("rgb");
    }
    if (preferredFormat !== "hex") {
      orderedFormats.push("hex");
    }

    return orderedFormats.map((formatName) => {
      const label = colorLabels[formatName]!;
      // Non-named colors are always wrapped in brackets for the actual text edit to ensure CSS/Maple validity
      const textToInsert = formatName === "named" ? label : `[${label}]`;

      const presentation = new vscode.ColorPresentation(label);
      presentation.textEdit = new vscode.TextEdit(editRange, textToInsert);
      return presentation;
    });
  }
}

function isValidColorTone(colorStr: string): boolean {
  if (colorStr.startsWith("[") && colorStr.endsWith("]")) return true;

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
      const processTokens = (valueStr: string, absoluteOffset: number) => {
        const tokens = tokenizeRespectingBracketsAndParens(valueStr);
        for (const token of tokens) {
          const colorPart = token.part;
          const tokenAbsoluteOffset = absoluteOffset + token.offset;

          if (colorPart.startsWith("[") && colorPart.endsWith("]")) {
            const innerContent = colorPart.substring(1, colorPart.length - 1);
            processTokens(innerContent, tokenAbsoluteOffset + 1);
          } else {
            if (!isValidColorTone(colorPart)) continue;

            const rgbString = cocoWithResolver(
              colorPart.replace(/_/g, " "),
              "rgb",
            );
            if (rgbString) {
              const rgbMatch = rgbString.match(
                /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/,
              );
              if (rgbMatch) {
                const r = parseFloat(rgbMatch[1]) / 255;
                const g = parseFloat(rgbMatch[2]) / 255;
                const b = parseFloat(rgbMatch[3]) / 255;
                const a = rgbMatch[4] ? parseFloat(rgbMatch[4]) : 1;

                const startPos = document.positionAt(tokenAbsoluteOffset);
                const endPos = document.positionAt(
                  tokenAbsoluteOffset + colorPart.length,
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
      };

      processTokens(value, absoluteIndex + utilStr.lastIndexOf(value));
    }
  }
}

function tokenizeRespectingBracketsAndParens(
  str: string,
): { part: string; offset: number }[] {
  const parts: { part: string; offset: number }[] = [];
  let currentPart = "";
  let currentOffset = 0;
  let bracketDepth = 0;
  let parenDepth = 0;

  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (char === "[") {
      bracketDepth++;
      if (currentPart === "") currentOffset = i;
      currentPart += char;
    } else if (char === "]") {
      bracketDepth = Math.max(0, bracketDepth - 1);
      if (currentPart === "") currentOffset = i;
      currentPart += char;
    } else if (char === "(") {
      parenDepth++;
      if (currentPart === "") currentOffset = i;
      currentPart += char;
    } else if (char === ")") {
      parenDepth = Math.max(0, parenDepth - 1);
      if (currentPart === "") currentOffset = i;
      currentPart += char;
    } else if (
      (char === "_" || char === "|" || char === ",") &&
      bracketDepth === 0 &&
      parenDepth === 0
    ) {
      if (currentPart) {
        parts.push({ part: currentPart, offset: currentOffset });
      }
      currentPart = "";
      currentOffset = i + 1;
    } else {
      if (currentPart === "") currentOffset = i;
      currentPart += char;
    }
  }
  if (currentPart) {
    parts.push({ part: currentPart, offset: currentOffset });
  }
  return parts;
}
