import { getHoverInfo, type MapleHover } from '@f12io/maple-language-core';
// The standalone build with an explicit plugin keeps prettier bundler-friendly
// (the default entry resolves its parsers dynamically at runtime).
import * as postcssPlugin from 'prettier/plugins/postcss';
import * as prettier from 'prettier/standalone';
import * as vscode from 'vscode';
import { AliasCache } from '../helpers/alias-cache';
import { isExtensionEnabled, isFeatureEnabled } from '../helpers/config';
import { isFileExcluded } from '../helpers/exclude';
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

async function toMarkdown(info: MapleHover): Promise<vscode.MarkdownString> {
  const markdown = new vscode.MarkdownString();

  if (info.alias) {
    markdown.appendMarkdown(
      `**Custom Maple Alias**\n\nExpands to: \`${info.alias.utilities.join(' ')}\``,
    );
  }

  if (info.css) {
    try {
      markdown.appendCodeblock(await formatCss(info.css), 'css');
    } catch (ignoreError) {
      // Prettier chokes on CSS the engine still considers valid; show it raw
      markdown.appendCodeblock(info.css, 'css');
    }
  }

  return markdown;
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

    const info = getHoverInfo(document.getText(), document.offsetAt(position), {
      languageId: LanguageServiceRegistry.resolveLanguageId(document),
      localAliases: AliasCache.getAliases(document.uri),
    });

    if (!info) return null;

    return new vscode.Hover(await toMarkdown(info));
  }
}
