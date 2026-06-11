import * as vscode from "vscode";
import { coco } from "@f12io/coco";
import { buildRule } from "@f12io/maple";
import {
  extractAllClasses,
  MAPLE_CLASS_REGEX,
} from "../helpers/class-extractor";
import { isExtensionEnabled } from "../helpers/config";
import {
  cocoWithResolver,
  colorPrefixes,
  findNamedColorAndTone,
} from "../helpers/color-helpers";

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
        const rule = buildRule(word);
        if (!rule || !rule.parsed) continue;

        const prefix = rule.parsed.utilKey;
        const value = rule.parsed.utilVal;

        if (prefix && value) {
          if (colorPrefixes.includes(prefix)) {
            if (
              (prefix === "bgimg" || prefix === "bg") &&
              value.includes("|")
            ) {
              let argsString = value;
              const doubleUnderscoreIdx = value.indexOf("__");
              if (doubleUnderscoreIdx !== -1) {
                argsString = value.substring(0, doubleUnderscoreIdx);
              }

              const args = argsString.split("|");
              let currentOffset =
                instance.start + wordMatch.index + word.lastIndexOf(value);

              for (const arg of args) {
                const argParts = arg.split("_");
                let colorPart = argParts[0];

                if (colorPart.startsWith("[") && colorPart.endsWith("]")) {
                  colorPart = colorPart.substring(1, colorPart.length - 1);
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

                    const startPos = document.positionAt(currentOffset);
                    const endPos = document.positionAt(
                      currentOffset + argParts[0].length,
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
              if (colorStr.startsWith("[") && colorStr.endsWith("]")) {
                colorStr = colorStr.substring(1, colorStr.length - 1);
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
                  const absIndex =
                    instance.start + wordMatch.index + word.lastIndexOf(value);

                  const startPos = document.positionAt(absIndex);
                  const endPos = document.positionAt(absIndex + value.length);

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

    if (namedStr) {
      formats.push(namedStr);
    }
    formats.push(`[${hexStr}]`);
    formats.push(`[${rgbaStr}]`);

    return formats.map((f) => {
      const presentation = new vscode.ColorPresentation(f);
      presentation.textEdit = new vscode.TextEdit(context.range, f);
      return presentation;
    });
  }
}
