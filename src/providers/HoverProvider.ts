import { convert, parseClass } from '@f12io/maple';
import * as prettier from 'prettier';
import * as vscode from 'vscode';
import { AliasCache } from '../helpers/alias-cache';
import { getExactWordRangeAtPosition } from '../helpers/class-extractor';
import { isExtensionEnabled } from '../helpers/config';
import { getAliasName, isAliasMarker } from '../helpers/maple-parser';

export class MapleHoverProvider implements vscode.HoverProvider {
  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
  ): Promise<vscode.Hover | null> {
    if (!isExtensionEnabled()) return null;

    const exactRange = getExactWordRangeAtPosition(document, position);
    if (!exactRange.wordRange) return null;

    const word = exactRange.currentWord;

    // 1. Try to parse the class to separate prefixes from the core utility
    const parsedClass = parseClass(word);
    if (parsedClass) {
      const coreUtil = parsedClass.utilKey || '';

      // Check if it's an alias
      if (isAliasMarker(coreUtil)) {
        const aliasName = getAliasName(coreUtil);
        const customAliases = AliasCache.getAliases(document.uri);

        if (customAliases.has(aliasName)) {
          const aliasExpansion = customAliases.get(aliasName)!;
          const utilities = aliasExpansion.split(';');

          // Re-attach original prefixes (e.g. "@dark:^hover:")
          const srcClass = parsedClass.srcClass || word;
          const prefixEndIdx = srcClass.lastIndexOf(coreUtil);
          const prefix =
            prefixEndIdx > 0 ? srcClass.substring(0, prefixEndIdx) : '';

          let expandedCss = '';
          const expandedUtils: Array<string> = [];

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
              expandedCss += css + '\n';
            }
          }

          const markdown = new vscode.MarkdownString();
          markdown.appendMarkdown(
            `**Custom Maple Alias**\n\nExpands to: \`${expandedUtils.join(' ')}\``,
          );

          if (expandedCss) {
            try {
              const formattedCss = await prettier.format(expandedCss, {
                parser: 'css',
                printWidth: 80,
                tabWidth: 2,
                useTabs: false,
              });
              markdown.appendCodeblock(formattedCss, 'css');
            } catch (ignoreError) {
              markdown.appendCodeblock(expandedCss, 'css');
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
          parser: 'css',
          printWidth: 80,
          tabWidth: 2,
          useTabs: false,
        });
        markdown.appendCodeblock(formattedCss, 'css');
      } catch (ignoreError) {
        markdown.appendCodeblock(css, 'css');
      }

      return new vscode.Hover(markdown);
    }

    return null;
  }
}
