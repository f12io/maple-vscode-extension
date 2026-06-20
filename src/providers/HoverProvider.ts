import { convert, parseClass } from "@f12io/maple";
import * as prettier from "prettier";
import * as vscode from "vscode";
import { AliasCache } from "../helpers/alias-cache";
import { MAPLE_CLASS_REGEX_NON_GLOBAL } from "../helpers/class-extractor";
import { isExtensionEnabled } from "../helpers/config";

export class MapleHoverProvider implements vscode.HoverProvider {
  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
  ): Promise<vscode.Hover | null> {
    if (!isExtensionEnabled()) return null;

    const range = document.getWordRangeAtPosition(
      position,
      MAPLE_CLASS_REGEX_NON_GLOBAL,
    );
    if (!range) return null;

    let word = document.getText(range);

    // MAPLE_CLASS_REGEX is greedy and might capture HTML brackets/quotes (e.g. `bgc-red"><!`).
    // Split the captured string by quotes and whitespace to isolate the specific token under the cursor.
    const cursorOffsetInWord = position.character - range.start.character;
    const tokens = word.split(/(["'\s])/);
    let currentOffset = 0;
    for (const token of tokens) {
      const start = currentOffset;
      const end = currentOffset + token.length;
      if (cursorOffsetInWord >= start && cursorOffsetInWord <= end) {
        if (token !== '"' && token !== "'" && token.trim() !== "") {
          word = token;
        }
        break;
      }
      currentOffset = end;
    }
    
    // Strip trailing HTML characters if it still bled (e.g. `bgc-red>`)
    word = word.replace(/[><]+$/, "").replace(/<![\-]*$/, "");

    // 1. Try to parse the class to separate prefixes from the core utility
    const parsedClass = parseClass(word);
    if (parsedClass) {
      let coreUtil = parsedClass.utilKey || "";

      // Check if it's an alias
      if (coreUtil.startsWith("@")) {
        const aliasName = coreUtil.substring(1);
        const customAliases = AliasCache.getAliases(document.uri);

        if (customAliases.has(aliasName)) {
          const aliasExpansion = customAliases.get(aliasName)!;
          const utilities = aliasExpansion.split(";");
          
          // Re-attach original prefixes (e.g. "@dark:^hover:")
          const srcClass = parsedClass.srcClass || word;
          const prefixEndIdx = srcClass.lastIndexOf(coreUtil);
          const prefix = prefixEndIdx > 0 ? srcClass.substring(0, prefixEndIdx) : "";

          let expandedCss = "";
          const expandedUtils: string[] = [];

          for (const util of utilities) {
            if (!util) continue;
            const fullUtil = prefix + util;
            expandedUtils.push(fullUtil);
            let css = convert(fullUtil);
            if (css) {
              const targetSelector = parseClass(fullUtil)?.srcSel;
              const originalSelector = parsedClass.srcSel;
              if (targetSelector && originalSelector) {
                css = css.split(targetSelector).join(originalSelector);
              }
              expandedCss += css + "\n";
            }
          }

          const markdown = new vscode.MarkdownString();
          markdown.appendMarkdown(
            `**Custom Maple Alias**\n\nExpands to: \`${expandedUtils.join(" ")}\``,
          );

          if (expandedCss) {
            try {
              const formattedCss = await prettier.format(expandedCss, {
                parser: "css",
                printWidth: 80,
                tabWidth: 2,
                useTabs: false,
              });
              markdown.appendCodeblock(formattedCss, "css");
            } catch (e) {
              markdown.appendCodeblock(expandedCss, "css");
            }
          }

          return new vscode.Hover(markdown);
        }
      }
    }

    // 2. Standard class handling
    const css = convert(word);
    if (css) {
      const markdown = new vscode.MarkdownString();

        try {
          const formattedCss = await prettier.format(css, {
            parser: "css",
            printWidth: 80,
            tabWidth: 2,
            useTabs: false,
          });
          markdown.appendCodeblock(formattedCss, "css");
        } catch (e) {
          markdown.appendCodeblock(css, "css");
        }

      return new vscode.Hover(markdown);
    }

    return null;
  }
}
