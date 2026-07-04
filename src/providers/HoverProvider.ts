import { convert, parseClass, StringHelper } from '@f12io/maple';
// The standalone build with an explicit plugin keeps prettier bundler-friendly
// (the default entry resolves its parsers dynamically at runtime).
import * as postcssPlugin from 'prettier/plugins/postcss';
import * as prettier from 'prettier/standalone';
import * as vscode from 'vscode';
import {
  getParamSubstituteRegex,
  PARAM_FALLBACK_REGEX,
  PARAM_REMOVE_REGEX,
} from '../constants/regex';
import { AliasCache } from '../helpers/alias-cache';
import { isExtensionEnabled, isFeatureEnabled } from '../helpers/config';
import { isFileExcluded } from '../helpers/exclude';
import {
  getAliasName,
  isAliasMarker,
  parseMapleToken,
} from '../helpers/maple-parser';
import { logError } from '../helpers/logger';
import { LanguageServiceRegistry } from '../services/LanguageServiceRegistry';

function formatCss(css: string): Promise<string> {
  return prettier.format(css, {
    parser: 'css',
    plugins: [postcssPlugin],
    printWidth: 80,
    tabWidth: 2,
    useTabs: false,
  });
}

export class MapleHoverProvider implements vscode.HoverProvider {
  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
  ): Promise<vscode.Hover | null> {
    try {
      return await this.doProvideHover(document, position, token);
    } catch (error) {
      logError('hover', error);
      return null;
    }
  }

  private async doProvideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken,
  ): Promise<vscode.Hover | null> {
    if (
      !isExtensionEnabled(document) ||
      isFileExcluded(document.uri) ||
      !isFeatureEnabled('hoverHelp')
    )
      return null;

    const documentText = document.getText();
    const offset = document.offsetAt(position);

    const languageService =
      LanguageServiceRegistry.getServiceForDocument(document);
    if (!languageService) return null;
    const instances = languageService.extractClasses(documentText);
    const currentInstance = instances.find(
      (inst) => offset >= inst.start && offset <= inst.end,
    );

    if (!currentInstance) return null;

    // Token-based lookup splits on all whitespace (not just spaces), so words
    // in multi-line class attributes don't drag newlines into the maple engine
    let word = '';
    for (const token of languageService.tokenizeClassesWithIndices(
      currentInstance.value,
    )) {
      const wStart = currentInstance.start + token.start;
      const wEnd = currentInstance.start + token.end;
      if (offset >= wStart && offset <= wEnd) {
        word = token.value;
        break;
      }
    }

    if (!word) return null;

    // Show the CSS for what the framework renders, not the source escape
    // (e.g. Razor renders @@md:p-2 as @md:p-2)
    word = languageService.getRenderedClassText(word);

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
              PARAM_FALLBACK_REGEX,
              '$1',
            );
            // Remove remaining missing parameters
            substitutedUtil = substitutedUtil.replace(PARAM_REMOVE_REGEX, '');

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
              const formattedCss = await formatCss(expandedCss);
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
        const formattedCss = await formatCss(css);
        markdown.appendCodeblock(formattedCss, 'css');
      } catch (ignoreError) {
        markdown.appendCodeblock(css, 'css');
      }

      return new vscode.Hover(markdown);
    }

    return null;
  }
}
