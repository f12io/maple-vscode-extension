import {
  getCompletions,
  type MapleCompletion,
  type MapleCompletionKind,
} from '@f12io/maple-language-core';
import * as vscode from 'vscode';
import { AliasCache } from '../helpers/alias-cache';
import { isExtensionEnabled, isFeatureEnabled } from '../helpers/config';
import { isFileExcluded } from '../helpers/exclude';
import { safeRun } from '../helpers/logger';
import { LanguageServiceRegistry } from '../services/LanguageServiceRegistry';

const ITEM_KINDS: Record<MapleCompletionKind, vscode.CompletionItemKind> = {
  property: vscode.CompletionItemKind.Property,
  value: vscode.CompletionItemKind.Value,
  color: vscode.CompletionItemKind.Color,
  variable: vscode.CompletionItemKind.Variable,
  alias: vscode.CompletionItemKind.Keyword,
  localAlias: vscode.CompletionItemKind.Keyword,
  pseudo: vscode.CompletionItemKind.Keyword,
  mediaQuery: vscode.CompletionItemKind.Keyword,
  aliasDefinition: vscode.CompletionItemKind.Keyword,
};

function toCompletionItem(
  completion: MapleCompletion,
  document: vscode.TextDocument,
): vscode.CompletionItem {
  const item = new vscode.CompletionItem(
    completion.label,
    ITEM_KINDS[completion.kind],
  );

  item.insertText = completion.insertText;
  if (completion.filterText) item.filterText = completion.filterText;
  if (completion.detail) item.detail = completion.detail;
  if (completion.documentation) {
    item.documentation = new vscode.MarkdownString(completion.documentation);
  }
  item.sortText = completion.sortText;

  // An empty span means "insert at the cursor"; leaving the range unset lets
  // VS Code apply its own default.
  if (completion.replaceEnd > completion.replaceStart) {
    item.range = new vscode.Range(
      document.positionAt(completion.replaceStart),
      document.positionAt(completion.replaceEnd),
    );
  }

  return item;
}

export class MapleCompletionProvider implements vscode.CompletionItemProvider {
  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    context: vscode.CompletionContext,
  ): vscode.ProviderResult<
    Array<vscode.CompletionItem> | vscode.CompletionList
  > {
    return safeRun(
      'completion',
      () => this.doProvideCompletionItems(document, position, token, context),
      undefined,
    );
  }

  private doProvideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken,
    _context: vscode.CompletionContext,
  ): vscode.CompletionList | undefined {
    if (
      !isExtensionEnabled(document) ||
      isFileExcluded(document.uri) ||
      !isFeatureEnabled('autoComplete')
    )
      return undefined;

    const completions = getCompletions(
      document.getText(),
      document.offsetAt(position),
      {
        languageId: LanguageServiceRegistry.resolveLanguageId(document),
        localAliases: AliasCache.getAliases(document.uri),
      },
    );

    // `null` means the cursor is not in a maple region at all, which is
    // different from being in one with nothing to suggest.
    if (!completions) return undefined;

    return new vscode.CompletionList(
      completions.map((completion) => toCompletionItem(completion, document)),
      true,
    );
  }
}
