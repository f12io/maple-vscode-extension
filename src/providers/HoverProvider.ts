import * as vscode from "vscode";
import { MAPLE_CLASS_REGEX_NON_GLOBAL } from "../helpers/class-extractor";
import { convert } from "@f12io/maple";
import * as prettier from "prettier";
import { isExtensionEnabled } from "../helpers/config";
import { parseMapleToken } from "../helpers/maple-parser";
import { AliasCache } from "../helpers/alias-cache";

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

    const word = document.getText(range);

    // Handle custom aliases
    if (word.startsWith("@")) {
      const aliasName = word.substring(1);
      const customAliases = AliasCache.getAliases(document.uri);
      if (customAliases.has(aliasName)) {
        const expansion = customAliases.get(aliasName);
        const markdown = new vscode.MarkdownString();
        markdown.appendMarkdown(
          `**Custom Maple Alias**\n\nExpands to: \`${expansion}\``,
        );
        return new vscode.Hover(markdown);
      }
    }

    // Parse prefixes like @md:hover:bgc-red-500
    let { isMapleIntent } = parseMapleToken(word);

    if (isMapleIntent) {
      // Wait, we need to pass the raw string into convert.
      // If it starts with `--`, it is a css variable, which is valid in maple class strings.
      if (word.startsWith("--")) {
        isMapleIntent = true;
      }

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
    }

    return null;
  }
}
