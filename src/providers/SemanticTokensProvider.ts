import {
  computeSemanticTokens,
  MAPLE_TOKEN_TYPES,
  type MapleSemanticToken,
  type MapleTokenType,
} from '@f12io/maple-language-core';
import * as vscode from 'vscode';
import { AliasCache } from '../helpers/alias-cache';
import { getHighlightingMode, isExtensionEnabled } from '../helpers/config';
import { isFileExcluded } from '../helpers/exclude';
import { safeRun } from '../helpers/logger';
import { LanguageServiceRegistry } from '../services/LanguageServiceRegistry';

export const tokenTypes = [
  'maple-mediaQuery',
  'maple-utility',
  'maple-value',
  'maple-parent-selector',
  'maple-self-selector',
  'maple-child-selector',
  'maple-selector-operator',
  'maple-separator',
  'maple-underscore',
  'maple-alias',
  'maple-variable',
  'maple-important',
  'maple-alias-param-key',
];

export const tokenModifiers: Array<string> = [];
export const semanticTokensLegend = new vscode.SemanticTokensLegend(
  tokenTypes,
  tokenModifiers,
);

export const semanticTokenIndexes = {
  mapleMediaQuery: 0,
  mapleUtility: 1,
  mapleValue: 2,
  mapleParentSelector: 3,
  mapleSelfSelector: 4,
  mapleChildSelector: 5,
  mapleSelectorOperator: 6,
  mapleSeparator: 7,
  mapleUnderscore: 8,
  mapleAlias: 9,
  mapleVariable: 10,
  mapleImportant: 11,
  mapleAliasParamKey: 12,
};

/**
 * Core's token taxonomy in the order of `tokenTypes`, so a core token type
 * maps straight onto its legend index.
 */
const TOKEN_TYPE_INDEXES: Record<MapleTokenType, number> = Object.fromEntries(
  MAPLE_TOKEN_TYPES.map((type, index) => [type, index]),
) as Record<MapleTokenType, number>;

export function getTokenTypeIndex(type: MapleTokenType): number {
  return TOKEN_TYPE_INDEXES[type];
}

/**
 * Runs core's tokenizer over a document, applying the extension's own gates
 * (enablement, exclusions, highlighting mode) and alias sources. Shared by the
 * semantic tokens provider and the decorations fallback.
 */
export function getDocumentSemanticTokens(
  document: vscode.TextDocument,
): Array<MapleSemanticToken> {
  if (
    !isExtensionEnabled(document) ||
    isFileExcluded(document.uri) ||
    getHighlightingMode() === 'off'
  )
    return [];

  const languageId = LanguageServiceRegistry.resolveLanguageId(document);
  if (!LanguageServiceRegistry.isSupported(languageId)) return [];

  return computeSemanticTokens(document.getText(), {
    languageId,
    localAliases: AliasCache.getAliases(document.uri),
  });
}

export class MapleSemanticTokensProvider
  implements vscode.DocumentSemanticTokensProvider
{
  provideDocumentSemanticTokens(
    document: vscode.TextDocument,
    token: vscode.CancellationToken,
  ): vscode.ProviderResult<vscode.SemanticTokens> {
    return safeRun(
      'semanticTokens',
      () => this.doProvideDocumentSemanticTokens(document, token),
      new vscode.SemanticTokens(new Uint32Array(0)),
    );
  }

  private doProvideDocumentSemanticTokens(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken,
  ): vscode.SemanticTokens {
    const builder = new vscode.SemanticTokensBuilder(semanticTokensLegend);

    // Core returns tokens sorted by offset, which SemanticTokensBuilder
    // requires (it delta-encodes against the previous token).
    for (const token of getDocumentSemanticTokens(document)) {
      const pos = document.positionAt(token.start);
      builder.push(
        pos.line,
        pos.character,
        token.length,
        getTokenTypeIndex(token.type),
        0,
      );
    }

    return builder.build();
  }
}
