import { convert, parseClass, StringHelper } from '@f12io/maple';
import * as prettier from 'prettier';
import * as vscode from 'vscode';
import {
  getParamFallbackRegex,
  getParamRemoveRegex,
  getParamSubstituteRegex,
} from '../constants/regex';
import { AliasCache } from '../helpers/alias-cache';
import { extractAllClasses } from '../helpers/class-extractor';
import { isExtensionEnabled, isFeatureEnabled } from '../helpers/config';
import { isFileExcluded } from '../helpers/exclude';
import {
  getAliasName,
  isAliasMarker,
  parseMapleToken,
} from '../helpers/maple-parser';

export class MapleHoverProvider implements vscode.HoverProvider {
  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
  ): Promise<vscode.Hover | null> {
    if (
      !isExtensionEnabled() ||
      isFileExcluded(document.uri) ||
      !isFeatureEnabled('hoverHelp')
    )
      return null;

    const documentText = document.getText();
    const offset = document.offsetAt(position);

    const instances = extractAllClasses(documentText);
    const currentInstance = instances.find(
      (inst) => offset >= inst.start && offset <= inst.end,
    );

    if (!currentInstance) return null;

    const words = StringHelper.split(currentInstance.value, ' ');
    let currentWordStart = currentInstance.start;
    let word = '';

    for (const w of words) {
      // Find the actual start index of this word within the attribute string
      // handling potential multiple spaces
      const wStart =
        currentInstance.value.indexOf(
          w,
          currentWordStart - currentInstance.start,
        ) + currentInstance.start;
      const wEnd = wStart + w.length;

      if (offset >= wStart && offset <= wEnd) {
        word = w;
        break;
      }
      currentWordStart = wEnd;
    }

    if (!word) return null;

    // 1. Try to parse the class to separate prefixes from the core utility
    const { activeWord, isMapleIntent, prefixes } = parseMapleToken(word);

    if (isMapleIntent) {
      const unescapedWord = activeWord.replace(/\\/g, '');
      const rawAliasBase = unescapedWord
        .replace(/=$/, '')
        .replace(/\(.*\)$/, '');

      // Check if it's an alias
      if (isAliasMarker(rawAliasBase)) {
        const aliasName = getAliasName(rawAliasBase);
        const customAliases = AliasCache.getAliases(document.uri);

        if (customAliases.has(aliasName)) {
          const aliasExpansion = customAliases.get(aliasName)!;
          const utilities = aliasExpansion.split(';');

          // Parse parameters
          // Parse parameters. parseMapleToken might append '=' at the end of activeWord, so we strip it.
          const unescapedWordWithoutEqual = unescapedWord.replace(/=$/, '');
          const paramsMatch = /\((.*)\)$/.exec(unescapedWordWithoutEqual);
          const paramsMap = new Map<string, string>();

          if (paramsMatch) {
            const paramStrings = StringHelper.split(paramsMatch[1], ',');
            paramStrings.forEach((pStr, idx) => {
              const colonIdx = pStr.indexOf(':');
              if (colonIdx !== -1) {
                paramsMap.set(
                  pStr.substring(0, colonIdx),
                  pStr.substring(colonIdx + 1),
                );
              } else {
                paramsMap.set(idx.toString(), pStr);
              }
            });
          }

          // Re-attach original prefixes (e.g. "@dark:^hover:")
          const prefix = prefixes.length > 0 ? prefixes.join(':') + ':' : '';

          let expandedCss = '';
          const expandedUtils: Array<string> = [];

          for (const util of utilities) {
            if (!util) continue;

            // Substitute parameters
            let substitutedUtil = util;
            for (const [key, val] of paramsMap.entries()) {
              const regex = getParamSubstituteRegex(key);
              substitutedUtil = substitutedUtil.replace(regex, () => val);
            }
            // Fallback for missing parameters that have a default value
            substitutedUtil = substitutedUtil.replace(
              getParamFallbackRegex(),
              '$1',
            );
            // Remove remaining missing parameters
            substitutedUtil = substitutedUtil.replace(
              getParamRemoveRegex(),
              '',
            );

            const fullUtil = prefix + substitutedUtil;
            expandedUtils.push(fullUtil);
            let css = convert(fullUtil);
            if (css) {
              const parsedTarget = parseClass(fullUtil);
              const parsedSource = parseClass(word);
              const targetSelector = parsedTarget?.srcSel;
              const originalSelector = parsedSource?.srcSel;
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
